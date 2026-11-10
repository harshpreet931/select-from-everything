"use client";

import { Fragment, useMemo } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Legend, Narration, Provenance, fmt, lsnOff, ring, tint, useReducedMotion, type LegendItem } from "@/components/figures/kit";
import type { AriesRec, AriesView, Source, WalPage, WalView } from "@/lib/db/views";
import { traceWal } from "@/lib/db/fromTrace";
import { ARIES_EXAMPLE, ariesSteps, recoverySteps } from "@/lib/db/sim/wal";
import { StepSql, stepsOf, traceOf } from "./source";
import { describeWal } from "@/lib/db/describe";

// the write-ahead log as a row of records, oldest first, LSNs counted from the start of the
// scenario (+0x0A8). records up to the flush line are on disk (live: durable from here
// back); past it they sit in wal_buffers (dashed). the redo and checkpoint pointers are
// meta, the record just appended is hot. pages show their pd_lsn; dirty pages get the
// accent corner. recovery mode crashes it: the unflushed tail is lost (dead), then redo
// replays from the redo pointer, skipping any page whose LSN already covers the record.
// aries mode is the textbook algorithm (analysis, redo, undo with CLRs), simulated.
//
//   <WalStrip trace={trace} />                       log, one step per statement
//   <WalStrip view={traceWal(trace, 5)} mode="recovery" />
//   <WalStrip mode="aries" />                        textbook ARIES, labelled as such


function PageRow({ pages, base, prev }: { pages: WalPage[]; base: number; prev?: WalPage[] }) {
  if (!pages.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-11">
      <span className="text-faint">pages</span>
      {pages.map((p) => {
        const before = prev?.find((x) => x.label === p.label);
        const changed = before && before.lsn !== p.lsn;
        return (
          <span key={p.label} className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-xs bg-bg px-1.5 py-0.5" style={{ boxShadow: ring("line-2") }}>
            {p.dirty && <span aria-hidden className="absolute top-0 right-0 size-0 border-t-[8px] border-l-[8px] border-t-[var(--accent)] border-l-transparent" />}
            <span className="text-hi">{p.label}</span>
            <span className="text-meta">pd_lsn</span>
            <span key={changed ? p.lsn : "s"} className={`tabular ${changed ? "flash text-hot" : "text-ink"}`}>
              {lsnOff(p.lsn, base)}
            </span>
            {p.dirty && <span className="sr-only">dirty</span>}
          </span>
        );
      })}
    </div>
  );
}

