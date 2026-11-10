"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { FIG_TABLE, Narration, Provenance, Row, Words, ring, tint } from "@/components/figures/kit";

// the two-phase commit protocol, drawn by hand: a coordinator and two participants (think: two
// postgres servers, each running PREPARE TRANSACTION / COMMIT PREPARED). three runs. the
// participant states are the protocol's, not captured; traces/orphan-prepared shows one real
// participant stuck in "prepared".

type State = "working" | "prepared" | "committed" | "aborted" | "—";
type Frame = { coord: string; a: State; b: State; msg: string; note: string; tone?: "live" | "dead" | "hot" };
type Run = "everyone votes yes" | "bank B votes no" | "coordinator dies";

const RUNS: Record<Run, Frame[]> = {
  "everyone votes yes": [
    { coord: "begins", a: "working", b: "working", msg: "", note: "the transfer runs on both servers: bank A debits, bank B credits. nothing is committed anywhere." },
    { coord: "phase 1: prepare?", a: "working", b: "working", msg: "PREPARE TRANSACTION 't7' →  A, B", note: "the coordinator asks both to prepare. preparing means: make the work durable and promise to commit if asked." },
    { coord: "collecting votes", a: "prepared", b: "prepared", msg: "A: yes · B: yes", note: "both flush their WAL and vote yes. from now on neither may decide alone: they've promised.", tone: "hot" },
    { coord: "decides: commit", a: "prepared", b: "prepared", msg: "decision written to the coordinator's log", note: "every vote is yes, so the decision is commit. the coordinator records it durably before telling anyone." },
    { coord: "phase 2: commit", a: "committed", b: "committed", msg: "COMMIT PREPARED 't7' →  A, B", note: "both commit. the transfer happened everywhere, atomically.", tone: "live" },
  ],
  "bank B votes no": [
    { coord: "begins", a: "working", b: "working", msg: "", note: "the transfer runs on both servers." },
    { coord: "phase 1: prepare?", a: "working", b: "working", msg: "PREPARE TRANSACTION 't7' →  A, B", note: "the coordinator asks both to prepare." },
    { coord: "collecting votes", a: "prepared", b: "aborted", msg: "A: yes · B: no", note: "bank B can't (a constraint failed, say), so it aborts and votes no. A has prepared and waits.", tone: "dead" },
    { coord: "decides: abort", a: "prepared", b: "aborted", msg: "decision written to the coordinator's log", note: "one no is enough: the decision is abort." },
    { coord: "phase 2: roll back", a: "aborted", b: "aborted", msg: "ROLLBACK PREPARED 't7' →  A", note: "A rolls back its prepared transaction. nothing happened anywhere, which is also atomic.", tone: "live" },
  ],
  "coordinator dies": [
    { coord: "begins", a: "working", b: "working", msg: "", note: "the transfer runs on both servers." },
    { coord: "phase 1: prepare?", a: "working", b: "working", msg: "PREPARE TRANSACTION 't7' →  A, B", note: "the coordinator asks both to prepare." },
    { coord: "collecting votes", a: "prepared", b: "prepared", msg: "A: yes · B: yes", note: "both vote yes and wait for the decision." },
    { coord: "✕ crashed", a: "prepared", b: "prepared", msg: "", note: "the coordinator dies before sending phase two. A and B each know only their own vote. was the decision commit (B voted yes too) or abort (maybe B said no)? neither can tell.", tone: "dead" },
    { coord: "✕ still down", a: "prepared", b: "prepared", msg: "", note: "so they wait, holding their locks and their transaction ids, for as long as the coordinator is gone. this is the blocking problem: a prepared participant can't safely commit or abort on its own.", tone: "dead" },
  ],
};

const TONE: Record<State, "live" | "dead" | "hot" | undefined> = { working: undefined, prepared: "hot", committed: "live", aborted: "dead", "—": undefined };

export function TwoPhase() {
  const [run, setRun] = useState<Run>("everyone votes yes");
  const fs = RUNS[run];
  const s = useStepper(fs.length, { interval: 1700 });
  const f = fs[s.i];
  const cell = (st: State) => (
    <span className="inline-block rounded-xs px-1.5 leading-[22px]" style={{ boxShadow: ring(TONE[st] ?? "line-2", TONE[st] ? 60 : undefined), background: TONE[st] ? tint(TONE[st]!, 9) : undefined, color: TONE[st] ? `var(--${TONE[st]})` : undefined, outline: st === "working" ? "1px dashed var(--line-2)" : undefined }}>
      {st}
    </span>
  );
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-3 text-12 outline-none grid-cols-[minmax(0,1fr)]">
      <Row k="run =" w="6ch" last>
        <Words label="scenario" options={Object.keys(RUNS) as Run[]} value={run} onChange={(r) => { setRun(r); s.reset(); }} />
      </Row>
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[300px] border-collapse ${FIG_TABLE}`}>
          <thead>
            <tr className="text-11 text-faint">
              <th className="py-1 text-left">coordinator</th>
              <th className="px-1 py-1 text-left">bank A</th>
              <th className="px-1 py-1 text-left">bank B</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-2" style={{ color: f.coord.startsWith("✕") ? "var(--dead)" : "var(--hi)" }}>{f.coord}</td>
              <td className="px-1 py-2">{cell(f.a)}</td>
              <td className="px-1 py-2">{cell(f.b)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="min-h-6 text-11 text-ref">{f.msg || " "}</div>
      <Narration minLines={3} tag={`step ${s.i + 1}`}>{f.note}</Narration>
      <StepControls s={s} />
      <Provenance drawn="the textbook protocol: one coordinator, two participants" />
    </div>
  );
}
