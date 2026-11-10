import { SessionLanes, type Run } from "@/components/db/SessionLanes";
import { asTrace, lanesOf, runTrace, type Capture, type LanesOpts } from "./lanes";

// server side: one capture, or a few captures behind an option switch, as SessionLanes. the
// captures are read here and only the trimmed steps (ops, notes, snapshots, and the locks or
// committed rows the figure asks for) reach the browser, with each run's provenance line.
//
//   <TxLanes trace={deadlock} side="locks" locks={["transactionid", "tuple"]} />
//   <TxLanes option="the fix" side="none" cell={{ label: "alice", key: ["id", "1"], col: "balance" }}
//            runs={[{ label: "none", trace: lost, verdict: { ok: false, what: "lost update", text: "…" } }, …]} />

type Verdict = NonNullable<Run["verdict"]>;
type RunIn = { label: string; trace: Capture; verdict?: Verdict; only?: number[] };

export function TxLanes({
  trace,
  only,
  verdict,
  runs,
  option = "run",
  side = "none",
  start = 0,
  interval,
  dense,
  ...opts
}: {
  trace?: Capture;
  only?: number[];
  verdict?: Verdict;
  runs?: RunIn[];
  option?: string;
  side?: "db" | "versions" | "locks" | "none";
  start?: number;
  interval?: number;
  dense?: boolean;
} & Omit<LanesOpts, "only">) {
  const lanesOpts: LanesOpts = { ...opts, db: opts.db ?? side === "db" };
  const cells = opts.cell ? [opts.cell.label] : undefined;
  if (runs?.length) {
    const built: Record<string, Run> = Object.fromEntries(
      runs.map((r) => [r.label, { steps: lanesOf(r.trace, { ...lanesOpts, only: r.only }), trace: runTrace(r.trace), ...(r.verdict ? { verdict: r.verdict } : {}) }]),
    );
    return (
      <SessionLanes
        sessions={asTrace(runs[0].trace).sessions}
        options={[{ key: "run", label: option, values: runs.map((r) => r.label) }]}
        runs={built}
        side={side}
        cells={cells}
        start={start}
        interval={interval}
        dense={dense}
      />
    );
  }
  if (!trace) return null;
  const run: Run = { steps: lanesOf(trace, { ...lanesOpts, only }), trace: runTrace(trace), ...(verdict ? { verdict } : {}) };
  return (
    <SessionLanes sessions={asTrace(trace).sessions} options={[]} runs={{ "": run }} side={side} cells={cells} start={start} interval={interval} dense={dense} />
  );
}
