import type { PgTrace } from "@/lib/db/pgtrace";
import type { WalPage, WalRecord, WalView } from "@/lib/db/views";
import { traceWal } from "@/lib/db/fromTrace";
import { lsn } from "@/components/figures/kit/format";
import { WalRecoveryView, type RecFrame, type RecVariant } from "./WalRecoveryView";
import { align8, oneLine, parseLsn, prov } from "./source";

// server side: one or more crash captures turned into a step-through. before the crash, every
// step of the capture as it ran (records, flush line, the page's pd_lsn in memory and on disk).
// at the crash, the WAL that was on disk from the redo pointer (pg_waldump's list, captured
// right after the kill). then redo, record by record, with the rule postgres uses
// (XLogReadBufferForRedoExtended in xlogutils.c): a block with a full-page image is restored
// from it; otherwise the record is applied only if the page's LSN is older than the record's
// end, else skipped. the page LSNs and records are real; the replay order is that rule applied
// to them, and the server's own "redo starts at / redo done at" lines bracket it. last, what a
// new query saw after the restart.
//
//   <WalRecovery variants={[{ key: "crash", label: "a crash", trace: crash, rel: "notes" }, …]} />

type In = { key: string; label: string; trace: PgTrace; rel: string };

const KEEP_LOG = /interrupted|not properly|redo starts|redo done|invalid record|checkpoint starting: end-of-recovery|ready to accept/;

