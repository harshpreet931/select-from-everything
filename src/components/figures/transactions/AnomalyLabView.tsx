"use client";

import { useState } from "react";
import { SessionLanes, type Run } from "@/components/db/SessionLanes";
import { FIG_TABLE, Legend, ring, tint } from "@/components/figures/kit";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { SessionStep } from "@/lib/db/views";

// the anomaly × isolation level grid. each cell has two halves: what the standard allows (top,
// from the manual's table 13.1) and what postgres 18.6 did in a captured run (bottom: happens in
// dead, prevented in live, prevented by a 40001 in live with its code). click a cell and the run
// plays underneath. sessions are never colour-coded.

export type LabRow = {
  key: string;
  standard: boolean[];
  cells: { level: string; outcome: "happens" | "prevented" | "40001"; text: string; steps: SessionStep[]; scenario: { engine?: { version?: string; build?: string }; scenario?: string } }[];
};

const SHORT: Record<string, string> = { "read uncommitted": "RU", "read committed": "RC", "repeatable read": "RR", serializable: "SER" };

export function AnomalyLabView({ rows, sessions, start }: { rows: LabRow[]; sessions: string[]; start: [string, string] }) {
  const levels = rows[0].cells.map((c) => c.level);
  const [pick, setPick] = useState<[number, number]>(() => [Math.max(0, rows.findIndex((r) => r.key === start[0])), Math.max(0, levels.indexOf(start[1]))]);
  const row = rows[pick[0]];
  const cell = row.cells[pick[1]];
  const allowed = row.standard[pick[1]];
  const run: Run = { steps: cell.steps, trace: cell.scenario as unknown as PgTrace, verdict: { ok: cell.outcome !== "happens", what: row.key, text: cell.text } };

  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[300px] table-fixed border-collapse text-11 ${FIG_TABLE}`} aria-label="anomalies by isolation level: the standard and postgres">
          <colgroup>
            <col className="w-[27%]" />
            {levels.map((l) => (
              <col key={l} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-0 px-1 pb-2 text-left text-[10px] text-faint">
                <span className="hidden @min-[600px]:block">top: the standard</span>
                <span className="hidden @min-[600px]:block">bottom: postgres</span>
              </th>
              {levels.map((l) => (
                <th key={l} className="border-0 px-0.5 pb-2 text-center text-mute" title={l}>
                  <span className="@min-[600px]:hidden">{SHORT[l] ?? l}</span>
                  <span className="hidden leading-tight @min-[600px]:inline">{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className="border-0 px-1 py-1.5 text-left leading-tight text-hi">
                  {r.key}
                </th>
                {r.cells.map((c, li) => {
                  const sel = ri === pick[0] && li === pick[1];
                  const std = r.standard[li];
                  const pg = c.outcome === "happens" ? "happens" : c.outcome === "40001" ? "40001" : "no";
                  const tone = c.outcome === "happens" ? "dead" : "live";
                  return (
                    <td key={c.level} className="p-[3px] align-middle">
                      <button
                        type="button"
                        aria-pressed={sel}
                        onClick={() => setPick([ri, li])}
                        aria-label={`${r.key} at ${c.level}: the standard ${std ? "allows it" : "rules it out"}, postgres ${c.outcome === "happens" ? "let it happen" : c.outcome === "40001" ? "stopped it with a 40001" : "prevented it"}`}
                        className="grid w-full gap-[3px] rounded-xs px-0.5 py-1 text-center leading-[1.25] transition-[box-shadow,background-color] duration-200 ease-sfe"
                        style={{ boxShadow: sel ? ring("hot", undefined, 1.5) : ring("line"), background: sel ? tint("hot", 7) : undefined }}
                      >
                        <span className="truncate text-[10px]" style={{ color: std ? "var(--mute)" : "var(--faint)" }}>
                          {std ? "allowed" : "no"}
                        </span>
                        <span
                          className="mx-auto max-w-full truncate rounded-[3px] px-1 text-[10.5px]"
                          style={{ color: `var(--${tone})`, background: c.outcome === "happens" ? tint("dead", 12) : undefined, boxShadow: c.outcome === "40001" ? ring("live", 55) : undefined }}
                        >
                          {pg === "happens" ? (
                            <>
                              <span className="@min-[600px]:hidden">yes</span>
                              <span className="hidden @min-[600px]:inline">happens</span>
                            </>
                          ) : (
                            pg
                          )}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend
        items={[
          ["mute", "the standard allows it"],
          ["dead", "postgres: it happened"],
          ["live", "postgres: prevented (40001 = by an error)"],
          ["hot", "the run below"],
        ]}
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-12">
        <span className="text-hi">{row.key}</span>
        <span className="text-faint">at</span>
        <span className="text-hot">{cell.level}</span>
        <span className="text-11 text-faint">
          the standard: {allowed ? "allowed" : "ruled out"} · postgres:{" "}
          <span style={{ color: cell.outcome === "happens" ? "var(--dead)" : "var(--live)" }}>{cell.outcome === "happens" ? "it happened" : cell.outcome === "40001" ? "40001" : "prevented"}</span>
        </span>
      </div>
      <SessionLanes key={`${pick[0]}-${pick[1]}`} sessions={sessions} options={[]} runs={{ "": run }} side="none" dense />
    </div>
  );
}
