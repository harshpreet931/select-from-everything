import type { PgTrace } from "@/lib/db/pgtrace";
import { traceLanes } from "@/lib/db/fromTrace";
import { SnapshotTimelineView, type SnapMoment } from "./SnapshotTimelineView";
import { engineText } from "./source";

// server side: a multi-session capture as lanes, plus every session's snapshot and xid at every
// step (what the xids probe read), and the commit status of every xid seen so far. the client
// view steps through it and draws the picked session's snapshot on the xid line.
//
//   <SnapshotTimeline trace={snapshotXip} who={["T3", "T4"]} start={3} />

export function SnapshotTimeline({ trace, who, start = 0, rel }: { trace: PgTrace; who: string[]; start?: number; rel?: string }) {
  const lanes = traceLanes(trace, rel);
  // commit status carried forward: an xid that committed stays committed in later steps even if
  // no probe mentions it again
  const seen: Record<number, "committed" | "aborted" | "in progress"> = {};
  const moments: SnapMoment[] = trace.steps.map((st) => {
    Object.assign(seen, st.xact ?? {});
    const xact = { ...seen };
    const snaps: SnapMoment["snaps"] = {};
    for (const name of who) {
      const x = st.xids?.[name];
      snaps[name] = { snap: x?.snap ?? null, xid: x?.xid ?? null, inTxn: !!x?.inTxn, iso: x?.iso ?? "read committed" };
    }
    return { xact, snaps };
  });
  return <SnapshotTimelineView sessions={trace.sessions} lanes={lanes} moments={moments} who={who} start={start} source={engineText(trace)} />;
}
