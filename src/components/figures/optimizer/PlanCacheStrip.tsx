import type { Capture } from "@/lib/db/captured";
import { Chip } from "@/components/figures/kit/layout";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";
import { FIG_TABLE } from "@/components/figures/kit/classes";
import { prov } from "./source";

// one prepared statement's executions in a row (traces/plan-cache.scenario.sql): for each, the value
// passed, the plan EXECUTE used (captured with EXPLAIN EXECUTE, which goes through the plan cache),
// whether it was custom or generic (pg_prepared_statements' counters right after), its estimate and
// its cost. the execution where the cache switches to the generic plan is hot. server component.
//
//   <PlanCacheStrip trace={trace} />

type Exec = { n: number; value: string; kind: "custom" | "generic"; op: string; cost: number; rows: number; cond: string };

export function PlanCacheStrip({ trace }: { trace: Capture }) {
  const execs: Exec[] = [];
  let prev = { g: 0, c: 0 };
  trace.steps.forEach((s, i) => {
    const m = /^EXECUTE by_kind\('(\w+)'\)/.exec(s.sql.trim());
    if (!m || !s.explain || s.note?.startsWith("plan_cache_mode") || s.note?.startsWith("force_")) return;
    const next = trace.steps[i + 1]?.result?.data?.[0];
    if (!next) throw new Error(`PlanCacheStrip: no counters after step ${i}`);
    const now = { g: Number(next[0]), c: Number(next[1]) };
    const kind = now.g > prev.g ? "generic" : now.c > prev.c ? "custom" : null;
    if (!kind) throw new Error(`PlanCacheStrip: step ${i} moved neither counter`);
    prev = now;
    // the scan under the Aggregate is where custom and generic differ
    let p = (s.explain as { Plan: Record<string, unknown> }).Plan;
    const total = Number(p["Total Cost"]);
    while (p["Node Type"] === "Aggregate") p = (p.Plans as Record<string, unknown>[])[0];
    const cond = String(p.Filter ?? p["Recheck Cond"] ?? "");
    if ((kind === "generic") !== cond.includes("$1")) throw new Error(`PlanCacheStrip: step ${i} is ${kind} but its condition is ${cond}`);
    execs.push({ n: execs.length + 1, value: m[1], kind, op: String(p["Node Type"]), cost: total, rows: Number(p["Plan Rows"]), cond });
  });
  const flip = execs.findIndex((e) => e.kind === "generic");
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12">
      <div className="min-w-0 overflow-x-auto">
        <table className={`${FIG_TABLE} w-full min-w-[520px] border-collapse text-12`} aria-label="executions of the prepared statement, the plan each one used, and whether it was custom or generic">
          <thead>
            <tr className="text-left text-11 text-faint">
              <th className="py-1.5 pr-3 font-normal">#</th>
              <th className="py-1.5 pr-3 font-normal">EXECUTE by_kind(…)</th>
              <th className="py-1.5 pr-3 font-normal">plan</th>
              <th className="py-1.5 pr-3 font-normal">condition</th>
              <th className="py-1.5 pr-3 text-right font-normal">est. rows</th>
              <th className="py-1.5 text-right font-normal">total cost</th>
            </tr>
          </thead>
          <tbody>
            {execs.map((e, i) => (
              <tr key={e.n} className="border-t border-line" style={{ background: i === flip ? "color-mix(in srgb, var(--hot) 8%, transparent)" : undefined }}>
                <td className="py-1.5 pr-3 text-faint tabular">{e.n}</td>
                <td className="py-1.5 pr-3 text-ink">&apos;{e.value}&apos;</td>
                <td className="py-1.5 pr-3">
                  <Chip tone={e.kind === "generic" ? "hot" : "mute"} dashed={e.kind === "custom"}>
                    {e.kind}
                  </Chip>{" "}
                  <span className="text-mute">{e.op.replace(" Heap", "")}</span>
                </td>
                <td className="py-1.5 pr-3 text-ink">{e.cond.replace(/::text/g, "")}</td>
                <td className="py-1.5 pr-3 text-right tabular text-ink">{fmt(e.rows)}</td>
                <td className="py-1.5 text-right tabular text-hi">{e.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
