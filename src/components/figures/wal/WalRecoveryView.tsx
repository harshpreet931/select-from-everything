"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { FIG_TABLE, Legend, Narration, Provenance, ResultTable, Row, Words, statusLook, tv, useReducedMotion } from "@/components/figures/kit";
import { WalCells } from "@/components/db/WalStrip";
import { StepSql } from "@/components/db/StepSql";
import type { WalView, XactStatus } from "@/lib/db/views";

// the client half of WalRecovery: pick a capture, step through it. the WAL strip is the shared
// WalCells; under it the server's log as recovery prints it, and at the end what a new query
// sees, with the page's tuples and their xmin's commit status.

export type RecFrame = {
  phase: "run" | "crash" | "redo" | "after";
  who: string;
  sql: string;
  note: string;
  view: WalView;
  log?: string[];
  result?: { columns: { name: string; type?: string }[]; rows: (string | null)[][] };
  tuples?: { lp: number; xmin: number; status: XactStatus | string; body: string }[];
};
export type RecVariant = { key: string; label: string; frames: RecFrame[]; source: { engine: { version: string; build?: string }; scenario: string } };

const PHASE = { run: "running", crash: "crash", redo: "redo", after: "after restart" } as const;

function Stepper({ v }: { v: RecVariant }) {
  const reduce = useReducedMotion();
  const s = useStepper(v.frames.length, { interval: 1600 });
  const f = v.frames[s.i];
  const prev = s.i > 0 ? v.frames[s.i - 1].view.pages : undefined;
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]">
      <StepSql label={`${f.who}: ${f.sql}`} />
      <WalCells view={f.view} prevPages={prev} />
      {f.log && f.log.length > 0 && (
        <div className="min-w-0 overflow-x-auto rounded-md bg-well px-3 py-2 text-11 leading-[1.7] shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="mb-1 text-faint">server log</div>
          {f.log.map((l, i) => (
            <div key={i} className={`whitespace-pre ${/redo (starts|done)/.test(l) ? "text-hi" : "text-mute"}`}>
              {l}
            </div>
          ))}
        </div>
      )}
      {f.phase === "after" && (
        <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {f.result && (
            <div className="min-w-0">
              <div className="mb-1 text-11 text-faint">what the query returns</div>
              <ResultTable columns={f.result.columns} rows={f.result.rows} dense />
            </div>
          )}
          {f.tuples && f.tuples.length > 0 && (
            <div className="min-w-0">
              <div className="mb-1 text-11 text-faint">what page 0 holds</div>
              <table className={`${FIG_TABLE} w-full text-11`}>
                <thead>
                  <tr className="text-faint">
                    <th className="pr-3 text-left font-normal">lp</th>
                    <th className="pr-3 text-left font-normal">xmin</th>
                    <th className="pr-3 text-left font-normal">pg_xact says</th>
                    <th className="text-left font-normal">data</th>
                  </tr>
                </thead>
                <tbody>
                  {f.tuples.map((t) => {
                    const look = statusLook(t.status as XactStatus);
                    const dead = t.status === "aborted";
                    return (
                      <tr key={t.lp}>
                        <td className="pr-3 tabular text-faint">{t.lp}</td>
                        <td className="pr-3 tabular" style={{ color: tv(look.tone) }}>
                          {t.xmin}
                        </td>
                        <td className="pr-3" style={{ color: dead ? "var(--dead)" : "var(--live)" }}>
                          {t.status}
                        </td>
                        <td className={dead ? "text-mute line-through" : "text-ink"}>{t.body}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Narration minLines={3} tag={PHASE[f.phase]}>
        {f.note}
      </Narration>
      <Legend
        items={[
          ["live", "flush line: on disk from here back", "line"],
          ["mute", "in wal_buffers, not on disk", "dashed"],
          ["hot", "being replayed"],
          ["dead", "lost in the crash"],
          ["accent", "page newer in memory than on disk"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <Provenance trace={v.source} />
    </div>
  );
}

export function WalRecoveryView({ variants }: { variants: RecVariant[] }) {
  const [k, setK] = useState(variants[0].key);
  const v = variants.find((x) => x.key === k) ?? variants[0];
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]" aria-label="crash recovery, step by step">
      {variants.length > 1 && (
        <Row k="capture =" w="9ch" last>
          <Words label="which capture" options={variants.map((x) => ({ v: x.key, label: x.label }))} value={k} onChange={setK} />
        </Row>
      )}
      <Stepper key={v.key} v={v} />
    </div>
  );
}
