"use client";

import { useMemo } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, ring, tint, useReducedMotion } from "@/components/figures/kit";

// a leveled LSM tree, the textbook shape (O'Neil et al. 1996; RocksDB's leveled compaction),
// small enough to watch: writes go to a sorted memtable; a full memtable is flushed as an
// immutable sorted run (an SSTable) into L0; when L0 holds `l0Max` tables they're merged with
// L1 into new, non-overlapping L1 tables, newest value winning and deletes (tombstones)
// dropped at the bottom. then a read looks newest first: memtable, L0 newest to oldest, L1.
// a model, simplified: one L1, no WAL drawn, tables of `perTable` keys.

type Entry = { k: number; v: string; del?: boolean };
type State = { mem: Entry[]; l0: Entry[][]; l1: Entry[][]; note: string; label: string; hot?: { where: string; k?: number }; read?: string[] };

type Op = { put: number; v: string } | { del: number } | { get: number };

const sortK = (a: Entry, b: Entry) => a.k - b.k;

function run(ops: Op[], memMax: number, l0Max: number, perTable: number): State[] {
  let mem: Entry[] = [];
  let l0: Entry[][] = [];
  let l1: Entry[][] = [];
  const out: State[] = [{ mem: [], l0: [], l1: [], label: "empty", note: "an empty LSM tree: a memtable in memory, and levels of sorted, immutable files on disk." }];
  const snap = (label: string, note: string, hot?: State["hot"], read?: string[]) => out.push({ mem: [...mem], l0: l0.map((t) => [...t]), l1: l1.map((t) => [...t]), label, note, hot, read });
  for (const op of ops) {
    if ("get" in op) {
      const k = op.get;
      const path: string[] = ["mem"];
      let found: Entry | undefined = mem.find((e) => e.k === k);
      let where = "the memtable";
      if (!found)
        for (let i = l0.length - 1; i >= 0; i--) {
          path.push(`l0-${i}`);
          found = l0[i].find((e) => e.k === k);
          if (found) {
            where = `L0 table ${i + 1}`;
            break;
          }
        }
      if (!found) {
        const t = l1.findIndex((tb) => tb.length && k >= tb[0].k && k <= tb[tb.length - 1].k);
        if (t >= 0) {
          path.push(`l1-${t}`);
          found = l1[t].find((e) => e.k === k);
          where = `L1 table ${t + 1}`;
        }
      }
      snap(
        `get ${k}`,
        found
          ? found.del
            ? `get ${k}: checked ${path.length} places, newest first, and stopped at a tombstone in ${where}: ${k} was deleted. older values below it don't count.`
            : `get ${k}: checked ${path.length} place${path.length > 1 ? "s" : ""}, newest first, and found ${k} = ${found.v} in ${where}. a key can be in several places; the newest wins.`
          : `get ${k}: checked every place it could be (${path.length}) and found nothing. that's the expensive case, and the one bloom filters exist for.`,
        { where: "read", k },
        path,
      );
      continue;
    }
    const e: Entry = "put" in op ? { k: op.put, v: op.v } : { k: op.del, v: "", del: true };
    mem = [...mem.filter((x) => x.k !== e.k), e].sort(sortK);
    snap("put" in op ? `put ${e.k}` : `delete ${e.k}`, "put" in op ? `${e.k} = ${e.v} goes into the memtable, kept sorted in memory. nothing on disk changes (besides a log record, not drawn).` : `a delete is a write too: a tombstone for ${e.k} goes into the memtable. the old value stays on disk until compaction meets the tombstone.`, { where: "mem", k: e.k });
    if (mem.length >= memMax) {
      l0 = [...l0, mem];
      mem = [];
      snap("flush", `the memtable is full: it's written out in one sequential write as a new sorted, immutable file in L0. L0 files can overlap each other, so a read has to check each one.`, { where: `l0-${l0.length - 1}` });
      if (l0.length >= l0Max) {
        const all = new Map<number, Entry>();
        for (const t of l1) for (const x of t) all.set(x.k, x);
        for (const t of l0) for (const x of t) all.set(x.k, x); // newer last, wins
        const merged = [...all.values()].filter((x) => !x.del).sort(sortK);
        const dropped = [...all.values()].filter((x) => x.del).length;
        l1 = [];
        for (let i = 0; i < merged.length; i += perTable) l1.push(merged.slice(i, i + perTable));
        const read = l0.reduce((s, t) => s + t.length, 0);
        l0 = [];
        snap(
          "compaction",
          `L0 holds ${l0Max} files: compact. merge them with L1 into new L1 files, sorted and non-overlapping, newest value winning${dropped ? `, ${dropped} tombstone${dropped > 1 ? "s" : ""} dropped with the values they hid` : ""}. ${read} entries from L0 were rewritten, plus all of L1: that rewriting is the write amplification.`,
          { where: "l1" },
        );
      }
    }
  }
  return out;
}

