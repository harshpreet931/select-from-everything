import type { Capture } from "@/lib/db/captured";
import { PlanSwitchView, type SwitchRun } from "./PlanSwitchView";
import { planText, prov, tidy } from "./source";

// server side: one query (or a few) captured with text EXPLAIN under different settings or
// data, one pgtrace step per combination of options. the client gets each run's sql, its plan
// text, the lines to light, a note, and optionally one number pulled out of the plan for a
// small bar per run. nothing is computed in the browser.
//
//   <PlanSwitch trace={trace} axes={[{ key: "work_mem", values: ["4MB", "64kB"] }]}
//     runs={{ "4MB": 3, "64kB": 4 }} hot={["Sort Method"]}
//     metric={{ label: "kB on disk", re: /Disk: (\d+)kB/ }} />
//
// the metric is the first match in the plan text, which is the top-most node that prints it:
// /Buffers: shared(?: hit=(\d+))?(?: read=(\d+))?/ adds the top node's hits and reads.

type Axis = { key: string; values: (string | { v: string; label: string })[] };

export function PlanSwitch({
  trace,
  axes,
  runs,
  hot = [],
  live = [],
  dead = [],
  metric,
  start,
  file = "query.sql",
}: {
  trace: Capture;
  axes: Axis[];
  /** option values joined with " | " → the step that ran it, and optionally a note instead of the step's, and the
   *  sql to show instead of the step's (when an earlier step set something this one relies on: say it here) */
  runs: Record<string, number | { step: number; note?: string; sql?: string }>;
  /** plan lines containing any of these are lit hot / live / dead */
  hot?: string[];
  live?: string[];
  dead?: string[];
  /** a number pulled out of each plan: the first match of `re`, its capture groups added up (hit + read), drawn as a bar per run */
  metric?: { label: string; re: RegExp; unit?: string };
  start?: string[];
  file?: string;
}) {
  const out: Record<string, SwitchRun> = {};
  for (const [key, r] of Object.entries(runs)) {
    const i = typeof r === "number" ? r : r.step;
    const st = trace.steps[i];
    if (!st) throw new Error(`PlanSwitch: no step ${i} in ${trace.scenario}`);
    // the plan without its unindented summary (Planning: buffers, triggers): the planner's own
    // catalog reads depend on what the capture ran before, the plan's numbers don't
    const all = planText(trace, i).split("\n");
    const end = all.findIndex((l, j) => j > 0 && /^\S/.test(l));
    const lines = end < 0 ? all : all.slice(0, end);
    const plan = lines.join("\n");
    const mark = (subs: string[]) => lines.flatMap((l, j) => (subs.some((s) => l.includes(s)) ? [j + 1] : []));
    let value: number | undefined;
    if (metric) {
      const m = new RegExp(metric.re.source, metric.re.flags.replace("g", "")).exec(plan);
      value = m ? m.slice(1).reduce((s, x) => s + Number(x ?? 0), 0) : 0;
    }
    out[key] = {
      sql: (typeof r === "number" ? undefined : r.sql) ?? tidy(st.sql),
      plan,
      note: (typeof r === "number" ? undefined : r.note) ?? st.note,
      hot: mark(hot),
      live: mark(live),
      dead: mark(dead),
      ...(value !== undefined ? { value } : {}),
    };
  }
  const axesOut = axes.map((a) => ({ key: a.key, values: a.values.map((v) => (typeof v === "string" ? { v, label: v } : v)) }));
  return <PlanSwitchView axes={axesOut} runs={out} start={start} metric={metric ? { label: metric.label, unit: metric.unit } : undefined} file={file} source={prov(trace)} />;
}
