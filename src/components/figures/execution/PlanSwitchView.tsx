"use client";

import { useState } from "react";
import { Narration, Provenance, Row, SqlPanel, Words, fmt } from "@/components/figures/kit";

// pick the options, see the plan postgres printed for them. the plan panel keeps the height
// of the tallest run, so switching doesn't make the page jump. with a metric, a bar per run
// compares one number across all of them (the picked one hot).

export type SwitchRun = { sql: string; plan: string; note?: string; hot: number[]; live: number[]; dead: number[]; value?: number };

export function PlanSwitchView({
  axes,
  runs,
  start,
  metric,
  file,
  source,
}: {
  axes: { key: string; values: { v: string; label: string }[] }[];
  runs: Record<string, SwitchRun>;
  start?: string[];
  metric?: { label: string; unit?: string };
  file: string;
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [picked, setPicked] = useState<string[]>(() => axes.map((a, i) => start?.[i] ?? a.values[0].v));
  const key = picked.join(" | ");
  const run = runs[key];
  const kw = `${Math.max(...axes.map((a) => a.key.length)) + 3}ch`;
  const tallest = Math.max(...Object.values(runs).map((r) => r.plan.split("\n").length));
  const sqlTallest = Math.max(...Object.values(runs).map((r) => r.sql.split("\n").length));
  const keys = Object.keys(runs);
  const top = metric ? Math.max(1, ...keys.map((k) => runs[k].value ?? 0)) : 1;
  const pick = (k: string) => setPicked(k.split(" | "));
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="switch an option and see the plan postgres printed">
      <div className="grid">
        {axes.map((a, i) => (
          <Row key={a.key} k={`${a.key} =`} w={kw} last={i === axes.length - 1}>
            <Words label={a.key} options={a.values.map((x) => ({ v: x.v, label: x.label }))} value={picked[i]} onChange={(v) => setPicked((p) => p.map((x, j) => (j === i ? v : x)))} />
          </Row>
        ))}
      </div>
      {run ? (
        <>
          <div style={{ minHeight: `${sqlTallest * 1.75 * 13 + 52}px` }}>
            <SqlPanel code={run.sql} file={file} wrap />
          </div>
          <div style={{ minHeight: `${tallest * 1.75 * 13 + 52}px` }}>
            <SqlPanel code={run.plan} lang="plan" file="what postgres printed" hot={run.hot} live={run.live} dead={run.dead} nolines />
          </div>
          {metric && (
            <div className="grid gap-1.5">
              <div className="text-11 text-faint">{metric.label}</div>
              <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                {keys.map((k) => {
                  const on = k === key;
                  const v = runs[k].value ?? 0;
                  return (
                    <div key={k} className="contents">
                      <button type="button" className="truncate text-left text-11" style={{ color: on ? "var(--hot)" : "var(--mute)" }} onClick={() => pick(k)}>
                        {k}
                      </button>
                      <span className="relative h-[10px] rounded-[2px] bg-well-2">
                        <span
                          className="absolute inset-y-0 left-0 rounded-[2px] transition-[width,opacity] duration-300 ease-sfe"
                          style={{ width: `${v ? Math.max(0.8, (v / top) * 100) : 0}%`, background: on ? "var(--hot)" : "var(--ink)", opacity: on ? 0.9 : 0.35 }}
                        />
                      </span>
                      <span className="text-right text-11 tabular" style={{ color: on ? "var(--hi)" : "var(--mute)" }}>
                        {fmt(v)}
                        {metric.unit ? <span className="text-faint"> {metric.unit}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {Object.values(runs).some((r) => r.note) && <Narration minLines={2}>{run.note}</Narration>}
        </>
      ) : (
        <Narration>no capture for {key}.</Narration>
      )}
      <Provenance trace={source} />
    </div>
  );
}
