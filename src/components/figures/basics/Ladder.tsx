"use client";

import { useState, type ReactNode } from "react";
import { Narration, Provenance, SqlPanel, Words, ring, tint } from "@/components/figures/kit";

// CASE (or COALESCE) as a ladder: postgres tries the rungs top to bottom and stops at the first
// one that holds. pick a row and see which rung caught it, which ones it fell past, and which
// it never reached. which rung fired comes from the capture (a second CASE in the same query
// returns the rung's number), and so does the answer: nothing is evaluated in the browser.

export type Rung = { test: string; then: string };
export type LadderRow = { label: string; facts: string; hit: number; out: string | null };

export function Ladder({
  sql,
  rungs,
  last,
  rows,
  missed = "false",
  start = 0,
  outName = "result",
  lastLabel,
  trace,
}: {
  /** how the last line reads: "ELSE" by default; for COALESCE, e.g. "otherwise" */
  lastLabel?: string;
  sql: string;
  /** WHEN test THEN value, in order. for COALESCE: test = "email IS NOT NULL", then = "email" */
  rungs: Rung[];
  /** the ELSE (or the last COALESCE argument); omit for a CASE with no ELSE */
  last?: string;
  /** hit: index into rungs, rungs.length for the ELSE, -1 when nothing matched and there's no ELSE */
  rows: LadderRow[];
  /** what a rung that didn't hold said: "false", or "NULL" for COALESCE */
  missed?: string;
  start?: number;
  outName?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [ri, setRi] = useState(start);
  const row = rows[ri];
  const all = [...rungs.map((r) => ({ test: r.test, then: r.then })), ...(last !== undefined ? [{ test: "ELSE", then: last }] : [])];
  const reached = row.hit < 0 ? all.length : row.hit;

  let note: ReactNode;
  if (row.hit < 0) note = `${row.label} fell past every rung, and there's no ELSE, so the answer is NULL.`;
  else if (row.hit === rungs.length) note = `${row.label} fell past all ${rungs.length} tests and landed on the last line: ${row.out === null ? "NULL" : `'${row.out}'`}.`;
  else
    note = `${row.label} ${row.hit === 0 ? "stops at the first test" : `falls past ${row.hit} ${row.hit === 1 ? "test" : "tests"} and stops at test ${row.hit + 1}`}. ${
      reached < all.length - 1 ? (all.length - reached - 1 === 1 ? "the line below never gets looked at." : `the ${all.length - reached - 1} lines below never get looked at.`) : ""
    }`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the rungs of a CASE, tried in order">
      <SqlPanel code={sql} file="query.sql" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[560px]:grid-cols-[6ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">row =</span>
        <Words options={rows.map((r, i) => ({ v: i, label: r.label }))} value={ri} onChange={setRi} label="which row" />
      </div>
      <div className="text-12 text-mute">{row.facts}</div>
      <ol className="grid gap-1.5" aria-label="the rungs">
        {all.map((r, i) => {
          const isElse = last !== undefined && i === all.length - 1;
          const hit = i === row.hit;
          const past = i < reached;
          const never = i > reached;
          const style = hit
            ? { boxShadow: ring("live", 60), background: tint("live", 8) }
            : past
              ? { boxShadow: ring("line") }
              : { outline: "1px dashed var(--line-2)", outlineOffset: -1 };
          return (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-well px-3 py-1.5 text-12 transition-[box-shadow,background-color,opacity] duration-200 ease-sfe" style={{ ...style, opacity: never ? 0.5 : 1 }}>
              <span className="min-w-0 truncate">
                <span className="text-faint">{isElse && !lastLabel ? "" : `${i + 1}. `}</span>
                <span className={past ? "text-mute line-through decoration-faint" : hit ? "text-hi" : "text-mute"}>{isElse ? (lastLabel ?? "ELSE") : r.test}</span>
                <span className="text-faint">{isElse && !lastLabel ? " " : " → "}</span>
                <span className={hit ? "text-hi" : "text-mute"}>{r.then}</span>
              </span>
              <span className="text-11 whitespace-nowrap">
                {hit ? <span style={{ color: "var(--live)" }}>{isElse ? "lands here" : "true: stop"}</span> : past ? <span className="text-faint">{missed}</span> : <span className="text-faint italic">not reached</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-baseline gap-3 text-12">
        <span className="text-faint">{outName} =</span>
        <span className={row.out === null ? "text-faint italic" : row.out === "" ? "text-faint" : "text-hi"}>{row.out === null ? "null" : row.out === "" ? "''" : row.out}</span>
      </div>
      <Narration minLines={2}>{note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
