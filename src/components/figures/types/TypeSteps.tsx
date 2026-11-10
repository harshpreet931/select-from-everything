"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, ResultTable, SqlPanel, Words, ring, tint, tv, type Ink } from "@/components/figures/kit";

// how a literal gets its type, one expression at a time. four steps: the type each side has on
// its own, the operators postgres can choose from (a captured pg_operator listing, the one it
// takes in live), the unknown literal settling on a type, and the captured result or error.
// nothing is computed here: the types, candidates and results are captures, read on the server.

type Res = { sql: string; columns: { name: string; type: string }[]; rows: (string | null)[][]; error?: { sqlstate: string; message: string } };
type Side = { text: string; type: string; becomes?: string };

export type TypeCase = {
  left: Side;
  op: string;
  right: Side;
  /** the operators with this name that could apply (captured) */
  candidates: Res;
  /** the candidate row postgres takes, or null when none fits */
  pick: number | null;
  /** the whole expression, run (captured) */
  run: Res;
  /** one sentence per step */
  notes: [string, string, string, string];
};

const STEPS = ["type each side", "find the operator", "settle the unknown", "run it"];

function TypeChip({ type, tone, dashed }: { type: string; tone: Ink; dashed?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-xs px-1.5 text-11 leading-[20px] whitespace-nowrap transition-[color,box-shadow,background-color] duration-200 ease-sfe"
      style={{
        color: tv(tone),
        background: tone === "hot" || tone === "live" || tone === "dead" ? tint(tone, 10) : undefined,
        boxShadow: dashed ? undefined : ring(tone === "ink" ? "line-2" : tone, 55),
        outline: dashed ? `1px dashed ${tv(tone)}` : undefined,
        outlineOffset: dashed ? -1 : undefined,
      }}
    >
      {type}
    </span>
  );
}

function Token({ side, step }: { side: Side; step: number }) {
  const settled = step >= 2 && side.becomes;
  const type = settled ? side.becomes! : side.type;
  const unknown = type === "unknown";
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span className="text-[1.35rem] leading-8 text-hi">{side.text}</span>
      <TypeChip type={type} tone={settled ? "hot" : unknown ? "mute" : "ink"} dashed={unknown} />
    </div>
  );
}

function Case({ c, trace }: { c: TypeCase; trace?: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const s = useStepper(STEPS.length, { interval: 2200 });
  const step = s.i;
  const tones = c.candidates.rows.map((_, i) => (step >= 1 && i === c.pick ? ("live" as const) : null));
  const opLit = step === 1;
  return (
    <div {...s.keys} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none">
      <ol className="flex flex-wrap gap-1 text-11" aria-label="steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => s.go(i)}
              aria-current={i === step ? "step" : undefined}
              className="rounded-xs px-1.5 leading-[20px] transition-[box-shadow,color,background-color] duration-200 ease-sfe"
              style={{
                boxShadow: i === step ? ring("hot") : ring("line"),
                background: i === step ? tint("hot", 8) : undefined,
                color: i === step ? "var(--hot)" : i < step ? "var(--ink)" : "var(--faint)",
              }}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-start justify-center gap-5 rounded-md bg-well px-3 pt-4 pb-3 shadow-[inset_0_0_0_1px_var(--line)]" role="img" aria-label={`${c.left.text} ${c.op} ${c.right.text}`}>
        <Token side={c.left} step={step} />
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[1.35rem] leading-8 transition-colors duration-200 ease-sfe" style={{ color: opLit ? "var(--hot)" : "var(--hi)" }}>
            {c.op}
          </span>
          <span className="text-11 leading-[20px] text-faint">operator</span>
        </div>
        <Token side={c.right} step={step} />
      </div>
      <div style={{ minHeight: `${c.candidates.rows.length * 26 + 64}px` }} className="min-w-0">
        <div className="mb-1.5 text-11 text-faint">
          every <span className="text-hi">{c.op}</span> postgres has for this shape, from pg_operator
        </div>
        <div className="transition-opacity duration-200 ease-sfe" style={{ opacity: step >= 1 ? 1 : 0.35 }}>
          <ResultTable columns={c.candidates.columns.map((x) => x.name)} rows={c.candidates.rows} rowTones={tones} dense caption="candidate operators" />
        </div>
      </div>
      <div className="min-h-[5.2rem]">
        {step === 3 ? (
          c.run.error ? (
            <div className="rounded-md px-3 py-2.5 text-12 leading-[1.6]" style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--dead) 55%, transparent)`, background: tint("dead", 6) }} role="status">
              <span className="text-dead">ERROR:</span> <span className="text-ink">{c.run.error.message}</span>
              <span className="ml-2 text-11 text-faint">SQLSTATE {c.run.error.sqlstate}</span>
            </div>
          ) : (
            <ResultTable columns={c.run.columns.map((x) => x.name)} rows={c.run.rows} rowTones={c.run.rows.map(() => "live")} dense caption="the result" />
          )
        ) : (
          <SqlPanel code={c.run.sql} file="query.sql" nolines />
        )}
      </div>
      <Narration minLines={3} tag={STEPS[step]}>
        {c.notes[step]}
      </Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <StepControls s={s} compact />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}

export function TypeSteps({
  cases,
  trace,
}: {
  cases: Record<string, TypeCase>;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const labels = Object.keys(cases);
  const [pick, setPick] = useState(labels[0]);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="how a literal gets its type">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[6ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">SELECT</span>
        <Words options={labels} value={pick} onChange={setPick} label="expression" />
      </div>
      <Case key={pick} c={cases[pick]} trace={trace} />
    </div>
  );
}
