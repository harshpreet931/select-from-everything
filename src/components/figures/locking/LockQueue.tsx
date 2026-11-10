import { QueueStepper, type QueueRun } from "./QueueStepper";
import { asTrace, lanesOf, provOf, queueOf, rounds, type Capture, type LanesOpts } from "./lanes";

// server side: a lock queue capture → the lanes and, per step, the queue on one relation.
// rounds of the capture (split at "round ..." observer steps) become an option switch.
//
//   <LockQueue trace={lockQueue} rel="accounts" byRound={["no timeout", "lock_timeout = 2s"]} obs={{ 4: "who blocks whom?" }} />

export function LockQueue({ trace, rel, byRound, obs }: { trace: Capture; rel: string; byRound?: string[]; obs?: LanesOpts["obs"] }) {
  const rs = byRound ? rounds(trace) : [undefined];
  const labels = byRound ?? [""];
  const runs: Record<string, QueueRun> = Object.fromEntries(
    labels.map((label, k) => [label, { sessions: asTrace(trace).sessions, steps: lanesOf(trace, { only: rs[k], obs, noSnaps: true }), queues: queueOf(trace, rel, rs[k]) }]),
  );
  return <QueueStepper runs={runs} rel={rel} option="the migration runs with" prov={provOf(trace)} />;
}
