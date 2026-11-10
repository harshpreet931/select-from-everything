import type { PgTrace } from "@/lib/db/pgtrace";

// where a capture came from, said plainly. <Provenance /> reads "real postgres 18.6 output"
// for every trace; these figures also say which engine: a native server (two sessions,
// the real background processes) or PGlite (the one-session engine this page runs).

type Engine = PgTrace["engine"] & { build?: string };

export function engineText(trace: Pick<PgTrace, "engine" | "scenario">): string {
  const e = trace.engine as Engine;
  const v = /\d+\.\d+/.exec(String(e.version))?.[0] ?? e.version;
  const file = trace.scenario.replace(/^content\/[^/]+\//, "").replace(/\.scenario\.sql$/, "");
  return e.build ? `real postgres ${v} output · ${e.build}, the engine this page runs · ${file}` : `real postgres ${v} output · a native server · ${file}`;
}
