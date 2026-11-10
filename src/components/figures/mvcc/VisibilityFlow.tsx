import type { PgTrace } from "@/lib/db/pgtrace";
import type { Tuple } from "@/lib/db/views";
import { VisibilityFlowView, type FlowReader } from "./VisibilityFlowView";
import { engineText } from "./source";

// server side: one step of a capture, the heap page's tuples, and two readers whose real
// answers the capture recorded: a session's own SELECT ctid ... (its snapshot and xid from the
// xids probe) and a brand-new transaction (the rows probe, with a snapshot freshReader builds
// from the commit statuses). the client view runs visibility.ts on every tuple and puts the
// prediction next to what postgres returned.
//
//   <VisibilityFlow trace={cases} step={8} rel="cases" session="R" label="what" />

export function VisibilityFlow({ trace, step, rel, session, label }: { trace: PgTrace; step: number; rel: string; session: string; label?: string }) {
  const st = trace.steps[step];
  const tuples: (Tuple & { block: number })[] = (st.heap?.[rel] ?? []).flatMap((p) => p.tuples.map((t) => ({ ...t, block: p.block }))).filter((t) => t.lpFlags === "normal");
  const ctidsOf = (data: (string | null)[][] | undefined, cols: { name: string }[] | undefined) => {
    const i = (cols ?? []).findIndex((c) => c.name === "ctid");
    return i < 0 ? [] : (data ?? []).map((r) => r[i] ?? "");
  };
  const x = st.xids?.[session];
  const rows = (st as { rows?: Record<string, { columns: { name: string }[]; data: (string | null)[][] }> }).rows?.[rel];
  const readers: FlowReader[] = [];
  if (x?.snap) readers.push({ name: session, snap: x.snap, me: x.xid, real: ctidsOf(st.result?.data, st.result?.columns) });
  if (rows) readers.push({ name: "a new transaction", snap: null, me: null, real: ctidsOf(rows.data, rows.columns) });
  return <VisibilityFlowView tuples={tuples} xact={st.xact ?? {}} readers={readers} label={label} source={engineText(trace)} />;
}
