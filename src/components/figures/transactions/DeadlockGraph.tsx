import { WaitForGraph } from "@/components/db/WaitForGraph";
import { Provenance } from "@/components/figures/kit";
import type { WfgView } from "@/lib/db/views";
import { asTrace, provOf, type Capture } from "./lanes";

// server side: the wait-for graph at the moment postgres found the deadlock, built from the
// 40P01's DETAIL lines ("Process T2 waits for ShareLock on transaction 759; blocked by process
// T1.") and the transaction ids each session held. nothing is drawn that the error didn't say.
//
//   <DeadlockGraph trace={deadlock} />

export function DeadlockGraph({ trace }: { trace: Capture }) {
  const tr = asTrace(trace);
  const err = tr.steps.find((s) => s.error?.sqlstate === "40P01")?.error;
  if (!err?.detail) return null;
  const lines = [...err.detail.matchAll(/Process (\S+) waits for (\w+) on transaction (\d+); blocked by process (\S+)\./g)];
  // each session holds its own xid lock; the waiter wants that xid's lock in the mode the
  // DETAIL names (ShareLock), drawn as the lock node's sub-label
  const holder: Record<string, string> = {};
  for (const [, , , xid, by] of lines) holder[xid] = by;
  const v: WfgView = {
    nodes: lines.flatMap(([, who, mode, xid]) => [{ id: who }, { id: `xid ${xid}`, kind: "lock" as const, sub: `wanted: ${mode}` }]),
    holds: Object.entries(holder).map(([xid, by]) => [`xid ${xid}`, by]),
    waits: lines.map(([, who, , xid]) => [who, `xid ${xid}`]),
    cycle: lines.map(([, who, , xid]) => [who, `xid ${xid}`]),
  };
  // dedupe nodes, keep the order T, lock, T, lock so the circle alternates
  const seen = new Set<string>();
  v.nodes = v.nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <WaitForGraph {...v} />
      <Provenance trace={provOf(trace)} />
    </div>
  );
}
