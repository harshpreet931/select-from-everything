// the anomaly catalogue, judged from the captures: each anomaly capture runs the same two-session
// schedule once per isolation level (rounds split by observer steps). what postgres did at each
// level is read off the results (two reads that differ, a total that's off, a 40001), never typed
// in. what the standard allows is the postgres manual's table 13.1: the standard names dirty,
// non-repeatable and phantom reads, and calls everything else a serialization anomaly, ruled out
// only at SERIALIZABLE. pure, so server figures and mdx can both use it.

import type { SessionStep } from "@/lib/db/views";
import { asTrace, errorsIn, lanesOf, levelOf, provOf, rounds, valueAt, type Capture } from "./lanes";

export const LEVELS = ["read uncommitted", "read committed", "repeatable read", "serializable"] as const;
export type Level = (typeof LEVELS)[number];

export type AnomalyKey = "dirty read" | "non-repeatable read" | "phantom" | "lost update" | "read skew" | "write skew";
export const ANOMALIES: AnomalyKey[] = ["dirty read", "non-repeatable read", "phantom", "lost update", "read skew", "write skew"];

/** the standard, as the postgres manual's table 13.1 describes it: may this happen at this level? */
export const STANDARD: Record<AnomalyKey, boolean[]> = {
  "dirty read": [true, false, false, false],
  "non-repeatable read": [true, true, false, false],
  phantom: [true, true, true, false],
  // not named by the standard: serialization anomalies, possible below SERIALIZABLE
  "lost update": [true, true, true, false],
  "read skew": [true, true, true, false],
  "write skew": [true, true, true, false],
};

export type Outcome = "happens" | "prevented" | "40001";
export type Cell = { level: Level; outcome: Outcome; text: string; steps: SessionStep[]; scenario: ReturnType<typeof provOf> };

/** the values one session read in a round, in order */
function readsBy(t: Capture, idx: number[], session: string): string[] {
  const tr = asTrace(t);
  return idx.filter((i) => tr.steps[i].session === session && /^\s*SELECT/i.test(tr.steps[i].sql)).map((i) => valueAt(t, i) ?? "");
}

function judge(key: AnomalyKey, t: Capture, idx: number[]): { outcome: Outcome; text: string } {
  const errs = errorsIn(t, idx).filter((e) => e.sqlstate === "40001");
  const t2 = readsBy(t, idx, "T2");
  const t1 = readsBy(t, idx, "T1");
  switch (key) {
    case "dirty read": {
      const v = t2[t2.length - 1];
      return v === "100.00"
        ? { outcome: "prevented", text: `T2 read ${v}, the committed balance. T1's uncommitted 0.00 never reached it.` }
        : { outcome: "happens", text: `T2 read ${v}, a balance that was never committed.` };
    }
    case "non-repeatable read": {
      const [a, b] = t2;
      return a !== b ? { outcome: "happens", text: `the same read gave ${a}, then ${b}.` } : { outcome: "prevented", text: `both reads gave ${a}.` };
    }
    case "phantom": {
      const [a, b] = t2;
      return a !== b ? { outcome: "happens", text: `the same count gave ${a}, then ${b}: carol's new row showed up.` } : { outcome: "prevented", text: `both counts gave ${a}. carol's new row stayed out of T2's snapshot.` };
    }
    case "read skew": {
      const [a, b] = t2;
      const sum = (Number(a) + Number(b)).toFixed(2);
      return sum !== "200.00"
        ? { outcome: "happens", text: `T2 saw alice ${a} and bob ${b}: ${sum} in total, a state the bank was never in.` }
        : { outcome: "prevented", text: `T2 saw alice ${a} and bob ${b}: ${sum}, a state that really existed.` };
    }
    case "lost update": {
      const end = t1[t1.length - 1];
      if (errs.length) return { outcome: "40001", text: `T2 got 40001 (${errs[0].message}) and rolled back. alice has ${end}, and a retry would make it 130.00.` };
      return end === "130.00" ? { outcome: "prevented", text: `alice has ${end}.` } : { outcome: "happens", text: `alice has ${end}, not 130.00. T1's deposit is gone, and nobody got an error.` };
    }
    case "write skew": {
      const end = t1[t1.length - 1];
      if (errs.length) return { outcome: "40001", text: `T2's COMMIT failed with 40001 (${errs[0].message}). ${end} doctor still on call.` };
      return end === "0" ? { outcome: "happens", text: `${end} doctors on call. both checks passed, and together they broke the rule.` } : { outcome: "prevented", text: `${end} on call.` };
    }
  }
}

/** every level of one anomaly capture: what postgres did, why, and the lanes to show it */
export function judgeAnomaly(key: AnomalyKey, t: Capture): Cell[] {
  return rounds(t).map((idx) => {
    const { outcome, text } = judge(key, t, idx);
    return { level: levelOf(t, idx) as Level, outcome, text, steps: lanesOf(t, { only: idx }), scenario: provOf(t) };
  });
}