export function WalCells({ view, prevPages }: { view: WalView; prevPages?: WalPage[] }) {
  const recs = view.records;
  const firstUnflushed = recs.findIndex((r) => r.lsn >= view.flush);
  const redoAt = view.redo !== undefined ? recs.findIndex((r) => r.lsn >= view.redo!) : -1;
  const ckAt = view.checkpoint !== undefined && view.checkpoint !== view.redo ? recs.findIndex((r) => r.lsn >= view.checkpoint!) : -1;
  const marker = (label: string, tone: "meta" | "live", title: string) => (
    <span className="flex flex-col items-center justify-center self-stretch px-0.5" title={title}>
      <span className="text-[10px] leading-3 whitespace-nowrap" style={{ color: `var(--${tone})` }}>
        {label}
      </span>
      <span aria-hidden className="mt-0.5 w-[2px] flex-1 rounded-full" style={{ background: `var(--${tone})`, minHeight: 34 }} />
    </span>
  );
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <div className="flex flex-wrap items-stretch gap-x-1.5 gap-y-3" role="img" aria-label={describeWal(view)}>
        {redoAt === -1 && view.redo !== undefined && view.redo < (recs[0]?.lsn ?? 0) && marker("redo ▾", "meta", "the redo pointer: recovery starts reading here")}
        {recs.map((r, i) => {
          const unflushed = r.lsn >= view.flush;
          const mark = view.replay?.[i];
          const cur = view.applying === i;
          const fresh = view.fresh === i && !view.crashed;
          const tone = mark === "lost" ? "dead" : cur || mark === "applied" ? "hot" : undefined;
          return (
            <Fragment key={r.lsn}>
              {i === redoAt && marker("redo ▾", "meta", "the redo pointer: recovery starts reading here")}
              {i === ckAt && marker("checkpoint ▾", "meta", "the checkpoint record")}
              {i === firstUnflushed && !view.crashed && marker("flush ▾", "live", "everything before this line is on disk: durable")}
              <div
                className="flex w-[8.6rem] min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] leading-[1.35] transition-[box-shadow,background-color,opacity] duration-200 ease-sfe"
                style={{
                  boxShadow: cur ? ring("hot", undefined, 1.5) : fresh ? ring("hot", undefined, 1.5) : unflushed && !mark ? undefined : tone ? ring(tone, 70) : ring("line-2"),
                  outline: unflushed && !mark ? "1px dashed var(--mute)" : undefined,
                  outlineOffset: -1,
                  background: mark === "applied" || cur ? tint("hot", cur ? 10 : 6) : mark === "lost" ? tint("dead", 6) : "var(--bg)",
                  opacity: mark === "skipped" ? 0.55 : 1,
                }}
              >
                <span className="flex justify-between gap-1 tabular">
                  <span className="text-faint">{lsnOff(r.lsn, view.base)}</span>
                  <span className="text-faint">{fmt(r.len)} B</span>
                </span>
                <span className="truncate" style={{ textDecoration: mark === "lost" ? "line-through" : undefined }}>
                  <span className="text-meta">{r.rmgr}</span> <span className={mark === "lost" ? "text-dead" : "text-hi"}>{r.type}</span>
                </span>
                <span className="truncate text-mute">
                  {r.blocks?.length ? r.blocks.map((b) => `${b.rel}·${b.block}${b.fpi ? " +FPI" : ""}`).join(", ") : r.xid ? `xid ${r.xid}` : (r.desc ?? "")}
                </span>
                <span className="h-3.5 truncate text-[10px]" style={{ color: mark === "lost" ? "var(--dead)" : mark ? "var(--hot)" : unflushed ? "var(--mute)" : "var(--faint)" }}>
                  {mark === "lost" ? "lost in the crash" : mark === "applied" ? "replayed" : mark === "skipped" ? "skipped: page has it" : unflushed ? "in wal_buffers" : r.xid ? `xid ${r.xid}` : ""}
                </span>
              </div>
            </Fragment>
          );
        })}
        {firstUnflushed === -1 && !view.crashed && recs.length > 0 && marker("flush ▾", "live", "everything before this line is on disk: durable")}
        {recs.length === 0 && <span className="flex items-center text-11 text-faint italic">no records yet</span>}
        <span className="flex items-center self-stretch px-1 text-[10px] text-faint">insert {lsnOff(view.insert, view.base)}</span>
      </div>
      <PageRow pages={view.pages ?? []} base={view.base} prev={prevPages} />
    </div>
  );
}

const LOG_LEGEND: LegendItem[] = [
  ["live", "flush line: durable from here back", "line"],
  ["mute", "in wal_buffers, not on disk", "dashed"],
  ["meta", "redo pointer, record header"],
  ["hot", "just appended, being replayed"],
  ["accent", "dirty page"],
];

