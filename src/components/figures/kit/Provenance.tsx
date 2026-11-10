import { site } from "@/lib/site";

// where a figure's data came from, in one faint line under it. every figure that says
// "postgres does" carries trace or sim provenance; textbook figures say "drawn by hand";
// numbers timed or counted outside postgres say how and where they were measured:
//
//   <Provenance trace={trace} />                         real output, postgres 18.6 (PGlite 0.5.12) · update-twice
//   <Provenance sim="model of the clock sweep" checked />  model of the clock sweep · checked against postgres 18.6
//   <Provenance measured="on this mac (m4 pro), small c programs, see the deep below" />
//                                                         measured on this mac (m4 pro), small c programs, see the deep below
//   <Provenance recorded="psql 18.6 against a local server, via a pty" />
//                                                         recorded: psql 18.6 against a local server, via a pty
//   <Provenance drawn />                                 drawn by hand

/** "real output, postgres 18.6 (PGlite 0.5.12) · update-twice" or "real output, a postgres 18.6 server · ..." */
export function provenanceText(trace: { engine?: { version?: string; build?: string }; scenario?: string }): string {
  const v = /\d+\.\d+/.exec(String(trace.engine?.version ?? ""))?.[0] ?? site.pg.version;
  const where = trace.engine?.build ? `postgres ${v} (${trace.engine.build})` : `a postgres ${v} server`;
  const file = trace.scenario?.replace(/^content\/[^/]+\/(traces\/)?/, "").replace(/\.scenario\.sql$/, "");
  return `real output, ${where}${file ? ` · ${file}` : ""}`;
}

export function Provenance({
  trace,
  sim,
  checked,
  measured,
  recorded,
  drawn,
  className = "",
}: {
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
  /** a sim's one-line description: "model of clock sweep, simplified: one backend, no bgwriter" */
  sim?: string | boolean;
  /** the sim is tested against real postgres output (src/lib/db/sim/*.test.ts) */
  checked?: boolean;
  /** numbers measured outside postgres: where, on what, how. reads "measured <this>" */
  measured?: string;
  /** a transcript captured as is (a psql session through a pty, a log): reads "recorded: <this>" */
  recorded?: string;
  drawn?: boolean | string;
  className?: string;
}) {
  let text: string;
  if (trace) text = provenanceText(trace);
  else if (sim) text = `${typeof sim === "string" ? sim : "model"}${checked ? ` · checked against postgres ${site.pg.version}` : ""}`;
  else if (measured) text = /^measured\b/.test(measured) ? measured : `measured ${measured}`;
  else if (recorded) text = /^recorded\b/.test(recorded) ? recorded : `recorded: ${recorded}`;
  else text = typeof drawn === "string" ? `drawn by hand · ${drawn}` : "drawn by hand";
  return <div className={`text-right text-[10px] leading-4 text-faint ${className}`}>{text}</div>;
}
