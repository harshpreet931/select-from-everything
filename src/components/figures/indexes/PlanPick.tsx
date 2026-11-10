import type { Capture } from "@/lib/db/captured";
import { fromExplainJson } from "@/lib/db/fromTrace";
import { PlanPickView, type PickPlan } from "./PlanPickView";
import { oneLine, pagesOf, prov } from "./source";

// server side: a few captured plans of related queries (@explain steps), one per option. the
// client gets each plan as PlanNodes plus its sql and note, and, with `pages`, the buffer count
// at the top of each plan for a small comparison.
//
//   <PlanPick trace={trace} plans={[{ label: "(status, ordered_at)", step: 0 }, ...]} pages />

export function PlanPick({
  trace,
  plans,
  pages,
  keyLabel = "index",
  groupLabel,
  show = ["actual", "buffers"],
  sql,
}: {
  trace: Capture;
  plans: { label: string; group?: string; step: number; note?: string; tone?: "live" | "dead" }[];
  groupLabel?: string;
  /** draw a bar per option: Buffers (shared hit + read) at the top of each plan */
  pages?: boolean;
  keyLabel?: string;
  show?: ("est" | "actual" | "buffers" | "cost")[];
  /** override the sql shown for every option (when the step's sql is the same query) */
  sql?: string;
}) {
  const items: PickPlan[] = plans.map((p) => {
    const st = trace.steps[p.step];
    if (!st?.explain) throw new Error(`PlanPick: step ${p.step} in ${trace.scenario} has no plan`);
    return {
      label: p.label,
      ...(p.group ? { group: p.group } : {}),
      sql: sql ?? oneLine(st.sql),
      note: p.note ?? st.note,
      plan: fromExplainJson(st.explain),
      pages: pages ? pagesOf(trace, p.step) : undefined,
      tone: p.tone,
    };
  });
  return <PlanPickView items={items} keyLabel={keyLabel} groupLabel={groupLabel} show={show} source={prov(trace)} />;
}
