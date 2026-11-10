"use client";

import { useState } from "react";
import { Chip, FIG_TABLE, Legend, NARR, Provenance, Row, Slider, Words, ring, tint } from "@/components/figures/kit";

// a model of read routing, not a capture: one user saves a profile and reloads, over and over.
// every write goes to the primary; the standby replays it `lag` ms later. each policy decides
// where each read goes. a read on the standby before its write has replayed is stale.

type Policy = "every read to the standby" | "primary for 2 s after a write" | "wait for the LSN";
const POLICIES: Policy[] = ["every read to the standby", "primary for 2 s after a write", "wait for the LSN"];

// time in ms: a write, then reads at these offsets after it
const EVENTS: { t: number; kind: "write" | "read"; v: number }[] = [
  { t: 0, kind: "write", v: 1 },
  { t: 40, kind: "read", v: 1 },
  { t: 400, kind: "read", v: 1 },
  { t: 1500, kind: "read", v: 1 },
  { t: 2600, kind: "read", v: 1 },
  { t: 3000, kind: "write", v: 2 },
  { t: 3020, kind: "read", v: 2 },
  { t: 3900, kind: "read", v: 2 },
  { t: 6500, kind: "read", v: 2 },
];

export function ReplicaRouting() {
  const [policy, setPolicy] = useState<Policy>("every read to the standby");
  const [lag, setLag] = useState(100);
  const writes = EVENTS.filter((e) => e.kind === "write");
  const rows = EVENTS.map((e) => {
    if (e.kind === "write") return { ...e, on: "primary", sees: e.v, wait: 0, stale: false };
    const last = writes.filter((w) => w.t <= e.t).pop()!;
    const since = e.t - last.t;
    let on = "standby";
    let wait = 0;
    if (policy === "primary for 2 s after a write" && since < 2000) on = "primary";
    if (policy === "wait for the LSN" && since < lag) wait = lag - since;
    // what the standby has replayed at the moment the read runs
    const at = e.t + wait;
    const replayed = writes.filter((w) => w.t + lag <= at).pop();
    const sees = on === "primary" ? last.v : (replayed?.v ?? 0);
    return { ...e, on, sees, wait, stale: sees < last.v };
  });
  const reads = rows.filter((r) => r.kind === "read");
  const stale = reads.filter((r) => r.stale).length;
  const onPrimary = reads.filter((r) => r.on === "primary").length;
  const waited = reads.reduce((n, r) => n + r.wait, 0);
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="reads =" w="8ch">
          <Words label="routing policy" options={POLICIES} value={policy} onChange={setPolicy} />
        </Row>
        <Row k="lag =" w="8ch" last>
          <Slider k="replication lag" min={0} max={3000} step={50} value={lag} onChange={setLag} format={(v) => `${v.toLocaleString("en-US")} ms`} />
        </Row>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[300px] border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`}>
          <thead>
            <tr className="text-faint">
              <th className="py-1 text-left">t</th>
              <th className="px-1 py-1 text-left">the user</th>
              <th className="px-1 py-1 text-left">goes to</th>
              <th className="px-1 py-1 text-right">sees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 tabular text-faint">{(r.t / 1000).toFixed(2)} s</td>
                <td className="px-1 py-1">{r.kind === "write" ? <span className="text-hi">saves version {r.v}</span> : "reloads"}</td>
                <td className="px-1 py-1">
                  <span className="text-mute">{r.on}</span>
                  {r.wait > 0 && <span className="ml-1 text-11 text-faint">(waits {r.wait} ms)</span>}
                </td>
                <td className="px-1 py-1 text-right">
                  {r.kind === "write" ? (
                    <span className="text-faint">·</span>
                  ) : (
                    <span className="inline-block rounded-xs px-1.5 tabular" style={{ boxShadow: ring(r.stale ? "dead" : "live", 60), background: tint(r.stale ? "dead" : "live", 9), color: r.stale ? "var(--dead)" : "var(--live)" }}>
                      {r.sees === 0 ? "nothing yet" : `version ${r.sees}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip tone={stale ? "dead" : "live"}>stale reads: {stale}/{reads.length}</Chip>
        <Chip>reads on the primary: {onPrimary}</Chip>
        <Chip>time spent waiting: {waited} ms</Chip>
      </div>
      <p className={NARR} aria-live="polite">
        {policy === "every read to the standby"
          ? stale
            ? `the reload right after a save lands on a standby that hasn't replayed it yet. the user saves, reloads, and their change is gone.`
            : `at this lag every reload happens after replay, so nobody notices. raise the lag and watch.`
          : policy === "primary for 2 s after a write"
            ? stale
              ? `reads right after a write are safe, but once the lag is longer than the window, the first standby read after it is stale again.`
              : `the primary takes the reads right after a write; by the time reads go back to the standby, it has caught up. a guess about lag that holds as long as lag stays under 2 s.`
            : `each read carries the LSN of the user's last write and waits until the standby has replayed that far. never stale; the price is the wait, about the lag, right after a write.`}
      </p>
      <Legend items={[["live", "sees their own write"], ["dead", "stale: doesn't"]]} />
      <Provenance sim="model: one user, writes to the primary, a standby that replays each write after the lag you pick" />
    </div>
  );
}