function build({ key, label, trace, rel }: In): RecVariant {
  const steps = trace.steps;
  const crashAt = steps.findIndex((s) => s.session === "server" && s.sql.startsWith("pg_ctl stop"));
  if (crashAt < 0) throw new Error(`${trace.scenario}: no @crash`);
  const restartAt = crashAt + 1;
  const after = steps.slice(restartAt + 1).find((s) => s.result?.columns.length);
  const page = `${rel}·0`;
  const frames: RecFrame[] = [];

  // the page on disk: its LSN after a checkpoint, or after a step that left its buffer clean or gone
  let disk = steps[0].heap?.[rel]?.[0]?.lsn ?? 0;
  const pagesAt = (i: number): WalPage[] => {
    const st = steps[i];
    const mem = st.heap?.[rel]?.[0]?.lsn ?? disk;
    const frame = st.buffers?.frames.find((f) => f.rel === rel && f.fork === "main" && f.block === 0);
    if (/\bCHECKPOINT\b/i.test(st.sql) || (st.buffers && (!frame || !frame.dirty))) disk = mem;
    return [{ label: page, lsn: mem, disk, dirty: mem !== disk }];
  };

  const tidy = (v: WalView): WalView => {
    const records = v.records.filter((r) => !(r as { volatile?: boolean }).volatile || /CHECKPOINT/.test(r.type));
    // records still in wal_buffers that pg_walinspect never got to read (they died with the
    // server): a dashed block of the right size, so the gap between flush and insert is visible
    const top = records.length ? Math.max(...records.map((r) => align8(r.lsn + r.len))) : v.flush;
    if (v.insert > v.flush && top <= v.flush) records.push({ lsn: v.flush, len: v.insert - v.flush, rmgr: "wal_buffers", type: "unwritten", desc: "not on disk, so not readable" });
    return { ...v, records };
  };

  let base = trace.base.lsn;
  for (let i = 0; i < crashAt; i++) {
    const v = traceWal(trace, i);
    if (!v) continue;
    const pages = pagesAt(i);
    base = Math.min(base, ...pages.map((p) => p.lsn), ...pages.map((p) => p.disk ?? Infinity));
    frames.push({ phase: "run", who: steps[i].session, sql: oneLine(steps[i].sql), note: steps[i].note ?? "", view: { ...tidy(v), pages } });
  }

  // the crash: what's on disk from the redo pointer, plus whatever was lost
  const cs = steps[crashAt];
  const cw = cs.wal!;
  const onDisk: WalRecord[] = cw.records.map((r) => ({ lsn: r.lsn, len: r.len, end: align8(r.lsn + r.len), xid: r.xid, rmgr: r.rmgr, type: r.type, desc: r.desc, blocks: r.blocks }));
  const lastRun = frames[frames.length - 1]?.view;
  const lostFrom = onDisk.length ? onDisk[onDisk.length - 1].end! : cw.flush;
  const lost = (lastRun?.records ?? []).filter((r) => r.lsn >= lostFrom);
  const recs = [...onDisk, ...lost];
  const replay: Record<number, "applied" | "skipped" | "lost"> = {};
  recs.forEach((_, i) => i >= onDisk.length && (replay[i] = "lost"));
  let pg = disk;
  const pageView = (): WalPage[] => [{ label: page, lsn: pg, dirty: pg !== disk }];
  const logAll = steps[restartAt].log ?? [];
  const startLine = logAll.find((l) => l.includes("redo starts at"));
  const doneLine = logAll.find((l) => l.includes("redo done at"));
  if (!startLine || !doneLine) throw new Error(`${trace.scenario}: the restart has no redo lines (use @restart +log)`);
  if (parseLsn(startLine.split("redo starts at ")[1]) !== cw.redo) throw new Error(`${trace.scenario}: redo starts at ${startLine} but the redo pointer was ${lsn(cw.redo)}`);
  const lostBytes = cw.insert - cw.flush;
  const crashView = (extra: Partial<WalView>): WalView => ({ records: recs, insert: cw.insert, flush: cw.flush, redo: cw.redo, checkpoint: cw.checkpoint, base, crashed: true, replay: { ...replay }, pages: pageView(), ...extra });

  frames.push({
    phase: "crash",
    who: "server",
    sql: "pg_ctl stop -m immediate",
    note: `${cs.note ?? ""} on disk: ${onDisk.length} records from the redo pointer on${lostBytes > 0 ? `, and ${lostBytes} bytes of WAL that were only in memory are gone` : ", every one that was written"}. the page file still says pd_lsn ${lsn(disk)}.`,
    view: crashView({}),
  });

  // redo, one record at a time
  const log: string[] = [];
  onDisk.forEach((r, i) => {
    if (r.lsn < cw.redo) return;
    if (!log.length) log.push(startLine);
    const mine = (r.blocks ?? []).filter((b) => `${b.rel}·${b.block}` === page);
    const others = (r.blocks ?? []).filter((b) => `${b.rel}·${b.block}` !== page);
    const what = `${r.rmgr} ${r.type}`;
    let note: string;
    let did: "applied" | "skipped" = "applied";
    if (mine.length) {
      const b = mine[0];
      if (b.fpi) {
        note = `${what} carries a full-page image of ${page}: the page is overwritten with it, whatever the file said, and its LSN becomes ${lsn(r.end!)}.`;
        pg = r.end!;
      } else if (pg < r.end!) {
        note = `${what}: ${page} is at ${lsn(pg)}, older than the record's end (${lsn(r.end!)}), so the change is applied.`;
        pg = r.end!;
      } else {
        did = "skipped";
        note = `${what}: ${page} is already at ${lsn(pg)}, not older than the record's end (${lsn(r.end!)}). the page has this change, so redo skips it.`;
      }
      if (others.length) note += ` it also touches ${others.map((o) => `${o.rel} block ${o.block}`).join(", ")}${others.some((o) => o.fpi) ? ", restored from its image" : ""}.`;
    } else if (others.length) {
      note = `${what} on ${others.map((o) => `${o.rel} block ${o.block}`).join(", ")}${others.some((o) => o.fpi) ? ": restored from the full-page image in the record" : ": applied to that page"}.`;
    } else if (r.rmgr === "Transaction" && r.type === "COMMIT") {
      note = `${what}: no data page. xid ${r.xid} is marked committed in the commit log (pg_xact), and everything it wrote becomes visible.`;
    } else {
      note = `${what}: bookkeeping, no data page to touch.`;
    }
    replay[i] = did;
    frames.push({ phase: "redo", who: "startup", sql: `redo ${what}`, note, view: crashView({ applying: i, replay: { ...replay } }), log: [...log] });
  });
  log.push(doneLine);
  const done = parseLsn(doneLine.split("redo done at ")[1]);
  frames.push({
    phase: "redo",
    who: "startup",
    sql: "redo done",
    note: `redo done at ${lsn(done)}, the start of the last record it could read. ${lostBytes > 0 ? "the records that never reached the disk were never there to replay. " : ""}no undo pass follows: a transaction without a commit record in the log just counts as aborted.`,
    view: crashView({ replay: { ...replay } }),
    log: [...log],
  });

  // after the restart
  const tuples = (after?.heap?.[rel]?.[0]?.tuples ?? [])
    .filter((t) => t.lpFlags === "normal")
    .map((t) => ({ lp: t.lp, xmin: t.xmin ?? 0, status: after?.xact?.[t.xmin ?? 0] ?? "committed", body: Object.values(t.data ?? {}).join(" · ") }));
  frames.push({
    phase: "after",
    who: after?.session ?? "T1",
    sql: oneLine(after?.sql ?? ""),
    note: after?.note ?? "",
    view: crashView({ replay: { ...replay } }),
    log: logAll.filter((l) => KEEP_LOG.test(l)).map((l) => l.replaceAll("<time>", "…")),
    result: after?.result ? { columns: after.result.columns.map((c) => ({ name: c.name, type: c.type })), rows: after.result.data } : undefined,
    tuples,
  });

  // one base for the whole variant, so offsets read the same in every frame
  // base 0: the offsets WalCells prints are then the LSNs themselves, in hex, matching the log
  void base;
  for (const f of frames) f.view.base = 0;
  return { key, label, frames, source: prov(trace) };
}

export function WalRecovery({ variants }: { variants: In[] }) {
  return <WalRecoveryView variants={variants.map(build)} />;
}
