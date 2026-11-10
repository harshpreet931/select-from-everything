"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Row, Stat, Toggle, Words, fmt, ring, tint, useReducedMotion } from "@/components/figures/kit";
import type { PoolFrame, PoolView, Source } from "@/lib/db/views";
import { tracePool } from "@/lib/db/fromTrace";
import { poolSteps, workload, type Policy, type Req } from "@/lib/db/sim/clock";
import { StepSql, stepsOf, traceOf } from "./source";
import { describePool } from "@/lib/db/describe";

// shared buffers as a grid of frames. each frame holds one 8 KB page ("accounts·3"), a
// usage count (pips, 0 to 5), a pin count (meta) and a dirty flag (an accent corner: a
// dirty page differs from disk, which is normal, not a bug). the clock hand (hot) sweeps
// for a victim on a miss, knocking one off each usage count it passes. hits are live,
// reads from disk are hot. hover a page in the page table to find its frame.
//
//   <BufferPool lab={{ frames: 9, policy: "clock-sweep", workload: "hot+scan", ring: 2 }} />
//   <BufferPool trace={trace} />          (pg_buffercache, captured)

const pageLabel = (p?: { rel: string; block: number }) => (p ? `${p.rel}·${p.block}` : "");


function Frame({ f, v, find }: { f: PoolFrame; v: PoolView; find?: string }) {
  const isVictim = v.victim === f.id;
  const hit = isVictim && v.hit === true;
  const read = isVictim && v.hit === false;
  const swept = v.swept?.includes(f.id);
  const found = !!find && pageLabel(f.page) === find;
  const outline = hit ? ring("live", undefined, 1.5) : read ? ring("hot", undefined, 1.5) : found ? ring("ref", undefined, 1.5) : f.page ? ring("line-2") : undefined;
  return (
    <div
      className="relative flex h-[4.1rem] min-w-0 flex-col justify-between overflow-hidden rounded-[5px] px-1.5 py-1 transition-[box-shadow,background-color] duration-200 ease-sfe"
      style={{
        boxShadow: outline,
        outline: !f.page ? "1px dashed var(--line-2)" : swept ? "1px dashed var(--hot)" : undefined,
        outlineOffset: -1,
        background: hit ? tint("live", 10) : read ? tint("hot", 10) : f.page ? "var(--bg)" : undefined,
      }}
      aria-label={`frame ${f.id}: ${f.page ? `${pageLabel(f.page)}, usage ${f.usage}, ${f.pins} pins${f.dirty ? ", dirty" : ""}` : "empty"}`}
    >
      {f.dirty && <span aria-hidden className="absolute top-0 right-0 size-0 border-t-[11px] border-l-[11px] border-t-[var(--accent)] border-l-transparent" />}
      <div className="flex items-center justify-between text-[9.5px] leading-3 text-faint tabular">
        <span>#{f.id}</span>
        {f.pins > 0 && <span className="rounded-xs px-1 text-meta" style={{ boxShadow: ring("meta", 50) }}>pin {f.pins}</span>}
      </div>
      <div className={`min-w-0 text-center leading-[13px] ${f.page ? (read ? "text-hot" : hit ? "text-live" : "text-hi") : "text-faint italic"}`}>
        {f.page ? (
          <>
            <div className="truncate text-[10px]" title={f.page.rel}>
              {f.page.rel}
            </div>
            <div className="text-11 tabular">·{f.page.block}</div>
          </>
        ) : (
          <div className="text-[10.5px]">empty</div>
        )}
      </div>
      <div className="flex justify-center gap-[3px]" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="size-[5px] rounded-full transition-[background-color] duration-200"
            style={{ background: i < f.usage ? (swept && i === f.usage ? "var(--hot)" : "var(--ink)") : "transparent", boxShadow: i < f.usage ? undefined : ring("line-2") }}
          />
        ))}
      </div>
    </div>
  );
}

