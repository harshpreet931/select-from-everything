import type { PgTrace } from "@/lib/db/pgtrace";
import { HeapFile } from "@/components/db/HeapFile";
import { Provenance } from "@/components/figures/kit";
import { prov, records } from "./source";

// a table's pages as bars, one stepper step per capture step. each step of the capture ends
// with page_stats(), a query that returns one row per heap page: live and dead bytes (from
// heap_page_items), the free gap (page_header), and the two visibility map bits. this hands
// those rows to HeapFile, and only those.
//
//   <PageBars trace={fsmVm} />                       every step
//   <PageBars trace={fillfactor} rel="room70" />     only rows whose rel column matches

export function PageBars({ trace, rel, steps }: { trace: PgTrace; rel?: string; steps?: number[] }) {
  const idx = steps ?? trace.steps.map((_, i) => i);
  const views = idx.map((i) => {
    const st = trace.steps[i];
    const pages = records(st)
      .filter((r) => !rel || r.rel === rel)
      .map((r) => ({
        block: Number(r.blkno),
        used: Number(r.live),
        dead: Number(r.dead),
        free: Number(r.free),
        allVisible: r.all_visible === "t",
        allFrozen: r.all_frozen === "t",
      }));
    const first = st.sql.split(";")[0].replace(/\s+/g, " ").trim();
    const label = /^SELECT \* FROM page_stats/.test(first) ? "the table as loaded" : first;
    return { view: { rel: rel ?? "t", pages }, label, note: st.note };
  });
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <HeapFile steps={views} />
      <Provenance trace={prov(trace)} />
    </div>
  );
}
