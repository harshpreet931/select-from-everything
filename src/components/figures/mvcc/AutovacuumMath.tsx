import type { PgTrace } from "@/lib/db/pgtrace";
import { AutovacuumMathView, type AvSettings } from "./AutovacuumMathView";

// server side: the defaults a real server reported (the vacuum-settings capture's first step),
// handed to the client calculator. nothing else of the trace ships.
//
//   <AutovacuumMath trace={settings} />

export function AutovacuumMath({ trace }: { trace: PgTrace }) {
  const rows = trace.steps[0]?.result?.data ?? [];
  const get = (name: string) => Number(rows.find((r) => r[0] === name)?.[1] ?? NaN);
  const s: AvSettings = {
    base: get("autovacuum_vacuum_threshold"),
    scale: get("autovacuum_vacuum_scale_factor"),
    max: get("autovacuum_vacuum_max_threshold"),
    insBase: get("autovacuum_vacuum_insert_threshold"),
    insScale: get("autovacuum_vacuum_insert_scale_factor"),
    anBase: get("autovacuum_analyze_threshold"),
    anScale: get("autovacuum_analyze_scale_factor"),
  };
  const v = /\d+\.\d+/.exec(String(trace.engine.version))?.[0] ?? trace.engine.version;
  return <AutovacuumMathView s={s} version={v} />;
}
