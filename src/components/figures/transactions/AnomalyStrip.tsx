import { LaneTable } from "@/components/db/SessionLanes";
import { Provenance, Verdict } from "@/components/figures/kit";
import type { Ink } from "@/components/figures/kit/tone";
import type { SessionOp } from "@/lib/db/views";
import { judgeAnomaly, type AnomalyKey } from "./anomalies";
import { asTrace, type Capture } from "./lanes";

// server side: one anomaly at one isolation level, the whole captured schedule at once (no
// stepper), with the statement that shows it tinted and the verdict under it. for reading next
// to the prose; the AnomalyLab is where you click around.
//
//   <AnomalyStrip anomaly="phantom" trace={phantom} level="read committed" mark={3} />

export function AnomalyStrip({ anomaly, trace, level, mark }: { anomaly: AnomalyKey; trace: Capture; level: string; mark?: number }) {
  const cell = judgeAnomaly(anomaly, trace).find((c) => c.level === level);
  if (!cell) return null;
  const tone: Ink = cell.outcome === "happens" ? "dead" : "live";
  // tint the op that shows the anomaly: the nth step of this round, in the session that ran it
  const steps = cell.steps.map((s, i) =>
    i === mark ? { ...s, ops: s.ops?.map((o): SessionOp | null => (o && typeof o !== "string" && !o.error && !o.wait ? { ...o, tone } : o)) } : s,
  );
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="font-mono text-11 text-faint">
        {anomaly} · <span className="text-mute">{level}</span>
      </div>
      <LaneTable sessions={asTrace(trace).sessions} steps={steps} cur={steps.length} dense />
      <Verdict ok={cell.outcome !== "happens"} what={anomaly}>
        {cell.text}
      </Verdict>
      <Provenance trace={cell.scenario} />
    </div>
  );
}
