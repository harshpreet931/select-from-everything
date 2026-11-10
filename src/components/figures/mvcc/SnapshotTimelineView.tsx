"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { NARR, Narration, Row, Words, useReducedMotion } from "@/components/figures/kit";
import { LaneTable } from "@/components/db/SessionLanes";
import { SnapshotLine } from "@/components/db/SnapshotLine";
import type { SessionStep, Snap, XactStatus } from "@/lib/db/views";

// the sessions on the left, one stepper; on the right the snapshot of the session you pick, at
// this step, on the xid number line. click an xid for the verdict. step forward and watch a
// read committed snapshot move while a repeatable read one stays put.

export type SnapMoment = {
  xact: Record<number, XactStatus>;
  snaps: Record<string, { snap: Snap | null; xid: number | null; inTxn: boolean; iso: string }>;
};

export function SnapshotTimelineView({
  sessions,
  lanes,
  moments,
  who,
  start,
  source,
}: {
  sessions: string[];
  lanes: SessionStep[];
  moments: SnapMoment[];
  who: string[];
  start: number;
  source: string;
}) {
  const s = useStepper(moments.length, { interval: 2200, start });
  const reduce = useReducedMotion();
  const [pick, setPick] = useState(who[0]);
  const m = moments[s.i];
  const cur = m.snaps[pick];
  const xs = Object.keys(m.xact).map(Number);
  const lo = Math.min(...xs, cur?.snap?.xmin ?? Infinity) - 1;
  const hi = Math.max(...xs, cur?.snap?.xmax ?? 0) + 1;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="snapshots, step by step">
      <Row k="snapshot of =" w="14ch" last>
        <Words label="whose snapshot" options={who.map((w) => ({ v: w, label: `${w} · ${m.snaps[w]?.iso ?? ""}` }))} value={pick} onChange={setPick} />
      </Row>
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[760px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0">
          <LaneTable sessions={sessions} steps={lanes} cur={s.i} dense />
        </div>
        <section className="min-w-0 self-start rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-label={`${pick}'s snapshot`}>
          <div className="mb-2 font-mono text-11 text-faint">
            {pick}&apos;s snapshot{cur?.xid ? ` · ${pick} is xid ${cur.xid}` : ""}
          </div>
          {cur?.snap ? (
            <SnapshotLine key={`${s.i}-${pick}`} snap={cur.snap} xact={m.xact} me={cur.xid} range={[lo, hi]} />
          ) : (
            <p className={`${NARR} text-mute`}>
              {cur?.inTxn
                ? `${pick} is in a transaction but hasn't run a query yet. BEGIN doesn't take a snapshot; the first statement does.`
                : `${pick} isn't in a transaction. its next statement takes a fresh snapshot.`}
            </p>
          )}
        </section>
      </div>
      <Narration minLines={2}>{lanes[s.i]?.note}</Narration>
      <StepControls s={s} compact={reduce} />
      <div className="text-right text-[10px] leading-4 text-faint">{source}</div>
    </div>
  );
}
