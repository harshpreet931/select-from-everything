import type { PgTrace } from "@/lib/db/pgtrace";
import { FillCompareView, type FillMoment } from "./FillCompareView";
import { prov, records } from "./source";

// server side: the fillfactor capture's page_stats() rows, split by table, one moment per step.
//
//   <FillCompare trace={fillfactor} labels={["loaded", "after the UPDATE"]} tables={{ full100: "fillfactor 100", room70: "fillfactor 70" }} />

export function FillCompare({ trace, labels, tables }: { trace: PgTrace; labels: string[]; tables: Record<string, string> }) {
  // one moment per label: later steps of the capture (the cost query) aren't page stats
  const moments: FillMoment[] = trace.steps.slice(0, labels.length).map((st, i) => {
    const rs = records(st);
    return {
      label: labels[i] ?? `step ${i + 1}`,
      note: st.note,
      tables: Object.entries(tables).map(([name, caption]) => ({
        name,
        caption,
        pages: rs
          .filter((r) => r.rel === name)
          .map((r) => ({ block: Number(r.blkno), used: Number(r.live), dead: Number(r.dead), free: Number(r.free), allVisible: r.all_visible === "t", allFrozen: r.all_frozen === "t" })),
      })),
    };
  });
  return <FillCompareView moments={moments} source={prov(trace)} />;
}