export function PoolGrid({ view, cols }: { view: PoolView; cols?: number }) {
  const [find, setFind] = useState<string | undefined>();
  const n = view.frames.length;
  const table = view.frames.filter((f) => f.page).sort((a, b) => pageLabel(a.page).localeCompare(pageLabel(b.page), "en", { numeric: true }));
  return (
    <div className="grid min-w-0 gap-4 @min-[600px]:grid-cols-[minmax(0,1fr)_13rem] grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0">
        <div
          className="grid max-w-[44rem] gap-1.5"
          style={{ gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${n > 12 ? "4.6rem" : "5.2rem"}, 1fr))` }}
          role="img"
          aria-label={describePool(view)}
        >
          {view.frames.map((f) => (
            <div key={f.id} className="flex flex-col items-center gap-0.5">
              <div className="w-full">
                <Frame f={f} v={view} find={find} />
              </div>
              <span className="h-3 text-[10px] leading-3" style={{ color: "var(--hot)" }} aria-hidden>
                {view.hand === f.id ? "▲ hand" : ""}
              </span>
            </div>
          ))}
        </div>
        {view.other ? <div className="mt-1 text-[10px] text-faint">+ {fmt(view.other)} frames holding other relations, not drawn</div> : null}
      </div>
      {view.table !== false && (
        <div className="min-w-0">
          <div className="mb-1 text-11 text-faint">page table: page → frame</div>
          <ul className="grid max-h-[14rem] gap-0.5 overflow-y-auto text-11" onMouseLeave={() => setFind(undefined)}>
            {table.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex w-full min-w-0 justify-between gap-2 rounded-xs px-1.5 py-0.5 text-left transition-[background-color] duration-150 hover:bg-well-2 focus-visible:bg-well-2"
                  title={`${pageLabel(f.page)} → frame ${f.id}`}
                  onMouseEnter={() => setFind(pageLabel(f.page))}
                  onFocus={() => setFind(pageLabel(f.page))}
                  onBlur={() => setFind(undefined)}
                >
                  <span className="min-w-0 truncate text-ink">{pageLabel(f.page)}</span>
                  <span className="shrink-0 text-ref tabular">→ #{f.id}</span>
                </button>
              </li>
            ))}
            {!table.length && <li className="text-faint">empty</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

const legend = (hand: boolean) => (
  <Legend
    items={[
      ["live", "hit"],
      ["hot", hand ? "read from disk, clock hand" : "read from disk"],
      ["accent", "dirty"],
      ["meta", "pinned"],
      ["mute", "empty frame", "dashed"],
    ]}
  />
);

/** what each lab policy is a model of. only clock sweep is what postgres does */
const MODEL: Record<Policy, string> = {
  "clock-sweep": "model of the clock sweep (StrategyGetBuffer), one backend, no bgwriter",
  lru: "model of textbook lru replacement, not what postgres does",
  fifo: "model of textbook fifo replacement, not what postgres does",
};

type Lab = { frames: number; policy: Policy; workload: "hot+scan" | "seqscan" | "random" | number[]; ring?: number };

function PoolLab(lab: Lab) {
  const [frames, setFrames] = useState(lab.frames);
  const [policy, setPolicy] = useState<Policy>(lab.policy);
  const [wl, setWl] = useState(lab.workload);
  const [ring_, setRing] = useState(!!lab.ring);
  const ringSize = lab.ring ?? Math.max(2, Math.floor(frames / 4));
  const reqs: Req[] = useMemo(() => workload(wl, frames), [wl, frames]);
  const steps = useMemo(() => poolSteps(reqs, { frames, policy, ring: ring_ ? ringSize : undefined }), [reqs, frames, policy, ring_, ringSize]);
  const compare = useMemo(
    () => (["clock-sweep", "lru", "fifo"] as Policy[]).map((p) => ({ p, hits: poolSteps(reqs, { frames, policy: p, ring: ring_ ? ringSize : undefined }).at(-1)!.view.stats.hit })),
    [reqs, frames, ring_, ringSize],
  );
  const hasScan = reqs.some((r) => r.scan);
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="policy =" w="11ch">
          <Words label="replacement policy" options={[{ v: "clock-sweep", label: "clock sweep" }, { v: "lru", label: "lru" }, { v: "fifo", label: "fifo" }] as { v: Policy; label: string }[]} value={policy} onChange={setPolicy} />
        </Row>
        <Row k="frames =" w="11ch">
          <Words label="frames" options={[6, 9, 12, 16].map((n) => ({ v: n, label: String(n) }))} value={frames} onChange={setFrames} />
        </Row>
        <Row k="workload =" w="11ch" last={!hasScan}>
          <Words
            label="workload"
            options={[
              { v: "hot+scan", label: "hot pages + one big scan" },
              { v: "seqscan", label: "a seq scan" },
              { v: "random", label: "skewed random" },
            ]}
            value={(Array.isArray(wl) ? "custom" : wl) as "hot+scan"}
            onChange={setWl}
          />
        </Row>
        {hasScan && (
          <Row k="ring =" w="11ch" last>
            <Toggle on={ring_} onChange={setRing}>
              the scan gets a ring of {ringSize} frames
            </Toggle>
          </Row>
        )}
      </div>
      <LabRun key={`${policy}|${frames}|${String(wl)}|${ring_}`} steps={steps} reqs={reqs} compare={compare} policy={policy} />
    </div>
  );
}

function LabRun({ steps, reqs, compare, policy }: { steps: ReturnType<typeof poolSteps>; reqs: Req[]; compare: { p: Policy; hits: number }[]; policy: Policy }) {
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 900 });
  const st = steps[s.i];
  const v = st.view;
  const max = Math.max(1, ...compare.map((c) => c.hits));
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label="buffer pool, one request at a time">
      <div className="flex flex-wrap gap-1" aria-label="requests">
        {reqs.map((r, i) => {
          const now = i === s.i - 1;
          const past = i < s.i - 1;
          return (
            <span
              key={i}
              className="rounded-xs px-1 text-[10px] leading-4 tabular transition-[opacity,box-shadow] duration-200"
              style={{ boxShadow: now ? ring("hot", undefined, 1.5) : ring("line"), color: now ? "var(--hot)" : "var(--ink)", opacity: past ? 0.45 : i > s.i - 1 + 12 ? 0.25 : 1 }}
              title={`${r.write ? "write" : "read"} ${r.rel}·${r.block}${r.scan ? " (seq scan)" : ""}`}
            >
              {r.rel.slice(0, 1)}·{r.block}
              {r.write ? "*" : ""}
            </span>
          );
        })}
      </div>
      <PoolGrid view={v} />
      <div className="grid grid-cols-4 gap-3">
        <Stat k="hits" v={fmt(v.stats.hit)} tone="live" />
        <Stat k="reads" v={fmt(v.stats.read)} tone="hot" />
        <Stat k="evicted" v={fmt(v.stats.evicted)} />
        <Stat k="written back" v={fmt(v.stats.written)} />
      </div>
      <Narration minLines={3} tag={st.label}>
        {st.note}
      </Narration>
      {legend(policy === "clock-sweep")}
      <StepControls s={s} label="request" compact={reduce} />
      {s.atEnd && (
        <div className="grid gap-1.5" aria-label="hits per policy for the same requests">
          <div className="text-11 text-faint">hits for the same {reqs.length} requests</div>
          {compare.map((c) => (
            <div key={c.p} className="grid grid-cols-[12ch_minmax(0,1fr)_4ch] items-center gap-3 text-11">
              <span className={c.p === policy ? "text-hi" : "text-mute"}>{c.p.replace("-", " ")}</span>
              <span className="relative h-2 bg-well-2">
                <span className="absolute inset-y-0 left-0" style={{ width: `${(c.hits / max) * 100}%`, background: c.p === policy ? "var(--live)" : "var(--mute)" }} />
              </span>
              <span className="text-right tabular">{c.hits}</span>
            </div>
          ))}
        </div>
      )}
      <Provenance sim={MODEL[policy]} />
    </div>
  );
}

export function BufferPool(props: Partial<Source<PoolView>> & { lab?: Lab }) {
  if (props.lab) return <div className="@container min-w-0 text-12">{<PoolLab {...props.lab} />}</div>;
  return <Captured {...props} />;
}

function Captured(props: Partial<Source<PoolView>>) {
  const src = props as Source<PoolView>;
  const trace = traceOf(src);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => stepsOf(src, (t, i) => tracePool(t, i)), [("view" in props && props.view) || null, ("steps" in props && props.steps) || null, trace]);
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval: 1500 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  if (!cur) return null;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="buffer pool">
      {cur.label && steps.length > 1 ? <StepSql label={cur.label} /> : null}
      <PoolGrid view={cur.view} />
      {cur.note ? <Narration minLines={2}>{cur.note}</Narration> : null}
      {legend(false)}
      {steps.length > 1 && <StepControls s={s} compact={reduce} />}
      {trace ? <Provenance trace={trace} /> : null}
    </div>
  );
}
