import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";
import { prov } from "./source";

// what "actual rows=5.59 loops=66" is made of: one bar per loop (one per outer row), as tall
// as the rows that loop returned, read from a captured query that counts them, and the
// per-loop average EXPLAIN printed as a line across them. server component.
//
//   <LoopBars trace={trace} step={4} col={1} rows={5.59} loops={66} label="orders per customer" />

export function LoopBars({ trace, step, col = 1, rows, loops, label }: { trace: Capture; step: number; col?: number; rows: number; loops: number; label: string }) {
  const data = (trace.steps[step]?.result?.data ?? []).map((r) => Number(r[col]));
  if (data.length !== loops) throw new Error(`LoopBars: ${data.length} values for ${loops} loops in ${trace.scenario}`);
  const total = data.reduce((a, b) => a + b, 0);
  const max = Math.max(...data);
  const H = 120;
  const avgY = H - (rows / max) * H;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-11 text-faint">loops</div>
          <div className="text-14 text-hi tabular">{fmt(loops)}</div>
        </div>
        <div>
          <div className="text-11 text-faint">actual rows (per loop)</div>
          <div className="text-14 text-hot tabular">{rows.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-11 text-faint">rows in total</div>
          <div className="text-14 text-hi tabular">{fmt(total)}</div>
        </div>
      </div>
      <div className="relative" role="img" aria-label={`${loops} loops, one per outer row, returning between ${Math.min(...data)} and ${max} rows each, ${total} in total, an average of ${rows.toFixed(2)}`}>
        <div className="flex items-end gap-px" style={{ height: H }}>
          {data.map((v, i) => (
            <span key={i} title={`loop ${i + 1}: ${v} ${v === 1 ? "row" : "rows"}`} className="min-w-0 flex-1 rounded-t-[1px]" style={{ height: `${(v / max) * 100}%`, background: "var(--mute)", opacity: 0.55 }} />
          ))}
        </div>
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed" style={{ top: avgY, borderColor: "var(--hot)" }} />
        <span className="absolute right-0 -translate-y-full pb-0.5 text-[10.5px] text-hot tabular" style={{ top: avgY }}>
          average {rows.toFixed(2)}
        </span>
      </div>
      <div className="flex justify-between text-[10.5px] text-faint">
        <span>loop 1</span>
        <span>{label}, one bar per loop</span>
        <span>loop {loops}</span>
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
