"use client";

import { useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Narration, Provenance, Row, SqlPanel, Words, fmt, ring, tint, useReducedMotion, useWidth } from "@/components/figures/kit";

// a captured plan two ways at once: the tree, and the text postgres printed. hover (or focus)
// a node in either and the other lights up. "estimates" shows the planner's four numbers,
// "actuals" what really happened. the stepper walks the nodes in reading order: children
// before their parent, left to right, which is the order rows start flowing.

export type ReaderNode = {
  k: number;
  depth: number;
  parent: number;
  head: string;
  line: number;
  lines: number[];
  est: { startup: number; total: number; rows: number; width: number };
  actual?: { rows: number; loops: number };
  note: string;
  /** estimate off by this factor (10x or more), for a node that ran to completion */
  off?: number;
};

type Mode = "estimates" | "actuals";

const ordinal = (i: number) => `${i + 1}`;

function Card({ n, mode, on, step, onFocus }: { n: ReaderNode; mode: Mode; on: boolean; step: number; onFocus: (k: number | null) => void }) {
  const [op, ...rest] = n.head.split(/ (?=on |using )/);
  return (
    <button
      type="button"
      className="min-w-0 max-w-[15rem] rounded-md bg-well px-2.5 py-1.5 text-left transition-[box-shadow,background-color] duration-200 ease-sfe"
      style={{ boxShadow: on ? ring("hot", undefined, 1.5) : ring("line-2"), background: on ? tint("hot", 7) : undefined }}
      onMouseEnter={() => onFocus(n.k)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(n.k)}
      onBlur={() => onFocus(null)}
      aria-label={`${n.head}: read ${ordinal(step)} of the plan`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-12 text-hi">{op}</span>
        {mode === "actuals" && n.off ? (
          <Chip tone="dead" title="estimate vs actual, for a node that ran to completion">
            {n.off}× off
          </Chip>
        ) : (
          <span className="text-[10px] text-faint tabular" title="reading order">
            #{ordinal(step)}
          </span>
        )}
      </div>
      {rest.length > 0 && <div className="text-[10.5px] leading-4 break-words text-mute">{rest.join(" ")}</div>}
      <div className="mt-1 text-11 tabular">
        {mode === "estimates" ? (
          <span className="text-mute">
            {n.est.startup.toFixed(2)}..{n.est.total.toFixed(2)} · rows {fmt(n.est.rows)} · w {n.est.width}
          </span>
        ) : n.actual ? (
          <span style={{ color: n.off ? "var(--dead)" : "var(--hi)" }}>
            rows {fmt(n.actual.rows, Number.isInteger(n.actual.rows) ? 0 : 2)}
            {n.actual.loops !== 1 && <span className="text-faint"> ×{fmt(n.actual.loops)} loops</span>}
          </span>
        ) : (
          <span className="text-faint">not run</span>
        )}
      </div>
    </button>
  );
}

function Tree({ nodes, k, ...p }: { nodes: ReaderNode[]; k: number; mode: Mode; focus: number; rank: Map<number, number>; onFocus: (k: number | null) => void }) {
  const n = nodes[k];
  const kids = nodes.filter((x) => x.parent === k);
  return (
    <div className="flex flex-col items-center">
      <Card n={n} mode={p.mode} on={p.focus === k} step={p.rank.get(k)!} onFocus={p.onFocus} />
      {kids.length > 0 && (
        <>
          <span aria-hidden className="h-3 w-px bg-line-2" />
          <div className="flex items-start">
            {kids.map((c, i) => (
              <div key={c.k} className="relative flex flex-col items-center px-2 pt-4">
                {kids.length > 1 && <span aria-hidden className="absolute top-0 h-px bg-line-2" style={{ left: i === 0 ? "50%" : 0, right: i === kids.length - 1 ? "50%" : 0 }} />}
                <span aria-hidden className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-line-2" />
                <Tree nodes={nodes} k={c.k} {...p} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Outline({ nodes, ...p }: { nodes: ReaderNode[]; mode: Mode; focus: number; rank: Map<number, number>; onFocus: (k: number | null) => void }) {
  return (
    <div className="grid gap-1.5">
      {nodes.map((n) => (
        <div key={n.k} className="flex min-w-0 gap-1.5" style={{ paddingLeft: n.depth * 12 }}>
          {n.depth > 0 && (
            <span aria-hidden className="pt-1.5 text-11 text-faint">
              ↳
            </span>
          )}
          <div className="grid min-w-0 flex-1">
            <Card n={n} mode={p.mode} on={p.focus === n.k} step={p.rank.get(n.k)!} onFocus={p.onFocus} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Num({ k, v, children }: { k: string; v: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[11ch_minmax(0,1fr)] gap-x-3 py-1">
      <div className="min-w-0">
        <div className="text-11 text-faint">{k}</div>
        <div className="text-14 text-hi tabular">{v}</div>
      </div>
      <div className="font-serif text-[0.98rem] leading-[1.5] text-ink">{children}</div>
    </div>
  );
}

export function ExplainReaderView({
  start,
  sql,
  text,
  nodes,
  order,
  source,
}: {
  start: Mode;
  sql: string;
  text: string;
  nodes: ReaderNode[];
  order: number[];
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [mode, setMode] = useState<Mode>(start);
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const s = useStepper(order.length, { interval: 2200 });
  const [wrap, w] = useWidth<HTMLDivElement>(760);
  const rank = new Map(order.map((k, i) => [k, i]));
  const focus = hover ?? order[s.i];
  const n = nodes[focus];
  const kids = nodes.filter((x) => x.parent === focus);
  const textLines = text.split("\n");
  // light the focused node's lines; in "actuals", just the line itself and its detail lines
  const hot = n.lines.map((l) => l + 1);
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12 outline-none" aria-label="a query plan as a tree and as text, read bottom-up">
      <Row k="numbers =" w="9ch" last>
        <Words label="which numbers" options={["estimates", "actuals"] as Mode[]} value={mode} onChange={setMode} />
      </Row>
      <SqlPanel code={sql} file="query.sql" wrap />
      <div ref={wrap} className="min-w-0 overflow-x-auto">
        {w < 600 ? (
          <Outline nodes={nodes} mode={mode} focus={focus} rank={rank} onFocus={setHover} />
        ) : (
          <div className="flex min-w-max justify-center py-1">
            <Tree nodes={nodes} k={0} mode={mode} focus={focus} rank={rank} onFocus={setHover} />
          </div>
        )}
      </div>
      <div
        className="min-w-0"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const li = (e.target as HTMLElement).closest("li");
          if (!li?.parentElement) return;
          const idx = Array.from(li.parentElement.children).indexOf(li);
          const owner = nodes.find((x) => x.lines.includes(idx));
          setHover(owner ? owner.k : null);
        }}
      >
        <SqlPanel code={textLines.join("\n")} lang="plan" file="the same plan, as EXPLAIN prints it" hot={hot} nolines />
      </div>
      <div className="grid min-w-0 gap-1 rounded-md px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-11">
          <span className="text-hi">{n.head}</span>
          <span className="text-faint">
            read #{ordinal(rank.get(focus)!)} of {nodes.length}
          </span>
        </div>
        {mode === "estimates" ? (
          <>
            <Num k="startup cost" v={n.est.startup.toFixed(2)}>
              spent before the first row can come out{kids.length ? ", children's startup included" : ""}.
              {n.est.startup > 0 && n.est.startup >= n.est.total * 0.95 ? " nearly all of the total: this node has to finish its input first." : ""}
            </Num>
            <Num k="total cost" v={n.est.total.toFixed(2)}>
              to hand over every row. it includes the children{kids.length ? ` (${kids.map((c) => c.est.total.toFixed(2)).join(" + ")} below)` : ""}. arbitrary units, not ms.
            </Num>
            <Num k="rows" v={fmt(n.est.rows)}>
              the rows it expects to return, per loop.
            </Num>
            <Num k="width" v={`${n.est.width} B`}>
              the average size of one of those rows, in bytes: only the columns the nodes above still need.
            </Num>
          </>
        ) : n.actual ? (
          <>
            <Num k="actual rows" v={fmt(n.actual.rows, Number.isInteger(n.actual.rows) ? 0 : 2)}>
              what it really returned, per loop{n.actual.rows !== n.est.rows ? `. the estimate was ${fmt(n.est.rows)}${n.off ? `: ${n.off}× off` : ""}` : ", exactly the estimate"}.
            </Num>
            <Num k="loops" v={fmt(n.actual.loops)}>
              how many times it was started.{n.actual.loops > 1 ? ` rows × loops is the total: ${fmt(Math.round(n.actual.rows * n.actual.loops))}.` : " rows × loops is the total."}
            </Num>
          </>
        ) : (
          <Narration>this node never ran.</Narration>
        )}
      </div>
      <Narration minLines={3} tag={`#${ordinal(rank.get(focus)!)}`}>
        {n.note}
      </Narration>
      <StepControls s={s} label="node" compact={reduce} />
      <Provenance trace={source} />
    </div>
  );
}
