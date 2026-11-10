import type { Capture } from "@/lib/db/captured";
import { HashSpillView, type SpillRun } from "./HashSpillView";
import { planText, prov, tidy } from "./source";

// server side: one hash join captured at several work_mem settings (text EXPLAIN ANALYZE). from
// each plan: the Hash node's Buckets, Batches and Memory Usage, the build side's temp pages
// written, the join's temp pages read and written, and the plan text itself. the client draws
// the batches; every number it shows is one of these.
//
//   <HashSpill trace={trace} build="orders" probe="order_items"
//     runs={[{ label: "4MB", step: 4, limitKB: 8192 }, { label: "256kB", step: 5, limitKB: 512 }]} />

export function HashSpill({
  trace,
  runs,
  build,
  probe,
}: {
  trace: Capture;
  runs: { label: string; step: number; limitKB: number }[];
  build: string;
  probe: string;
}) {
  const out: SpillRun[] = runs.map((r) => {
    const all = planText(trace, r.step).split("\n");
    const end = all.findIndex((l, j) => j > 0 && /^\S/.test(l));
    const lines = end < 0 ? all : all.slice(0, end);
    const text = lines.join("\n");
    const hash = /Buckets: (\d+)\s+Batches: (\d+)\s+Memory Usage: (\d+)kB/.exec(text);
    if (!hash) throw new Error(`HashSpill: no Hash line in step ${r.step} of ${trace.scenario}`);
    const top = lines.find((l) => /Buffers:/.test(l)) ?? "";
    const hashBuf = lines[lines.findIndex((l) => /Buckets:/.test(l)) + 1] ?? "";
    const num = (re: RegExp, s: string) => Number(re.exec(s)?.[1] ?? 0);
    const rowsOf = (rel: string) => num(new RegExp(`Seq Scan on ${rel}\\b[^(]*\\(actual rows=([\\d.]+)`), text);
    return {
      label: r.label,
      sql: tidy(trace.steps[r.step].sql),
      plan: text,
      note: trace.steps[r.step].note,
      buckets: Number(hash[1]),
      batches: Number(hash[2]),
      memKB: Number(hash[3]),
      limitKB: r.limitKB,
      tempRead: num(/temp read=(\d+)/, top),
      tempWritten: num(/temp(?: read=\d+)? written=(\d+)/, top),
      buildWritten: num(/temp written=(\d+)/, hashBuf),
      buildRows: rowsOf(build),
      probeRows: rowsOf(probe),
      hot: lines.flatMap((l, j) => (/Batches:|temp /.test(l) ? [j + 1] : [])),
    };
  });
  return <HashSpillView runs={out} build={build} probe={probe} source={prov(trace)} />;
}
