import type { PgTrace } from "@/lib/db/pgtrace";
import { PageFillStepper, type FillStep } from "./PageFillStepper";
import { oneLine, prov } from "./source";

// server side of the page stepper: picks page 0 of one table out of every step of a capture,
// plus the step's sql and note, and hands only that to the client.
//
//   <PageFill trace={pageFill} rel="slots" />

export function PageFill({ trace, rel, start }: { trace: PgTrace; rel: string; start?: number }) {
  const steps: FillStep[] = trace.steps.map((st) => {
    const xact = st.xact ?? {};
    const xs = Object.keys(xact).map(Number);
    // one session, nothing left open after a step: anything a committed xid deleted is dead to everyone
    const horizon = (xs.length ? Math.max(...xs) : 0) + 1;
    return { session: st.session, sql: st.session === "obs" && !st.sql.trim() ? "-- look at the table" : oneLine(st.sql), note: st.note, page: st.heap?.[rel]?.[0] ?? null, xact, horizon };
  });
  return <PageFillStepper steps={steps} source={prov(trace)} start={start} />;
}
