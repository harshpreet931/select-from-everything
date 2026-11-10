import { SessionLanes } from "@/components/db/SessionLanes";
import { xidNames } from "@/lib/db/fromTrace";
import { freshReader, visible } from "@/lib/db/visibility";
import type { Table } from "@/lib/db/views";
import { asTrace, lanesOf, runTrace, type Capture } from "./lanes";

// server side: a job queue capture as lanes, with the queue beside it after every step: which
// worker holds each job's row lock right now (the row's xmax is that worker's transaction, still
// in progress, read off the heap page) and who has finished it (done_by, committed). the lock
// holder comes from the page, not from the narration.
//
//   <QueueLanes trace={jobQueue} rel="jobs" />

export function QueueLanes({ trace, rel = "jobs", start = 0 }: { trace: Capture; rel?: string; start?: number }) {
  const tr = asTrace(trace);
  const names = xidNames(tr);
  const steps = lanesOf(tr, { noSnaps: true });
  const keep = tr.steps.map((_, i) => i).filter((i) => tr.steps[i].session !== "obs");
  keep.forEach((i, k) => {
    const st = tr.steps[i];
    const pages = st.heap?.[rel];
    if (!pages) return;
    const xact = st.xact ?? {};
    const reader = freshReader(xact);
    const rows: unknown[][] = [];
    for (const p of pages)
      for (const t of p.tuples) {
        if (!t.data || !visible(t, xact, reader).visible) continue;
        const holder = t.xmax && xact[t.xmax] === "in progress" ? (names[t.xmax] ?? `xid ${t.xmax}`) : null;
        const done = t.data.done_by ?? null;
        rows.push([t.data.id, holder ? { v: holder, tone: "meta" } : null, done ? { v: done, tone: "live" } : null]);
      }
    rows.sort((a, b) => Number(a[0]) - Number(b[0]));
    steps[k].db = { columns: ["job", "locked by", "done_by"], rows } as unknown as Table;
  });
  return <SessionLanes sessions={tr.sessions} options={[]} runs={{ "": { steps, trace: runTrace(trace) } }} side="db" start={start} dense />;
}
