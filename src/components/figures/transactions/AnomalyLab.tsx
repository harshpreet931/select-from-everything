import { ANOMALIES, STANDARD, judgeAnomaly, type AnomalyKey } from "./anomalies";
import { AnomalyLabView, type LabRow } from "./AnomalyLabView";
import { asTrace, type Capture } from "./lanes";

// server side: six anomaly captures (one per row), each run at all four isolation levels, judged
// into a grid. every postgres cell is a captured run; click it and the client view steps through
// that run. the standard's half of each cell comes from the manual's table 13.1.
//
//   <AnomalyLab traces={{ "dirty read": dirty, … }} start={["lost update", "read committed"]} />

export function AnomalyLab({ traces, start }: { traces: Record<AnomalyKey, Capture>; start?: [AnomalyKey, string] }) {
  const rows: LabRow[] = ANOMALIES.map((key) => ({
    key,
    standard: STANDARD[key],
    cells: judgeAnomaly(key, traces[key]).map((c) => ({ level: c.level, outcome: c.outcome, text: c.text, steps: c.steps, scenario: c.scenario })),
  }));
  const sessions = asTrace(traces["dirty read"]).sessions;
  return <AnomalyLabView rows={rows} sessions={sessions} start={start ?? ["lost update", "read committed"]} />;
}