const OPS: Op[] = [
  { put: 42, v: "a" },
  { put: 7, v: "b" },
  { put: 19, v: "c" },
  { put: 63, v: "d" },
  { put: 7, v: "e" },
  { put: 30, v: "f" },
  { del: 19 },
  { put: 55, v: "g" },
  { get: 7 },
  { put: 12, v: "h" },
  { put: 42, v: "i" },
  { put: 88, v: "j" },
  { put: 3, v: "k" },
  { get: 19 },
  { get: 50 },
];

function Table({ es, id, s }: { es: Entry[]; id: string; s: State }) {
  const on = s.hot?.where === id || s.hot?.where === id.split("-")[0];
  const read = s.read?.includes(id);
  return (
    <div
      className="flex min-h-[1.6rem] flex-wrap items-center gap-[3px] rounded-[4px] px-1 py-1 transition-[box-shadow] duration-200 ease-sfe"
      style={{ boxShadow: read ? ring("hot", undefined, 1.5) : on ? ring("hot", 70) : ring("line-2"), background: on && !read ? tint("hot", 7) : "var(--bg)" }}
    >
      {es.length === 0 && <span className="px-1 text-[10px] text-faint">empty</span>}
      {es.map((e) => (
        <span
          key={e.k}
          className="rounded-[2px] px-1 text-[10px] leading-[16px] tabular"
          style={{ boxShadow: ring(e.del ? "dead" : "line", e.del ? 70 : undefined), color: e.del ? "var(--dead)" : s.hot?.k === e.k ? "var(--hot)" : "var(--ink)", textDecoration: e.del ? "line-through" : undefined }}
        >
          {e.k}
          {e.del ? "" : <span className="text-faint">={e.v}</span>}
        </span>
      ))}
    </div>
  );
}

export function LsmModel({ memMax = 4, l0Max = 2, perTable = 4 }: { memMax?: number; l0Max?: number; perTable?: number }) {
  const steps = useMemo(() => run(OPS, memMax, l0Max, perTable), [memMax, l0Max, perTable]);
  const st = useStepper(steps.length, { interval: 1500 });
  const reduce = useReducedMotion();
  const s = steps[st.i];
  const row = (label: string, body: React.ReactNode) => (
    <div className="grid grid-cols-[7ch_minmax(0,1fr)] items-start gap-2">
      <span className="pt-1 text-11 text-faint">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{body}</div>
    </div>
  );
  return (
    <div {...st.keys} className="grid min-w-0 gap-3 text-12 outline-none" aria-label="an LSM tree, one operation at a time">
      <div className="grid gap-2" role="img" aria-label={`memtable ${s.mem.length} keys, L0 ${s.l0.length} files, L1 ${s.l1.length} files`}>
        {row("memory", <Table es={s.mem} id="mem" s={s} />)}
        <div className="border-t border-dashed border-line-2" />
        {row("L0", s.l0.length ? s.l0.map((t, i) => <Table key={i} es={t} id={`l0-${i}`} s={s} />) : <span className="pt-1 text-[10px] text-faint">no files</span>)}
        {row("L1", s.l1.length ? s.l1.map((t, i) => <Table key={i} es={t} id={`l1-${i}`} s={s} />) : <span className="pt-1 text-[10px] text-faint">no files</span>)}
      </div>
      <Narration minLines={3} tag={s.label}>
        {s.note}
      </Narration>
      <Legend
        items={[
          ["hot", "this step"],
          ["dead", "tombstone"],
        ]}
      />
      <StepControls s={st} compact={reduce} />
      <Provenance sim={`model of a leveled LSM tree: memtable of ${memMax}, compaction at ${l0Max} L0 files, ${perTable} keys a file`} />
    </div>
  );
}