function AriesBoard({ v }: { v: AriesView }) {
  const passes: AriesView["pass"][] = ["before", "crash", "analysis", "redo", "undo", "done"];
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <ol className="flex flex-wrap gap-1 text-11" aria-label="passes">
        {passes.map((p) => (
          <li key={p} className="rounded-xs px-1.5 py-0.5" style={{ boxShadow: p === v.pass ? ring("hot") : ring("line"), color: p === v.pass ? "var(--hot)" : "var(--faint)" }}>
            {p === "before" ? "the log" : p}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {v.log.map((r: AriesRec) => {
          const m = v.marks?.[r.lsn];
          const lost = v.pass !== "before" && r.lsn > (v.flushed ?? Infinity) && r.kind !== "clr" && r.kind !== "end";
          return (
            <div
              key={r.lsn}
              className="flex w-[6.6rem] flex-col rounded-md px-1.5 py-1 text-[10.5px] leading-[1.35] transition-[box-shadow,opacity] duration-200"
              style={{
                boxShadow: v.at === r.lsn || m === "redo" || m === "undo" || m === "clr" ? ring("hot", undefined, v.at === r.lsn ? 1.5 : 1) : ring("line-2"),
                opacity: m === "skip" ? 0.5 : 1,
                background: m === "clr" ? tint("hot", 8) : lost ? tint("dead", 6) : "var(--bg)",
              }}
            >
              <span className="flex justify-between text-faint tabular">
                <span>lsn {r.lsn}</span>
                <span>{r.prev ? `prev ${r.prev}` : ""}</span>
              </span>
              <span className="text-hi">
                {r.txn ? `${r.txn} ` : ""}
                {r.kind}
              </span>
              <span className="truncate text-mute">{r.kind === "clr" ? `${r.what}, next ${r.undoNext || "·"}` : (r.what ?? r.page ?? "")}</span>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 text-11 @min-[560px]:grid-cols-3">
        <div>
          <div className="mb-1 text-faint">transaction table</div>
          {v.txns.length ? (
            v.txns.map((t) => (
              <div key={t.txn} className="flex gap-2 tabular">
                <span className="text-hi">{t.txn}</span>
                <Chip tone="meta" dashed={t.status === "aborting"}>{t.status}</Chip>
                <span className="text-meta">last {t.last || "·"}</span>
              </div>
            ))
          ) : (
            <span className="text-faint">empty</span>
          )}
        </div>
        <div>
          <div className="mb-1 text-faint">dirty page table</div>
          {v.dpt.length ? (
            v.dpt.map((d) => (
              <div key={d.page} className="tabular">
                <span className="text-hi">{d.page}</span> <span className="text-meta">recLSN {d.recLsn}</span>
              </div>
            ))
          ) : (
            <span className="text-faint">empty</span>
          )}
        </div>
        <div>
          <div className="mb-1 text-faint">pages on disk</div>
          {v.pages.map((p) => (
            <div key={p.page} className="tabular">
              <span className="text-hi">{p.page}</span> <span className="text-meta">pageLSN</span> <span>{p.lsn}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WalStrip(props: Partial<Source<WalView>> & { mode?: "log" | "recovery" | "aries"; aries?: typeof ARIES_EXAMPLE }) {
  const mode = props.mode ?? "log";
  if (mode === "aries") return <Aries {...(props.aries ?? ARIES_EXAMPLE)} />;
  return <Log {...props} mode={mode} />;
}

function Log(props: Partial<Source<WalView>> & { mode: "log" | "recovery" }) {
  const src = props as Source<WalView>;
  const trace = traceOf(src);
  const base = useMemo(
    () => stepsOf(src, (t, i) => traceWal(t, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [("view" in props && props.view) || null, ("steps" in props && props.steps) || null, trace],
  );
  const steps = useMemo(() => (props.mode === "recovery" && base.length ? recoverySteps(base[base.length - 1].view) : base), [base, props.mode]);
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval: 1300 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  if (!cur) return null;
  const prev = s.i > 0 ? steps[s.i - 1].view.pages : undefined;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="write-ahead log">
      {props.mode !== "recovery" && cur.label && steps.length > 1 ? <StepSql label={cur.label} /> : null}
      <WalCells view={cur.view} prevPages={prev} />
      <Narration minLines={2} tag={props.mode === "recovery" ? cur.label?.split(" ")[0] : undefined}>
        {cur.note}
      </Narration>
      <Legend items={props.mode === "recovery" ? [["dead", "lost in the crash"], ["hot", "replayed"], ["mute", "skipped: the page already had it", "ghost"], ["meta", "redo pointer"]] : LOG_LEGEND} />
      {steps.length > 1 && <StepControls s={s} compact={reduce} />}
      {trace ? <Provenance trace={trace} /> : props.mode === "recovery" ? <Provenance sim="model of postgres redo, simplified" checked /> : null}
    </div>
  );
}

function Aries(a: typeof ARIES_EXAMPLE) {
  const steps = useMemo(() => ariesSteps(a.log, { flushed: a.flushed, pages: a.pages }), [a]);
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 1300 });
  const cur = steps[s.i];
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="ARIES recovery, the textbook version">
      <div className="text-11 text-faint">textbook ARIES, simulated. postgres has no undo pass.</div>
      <AriesBoard v={cur.view} />
      <Narration minLines={3} tag={cur.view.pass}>
        {cur.note}
      </Narration>
      <StepControls s={s} compact={reduce} />
      <Provenance sim="model of textbook ARIES (Mohan et al.), not postgres" />
    </div>
  );
}
