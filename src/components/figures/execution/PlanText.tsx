import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { SqlPanel } from "@/components/figures/kit/SqlPanel";
import { planText, prov, tidy } from "./source";

// one captured text plan, with the query that produced it and the lines to look at lit. for
// output the page can't run itself (a native-only capture). server component.
//
//   <PlanText trace={trace} step={3} hot={["Gather Merge"]} />

export function PlanText({ trace, step, hot = [], sql = true }: { trace: Capture; step: number; hot?: string[]; sql?: boolean }) {
  const all = planText(trace, step).split("\n");
  const end = all.findIndex((l, j) => j > 0 && /^\S/.test(l));
  const lines = end < 0 ? all : all.slice(0, end);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12">
      {sql && <SqlPanel code={tidy(trace.steps[step].sql)} file="query.sql" wrap />}
      <SqlPanel code={lines.join("\n")} lang="plan" file="what postgres printed" hot={lines.flatMap((l, j) => (hot.some((h) => l.includes(h)) ? [j + 1] : []))} nolines />
      <Provenance trace={prov(trace)} />
    </div>
  );
}
