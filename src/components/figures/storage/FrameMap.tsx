import type { PgTrace } from "@/lib/db/pgtrace";
import { FrameMapView, type FrameMoment } from "./FrameMapView";
import { oneLine, prov } from "./source";

// server side: which frames hold which table, at chosen steps of a capture with the buffers
// probe. main fork only; every other frame is counted as "anything else".
//
//   <FrameMap trace={ring} steps={[1, 2, 3]} labels={["reading hot", ...]} rels={["hot", "events"]} size={256} />

export function FrameMap({ trace, steps, labels, rels, size }: { trace: PgTrace; steps: number[]; labels: string[]; rels: string[]; size: number }) {
  const moments: FrameMoment[] = steps.map((i, k) => {
    const st = trace.steps[i];
    const frames = st.buffers?.frames ?? [];
    const mine = Object.fromEntries(rels.map((r) => [r, frames.filter((f) => f.rel === r && f.fork === "main").map((f) => f.id)]));
    const placed = Object.values(mine).reduce((a, ids) => a + ids.length, 0);
    const used = st.buffers?.summary.used ?? placed;
    const sql = oneLine(st.sql.split(";").filter((x) => !/^\s*SET\b/i.test(x) && x.trim()).at(-1) ?? st.sql);
    return { label: labels[k] ?? `step ${i}`, sql, note: st.note, rels: mine, other: used - placed };
  });
  return <FrameMapView moments={moments} size={size} rels={rels} source={prov(trace)} />;
}
