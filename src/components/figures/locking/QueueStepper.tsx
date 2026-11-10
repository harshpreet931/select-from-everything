"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { LaneTable } from "@/components/db/SessionLanes";
import { LockTable } from "@/components/db/LockTable";
import { Narration, Provenance, Row, Words, useReducedMotion } from "@/components/figures/kit";
import type { LockReq, SessionStep } from "@/lib/db/views";

// the flagship's figure: the sessions over time on one side, and the lock manager's queue on
// one table on the other, after every step. holders are solid, waiters dashed in the order they
// arrived. everything is from a capture; the server wrapper (LockQueue) slices it.

export type QueueRun = { sessions: string[]; steps: SessionStep[]; queues: LockReq[][] };

export function QueueStepper({
  runs,
  option = "run",
  rel,
  prov,
}: {
  runs: Record<string, QueueRun>;
  option?: string;
  rel: string;
  prov: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const labels = Object.keys(runs);
  const [pick, setPick] = useState(labels[0]);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      {labels.length > 1 && (
        <div>
          <Row k={`${option} =`} w={`${Math.max(9, option.length + 3)}ch`} last>
            <Words label={option} options={labels} value={pick} onChange={setPick} />
          </Row>
        </div>
      )}
      <Steps key={pick} run={runs[pick]} rel={rel} prov={prov} />
    </div>
  );
}

function Steps({ run, rel, prov }: { run: QueueRun; rel: string; prov: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const s = useStepper(run.steps.length, { interval: 2200 });
  const reduce = useReducedMotion();
  const q = run.queues[s.i] ?? [];
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label="lock queue step-through">
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[700px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <LaneTable sessions={run.sessions} steps={run.steps} cur={s.i} dense />
        <div className="grid min-w-0 content-start gap-2">
          <div className="text-11 text-faint">table locks on {rel} (pg_locks)</div>
          {q.length ? <LockTable requests={q} /> : <div className="rounded-md bg-well px-3 py-2 text-faint shadow-[inset_0_0_0_1px_var(--line)]">nobody holds or wants a lock on {rel}</div>}
        </div>
      </div>
      <Narration minLines={3}>{run.steps[s.i]?.note}</Narration>
      <StepControls s={s} compact={reduce} />
      <Provenance trace={prov} />
    </div>
  );
}
