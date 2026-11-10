import { WaitForGraph } from "@/components/db/WaitForGraph";
import { Provenance } from "@/components/figures/kit";
import type { WfgView } from "@/lib/db/views";
import { asTrace, provOf, type Capture } from "./lanes";

// server side: the wait-for graph at the moment the detector found the cycle, built only from
// the 40P01's DETAIL lines ("Process T3 waits for ShareLock on transaction 759; blocked by
// process T1."). each session holds its own xid lock; the waiter wants the next one's. copied
// from the transactions part's DeadlockGraph, for any number of sessions.

export function CycleGraph({ trace }: { trace: Capture }) {
  const tr = asTrace(trace);
  const err = tr.steps.find((s) => s.error?.sqlstate === "40P01")?.error;
  if (!err?.detail) return null;
  const lines = [...err.detail.matchAll(/Process (\S+) waits for (\w+) on transaction (\d+); blocked by process (\S+)\./g)];
  const holder: Record<string, string> = {};
  for (const [, , , xid, by] of lines) holder[xid] = by;
  const own = (who: string) => Object.entries(holder).find(([, by]) => by === who)?.[0];
  // sessions only, each labelled with the xid it holds; an edge is "waits for" the holder of the xid it wants
  const v: WfgView = {
    nodes: lines.map(([, who]) => ({ id: who, sub: `xid ${own(who)}` })),
    waits: lines.map(([, who, , , by]) => [who, by]),
    cycle: lines.map(([, who, , , by]) => [who, by]),
  };
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <WaitForGraph {...v} />
      <Provenance trace={provOf(trace)} />
    </div>
  );
}
