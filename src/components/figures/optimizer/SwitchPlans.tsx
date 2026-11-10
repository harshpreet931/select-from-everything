import type { Capture } from "@/lib/db/captured";
import { SwitchPlansView, type SwitchRun } from "./SwitchPlansView";
import { prov } from "./source";

// server side: one query's text EXPLAIN under different settings, one pgtrace step per option
// (the step's last statement is the EXPLAIN, the ones before it the settings). the client gets
// each option's settings, plan text, total cost and the step's note. text, not a tree, because
// the point includes lines a tree doesn't draw (Disabled: true).
//
//   <SwitchPlans trace={trace} keys={["none", "hash join"]} from={0} k="turned off" />

export function SwitchPlans({ trace, keys, from, k }: { trace: Capture; keys: string[]; from: number; k: string }) {
  const runs: SwitchRun[] = keys.map((key, j) => {
    const st = trace.steps[from + j];
    if (!st?.result) throw new Error(`SwitchPlans: no result at step ${from + j}`);
    const plan = st.result.data.map((r) => String(r[0])).join("\n");
    const cost = Number(/cost=[\d.]+\.\.([\d.]+)/.exec(plan)?.[1]);
    if (!Number.isFinite(cost)) throw new Error(`SwitchPlans: no cost in step ${from + j}`);
    const sets = st.sql
      .split("\n")
      .filter((l) => /^SET /i.test(l.trim()))
      .map((l) => l.trim());
    return { key, sets, plan, cost, note: st.note ?? "" };
  });
  return <SwitchPlansView runs={runs} k={k} source={prov(trace)} />;
}
