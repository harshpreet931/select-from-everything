import type { Capture } from "@/lib/db/captured";
import { AggWalkView } from "./AggWalkView";
import { prov } from "./source";

// server side: a dozen captured rows (`rows`: id, key) and the real GROUP BY of them (`result`:
// key, count). the client walks the two strategies over those rows; the counts both end with
// are checked here against what postgres returned, before anything is drawn.
//
//   <AggWalk trace={trace} rows={0} result={1} />

export function AggWalk({ trace, rows, result }: { trace: Capture; rows: number; result: number }) {
  const input = (trace.steps[rows]?.result?.data ?? []).map((r) => ({ id: String(r[0]), key: String(r[1]) }));
  const real = Object.fromEntries((trace.steps[result]?.result?.data ?? []).map((r) => [String(r[0]), Number(r[1])]));
  const model: Record<string, number> = {};
  for (const r of input) model[r.key] = (model[r.key] ?? 0) + 1;
  const keys = Object.keys(real);
  if (!input.length || keys.length !== Object.keys(model).length || keys.some((k) => model[k] !== real[k])) {
    throw new Error(`AggWalk: the model's counts don't match postgres's GROUP BY in ${trace.scenario}`);
  }
  return <AggWalkView input={input} source={prov(trace)} />;
}
