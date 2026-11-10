import { FIG_TABLE, Legend, Provenance, ring, tint } from "@/components/figures/kit";
import { asTrace, provOf, type Capture } from "./lanes";

// server side: the row lock conflict table, read off a capture. T1 holds one strength on each of
// four rows; T2 asks for every strength on every row with NOWAIT. a cell is the answer T2 got:
// granted (the row came back) or 55P03. nothing here is typed in except the strength names, which
// are parsed from the statements.
//
//   <RowLockMatrix trace={rowLockMatrix} />

const MODES = ["FOR KEY SHARE", "FOR SHARE", "FOR NO KEY UPDATE", "FOR UPDATE"];
// no strength name is a substring of another, so a plain search finds the right one
const modeOf = (sql: string) => MODES.find((m) => sql.includes(m));

export function RowLockMatrix({ trace }: { trace: Capture }) {
  const tr = asTrace(trace);
  // which strength T1 holds on which row: from T1's locking step, statement by statement
  const holdStep = tr.steps.find((s) => s.session === "T1" && /FOR (KEY SHARE|SHARE|NO KEY UPDATE|UPDATE)/.test(s.sql));
  const held: Record<string, string> = {};
  for (const stmt of (holdStep?.sql ?? "").split(";")) {
    const id = /id = (\d+)/.exec(stmt)?.[1];
    const m = modeOf(stmt);
    if (id && m) held[id] = m;
  }
  const rows = Object.keys(held).sort();
  // T2's answers: row → wanted → ok | error
  const got: Record<string, Record<string, { ok: boolean; msg?: string }>> = {};
  let message = "";
  for (const s of tr.steps) {
    if (s.session !== "T2" || !/NOWAIT/.test(s.sql)) continue;
    const id = /id = (\d+)/.exec(s.sql)?.[1];
    const m = modeOf(s.sql);
    if (!id || !m) continue;
    (got[id] ??= {})[m] = { ok: s.status === "ok", msg: s.error ? `${s.error.sqlstate} ${s.error.message}` : undefined };
    if (s.error) message = `${s.error.sqlstate}: ${s.error.message}`;
  }
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full min-w-[340px] border-collapse text-11 ${FIG_TABLE}`} aria-label="row lock conflicts, as captured">
          <thead>
            <tr>
              <th className="border-0 px-1.5 pb-1.5 text-left font-normal text-faint">T1 holds ↓ · T2 asks →</th>
              {MODES.map((m) => (
                <th key={m} className="border-0 px-1 pb-1.5 text-center leading-tight font-normal text-mute">
                  {m.replace(/^FOR /, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => (
              <tr key={id} className="border-t border-line">
                <th scope="row" className="border-0 px-1.5 py-1.5 text-left leading-tight font-normal text-hi">
                  {held[id].replace(/^FOR /, "")}
                  <span className="block text-[10px] text-faint">row {id}</span>
                </th>
                {MODES.map((m) => {
                  const c = got[id]?.[m];
                  return (
                    <td key={m} className="p-[3px] text-center">
                      <span
                        className="inline-flex h-7 w-full max-w-[7.5rem] items-center justify-center rounded-xs"
                        title={c?.msg ?? "granted"}
                        style={{ background: c && !c.ok ? tint("meta", 14) : undefined, boxShadow: c && !c.ok ? ring("meta", 50) : ring("line") }}
                      >
                        {c ? c.ok ? <span className="text-faint">ok</span> : <span className="text-meta">55P03</span> : <span className="text-faint">·</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend items={[["meta", `conflict: NOWAIT gave ${message || "an error"}`]]} />
      <Provenance trace={provOf(trace)} />
    </div>
  );
}
