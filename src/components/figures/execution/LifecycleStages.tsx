import type { Capture } from "@/lib/db/captured";
import { LifecycleStagesView, type Stage } from "./LifecycleStagesView";
import { prov, tidy } from "./source";

// server side: one query's trip through postgres, from a native capture with debug_print_parse,
// debug_print_rewritten and debug_print_plan on (the log probe of step `step`). the three trees
// are hundreds of lines each, so each stage keeps only the lines whose field is listed in its
// `keep` (":relid", "{OPEXPR", ...), each distinct line once, in order, with "…" where lines
// were dropped; the figure says how many it kept. the parser stage has no tree (postgres 18 can't
// log the raw parse tree) and the executor stage shows the step's result.
//
//   <LifecycleStages trace={trace} step={1} stages={[{ id: "parser", label, note }, { id: "analyzer", label, note, keep: [":relid"] }, ...]} />

type In = { id: "parser" | "analyzer" | "rewriter" | "planner" | "executor"; label: string; sub: string; note: string; keep?: string[] };

const SECTION: Record<string, string> = { analyzer: "LOG:  parse tree:", rewriter: "LOG:  rewritten parse tree:", planner: "LOG:  plan:" };

export function LifecycleStages({ trace, step, stages }: { trace: Capture; step: number; stages: In[] }) {
  const st = trace.steps[step] as (typeof trace.steps)[number] & { log?: string[] };
  const log = st.log ?? [];
  const sql = tidy(st.sql);
  const out: Stage[] = stages.map((s) => {
    if (s.id === "parser") return { id: s.id, label: s.label, sub: s.sub, note: s.note, code: sql, lang: "sql" };
    if (s.id === "executor") {
      const r = st.result;
      const text = r ? [r.columns.map((c) => c.name).join(" | "), ...r.data.map((row) => row.join(" | ")), `(${r.data.length} row${r.data.length === 1 ? "" : "s"})`].join("\n") : "";
      return { id: s.id, label: s.label, sub: s.sub, note: s.note, code: text, lang: "text" };
    }
    const from = log.indexOf(SECTION[s.id]);
    if (from < 0) throw new Error(`LifecycleStages: no "${SECTION[s.id]}" in the log of step ${step} (${trace.scenario})`);
    const to = log.findIndex((l, i) => i > from && l.startsWith("STATEMENT:"));
    const body = log.slice(from + 1, to < 0 ? undefined : to).map((l) => l.replace(/^DETAIL:\s{2}/, "").replace(/\t/g, "  ").trimEnd());
    const keep = s.keep ?? [];
    const seen = new Set<string>();
    const lines: string[] = [];
    let last = -1;
    body.forEach((l, i) => {
      const t = l.trim();
      if (!keep.some((k) => t === k || t.startsWith(`${k} `))) return;
      if (seen.has(t)) return;
      seen.add(t);
      if (last >= 0 && i > last + 1) lines.push(`${l.match(/^\s*/)?.[0] ?? ""}…`);
      lines.push(l);
      last = i;
    });
    // trim the common indentation
    const ind = Math.min(...lines.filter((l) => l.trim() && l.trim() !== "…").map((l) => l.match(/^\s*/)![0].length));
    return { id: s.id, label: s.label, sub: s.sub, note: s.note, code: lines.map((l) => l.slice(Math.min(ind, l.match(/^\s*/)![0].length))).join("\n"), lang: "text", kept: seen.size, of: body.length };
  });
  return <LifecycleStagesView stages={out} source={prov(trace)} />;
}
