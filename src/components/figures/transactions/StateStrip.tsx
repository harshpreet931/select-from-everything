import { FIG_TABLE, Provenance, ring, tint } from "@/components/figures/kit";
import { outLine } from "@/lib/db/fromTrace";
import { asTrace, provOf, type Capture } from "./lanes";

// server side: one session's statements, each followed by what pg_stat_activity said about the
// session right after it (an observer step reading `state`). a statement with no observer step
// after it shares the next state. errors show their SQLSTATE in dead.
//
//   <StateStrip trace={sessionStates} />

// idle is faint, an open transaction is in progress (mute, dashed), an aborted one is dead
const STATE_TONE: Record<string, string> = { idle: "var(--faint)", "idle in transaction": "var(--mute)", "idle in transaction (aborted)": "var(--dead)" };

export function StateStrip({ trace }: { trace: Capture }) {
  const tr = asTrace(trace);
  type Row = { sql: string; out?: string; error?: string; state?: string };
  const rows: Row[] = [];
  for (const s of tr.steps) {
    if (s.session === "obs") {
      const state = s.result?.data?.[0]?.[0] ?? undefined;
      if (rows.length && !rows[rows.length - 1].state) rows[rows.length - 1].state = state ?? undefined;
      else rows.push({ sql: "(connected)", state: state ?? undefined });
      continue;
    }
    rows.push({
      sql: s.sql.trim().replace(/\s+/g, " "),
      out: s.error ? undefined : (outLine(s.result) ?? s.result?.command),
      error: s.error ? `${s.error.sqlstate} ${s.error.message}` : undefined,
    });
  }
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[320px] border-collapse text-11 ${FIG_TABLE}`}>
          <thead>
            <tr>
              <th className="border-0 px-1.5 pb-1.5 text-left font-normal text-faint">T1 sends</th>
              <th className="border-0 px-1.5 pb-1.5 text-left font-normal text-faint">pg_stat_activity.state after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="px-1.5 py-1.5">
                  <span className="block text-hi">{r.sql}</span>
                  {r.error ? <span className="block text-[10px] text-dead">ERROR {r.error}</span> : r.out ? <span className="block text-[10px] text-mute">→ {r.out}</span> : null}
                </td>
                <td className="px-1.5 py-1.5">
                  {r.state ? (
                    <span className="inline-block rounded-[3px] px-1.5 leading-[1.6]" style={{
                        color: STATE_TONE[r.state] ?? "var(--ink)",
                        boxShadow: r.state === "idle in transaction" ? undefined : r.state.includes("aborted") ? ring("dead", 55) : ring("line-2"),
                        outline: r.state === "idle in transaction" ? "1px dashed var(--mute)" : undefined,
                        outlineOffset: -1,
                        background: r.state.includes("aborted") ? tint("dead", 8) : undefined,
                      }}>
                      {r.state}
                    </span>
                  ) : (
                    <span className="text-faint">·</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Provenance trace={provOf(trace)} />
    </div>
  );
}
