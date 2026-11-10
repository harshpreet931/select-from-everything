import type { PgTrace } from "@/lib/db/pgtrace";
import type { Source, Stepped } from "@/lib/db/views";

// every primitive that draws a View takes a Source: one view, hand-written steps, or a
// trace plus an adapter. this turns any of them into steps.

export function stepsOf<V>(src: Source<V>, adapt: (trace: PgTrace, i: number, select?: string) => V | undefined): Stepped<V>[] {
  if ("view" in src && src.view) return [{ view: src.view }];
  if ("steps" in src && src.steps) return src.steps;
  if ("trace" in src && src.trace) {
    const t = src.trace;
    const out: Stepped<V>[] = [];
    t.steps.forEach((st, i) => {
      const v = adapt(t, i, src.select);
      if (v) out.push({ view: v, note: st.note, label: `${st.session}: ${st.sql.trim()}` });
    });
    return out;
  }
  return [];
}

export const traceOf = <V,>(src: Source<V>): PgTrace | undefined => ("trace" in src ? src.trace : undefined);

export { StepSql } from "./StepSql";
