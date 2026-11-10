import type { ReactNode } from "react";
import { SessionLanes, type Run } from "@/components/db/SessionLanes";
import { asTrace, lanesOf, rounds, runTrace, type Capture, type LanesOpts, type LockFilter } from "./lanes";

// server side: one capture (or a few, or a few rounds of one) as SessionLanes with the lock
// manager on the side. the capture is read here and only the trimmed steps reach the browser.
//
//   <LockLanes trace={t} locks={{ types: ["relation"], objs: ["accounts"] }} />
//   <LockLanes trace={t} option="round" byRound={["no index", "an index"]} locks={{ modes: ["SIReadLock"] }} />
//   <LockLanes option="..." runs={[{ label, trace, verdict }]} />

type Verdict = NonNullable<Run["verdict"]>;
type RunIn = { label: string; trace: Capture; verdict?: Verdict; only?: number[] };

export function LockLanes({
  trace,
  runs,
  byRound,
  verdicts,
  option = "run",
  locks,
  only,
  obs,
  noObs,
  tones,
  noSnaps = true,
  side,
  sideTitle,
  start = 0,
  interval,
  dense = true,
  verdict,
}: {
  trace?: Capture;
  runs?: RunIn[];
  /** labels for the rounds of one capture (rounds are split at an obs step whose note says "round") */
  byRound?: string[];
  verdicts?: (Verdict | undefined)[];
  option?: string;
  locks?: LockFilter;
  only?: number[];
  obs?: LanesOpts["obs"];
  noObs?: boolean;
  tones?: LanesOpts["tones"];
  noSnaps?: boolean;
  side?: "locks" | "none";
  sideTitle?: ReactNode;
  start?: number;
  interval?: number;
  dense?: boolean;
  verdict?: Verdict;
}) {
  const opts: LanesOpts = { locks, obs, noObs, tones, noSnaps };
  const s = side ?? (locks ? "locks" : "none");
  let list: RunIn[] | undefined = runs;
  if (!list && trace && byRound) {
    const rs = rounds(trace);
    list = byRound.map((label, k) => ({ label, trace, only: rs[k], verdict: verdicts?.[k] }));
  }
  if (list?.length) {
    const built: Record<string, Run> = Object.fromEntries(
      list.map((r) => [r.label, { steps: lanesOf(r.trace, { ...opts, only: r.only }), trace: runTrace(r.trace), ...(r.verdict ? { verdict: r.verdict } : {}) }]),
    );
    return (
      <SessionLanes
        sessions={asTrace(list[0].trace).sessions}
        options={[{ key: "run", label: option, values: list.map((r) => r.label) }]}
        runs={built}
        side={s}
        sideTitle={sideTitle}
        start={start}
        interval={interval}
        dense={dense}
      />
    );
  }
  if (!trace) return null;
  const run: Run = { steps: lanesOf(trace, { ...opts, only }), trace: runTrace(trace), ...(verdict ? { verdict } : {}) };
  return <SessionLanes sessions={asTrace(trace).sessions} options={[]} runs={{ "": run }} side={s} sideTitle={sideTitle} start={start} interval={interval} dense={dense} />;
}
