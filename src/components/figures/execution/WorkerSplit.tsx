import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";
import { planText, prov } from "./source";

// a parallel aggregate drawn as processes: the leader and each launched worker run their own
// copy of the plan below Gather, on their share of the table, and send a partial result up.
// every number is read from one captured text plan: workers launched, the parallel scan's rows
// and loops (rows is the average per process; the real split varies from run to run), the
// partial results Gather collected, the final row. server component.
//
//   <WorkerSplit trace={trace} step={2} table="big" />

export function WorkerSplit({ trace, step, table }: { trace: Capture; step: number; table: string }) {
  const text = planText(trace, step);
  const num = (re: RegExp) => {
    const m = re.exec(text);
    if (!m) throw new Error(`WorkerSplit: ${re} not in step ${step} of ${trace.scenario}`);
    return Number(m[1]);
  };
  const launched = num(/Workers Launched: (\d+)/);
  const planned = num(/Workers Planned: (\d+)/);
  const scanRows = num(new RegExp(`Parallel Seq Scan on ${table} \\(actual rows=([\\d.]+)`));
  const loops = num(new RegExp(`Parallel Seq Scan on ${table} \\(actual rows=[\\d.]+ loops=(\\d+)`));
  const gathered = num(/Gather \(actual rows=([\d.]+)/);
  const procs = Array.from({ length: loops }, (_, i) => (i === 0 ? "leader" : `worker ${i - 1}`));
  const total = Math.round(scanRows * loops);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12" role="img" aria-label={`${planned} workers planned, ${launched} launched; with the leader, ${loops} processes scan ${table}, about ${fmt(scanRows)} rows each, and send ${gathered} partial results to Gather`}>
      <div className="mx-auto w-fit rounded-md px-3 py-1.5 text-center shadow-[inset_0_0_0_1px_var(--line-2)]">
        <div className="text-hi">Finalize Aggregate</div>
        <div className="text-11 text-faint">adds the {gathered} partial counts: {fmt(total)}</div>
      </div>
      <div className="mx-auto h-3 w-px bg-line-2" />
      <div className="mx-auto w-fit rounded-md px-3 py-1.5 text-center shadow-[inset_0_0_0_1px_var(--line-2)]">
        <div className="text-hi">Gather</div>
        <div className="text-11 text-faint">
          Workers Planned: {planned} · Workers Launched: {launched} · {gathered} rows in
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(loops, 4)}, minmax(0, 1fr))` }}>
        {procs.map((p, i) => (
          <div key={p} className="grid min-w-0 gap-1 rounded-md px-2 py-2 text-center" style={{ boxShadow: i === 0 ? "inset 0 0 0 1.5px var(--hi)" : "inset 0 0 0 1px var(--line-2)" }}>
            <div className="text-11" style={{ color: i === 0 ? "var(--hi)" : "var(--mute)" }}>
              {p}
            </div>
            <div className="text-11 text-ink">Partial Aggregate</div>
            <div className="text-[10.5px] text-faint">↑ 1 row</div>
            <div className="text-11 text-ink">Parallel Seq Scan</div>
            <div className="text-[10.5px] text-mute tabular">≈ {fmt(scanRows)} rows</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-faint">
        <span>{table}: {fmt(total)} rows. the Parallel Seq Scan hands out blocks to whichever process asks next, so the split is never exactly even: EXPLAIN prints the average.</span>
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
