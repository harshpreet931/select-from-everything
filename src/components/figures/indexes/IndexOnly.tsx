import type { Capture } from "@/lib/db/captured";
import { fromExplainJson } from "@/lib/db/fromTrace";
import { IndexOnlyView, type Moment } from "./IndexOnlyView";
import { oneLine, pagesOf, planNodesOf, prov } from "./source";

// server side of the index-only stepper (traces/index-only.scenario.sql): the visibility map of
// one table, carried forward from the last step that probed it, next to each captured plan. the
// client gets one small record per step: the bits, the sql, the note, and the plan if there is one.
//
//   <IndexOnly trace={trace} rel="o" steps={[1, 3, 4, 5, 6, 7, 8, 9]} />

type VmRow = { block: number; allVisible: boolean; allFrozen: boolean };

export function IndexOnly({ trace, rel, steps }: { trace: Capture; rel: string; steps: number[] }) {
  let vm: boolean[] = [];
  const at: boolean[][] = trace.steps.map((st) => {
    const v = (st as unknown as { vm?: Record<string, VmRow[]> }).vm?.[rel];
    if (v) vm = v.map((r) => r.allVisible);
    return vm;
  });
  const moments: Moment[] = steps.map((i) => {
    const st = trace.steps[i];
    const sql = oneLine(st.sql.split(";").filter((x) => x.trim() && !/^\s*(RESET|SET)\b/i.test(x)).join(";") || st.sql);
    const m: Moment = { sql, note: st.note, vm: at[i] };
    if (st.explain) {
      const scan = planNodesOf(trace, i).find((n) => /Scan$/.test(String(n["Node Type"])) && n["Node Type"] !== "Bitmap Index Scan");
      m.plan = fromExplainJson(st.explain);
      m.scan = String(scan?.["Node Type"] ?? "");
      m.heapFetches = scan?.["Heap Fetches"] != null ? Number(scan["Heap Fetches"]) : undefined;
      m.pages = pagesOf(trace, i);
    }
    return m;
  });
  return <IndexOnlyView moments={moments} rel={rel} source={prov(trace)} />;
}
