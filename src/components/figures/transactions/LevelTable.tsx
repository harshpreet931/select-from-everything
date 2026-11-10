import { FIG_TABLE, Legend, Provenance, ring, tint } from "@/components/figures/kit";
import { ANOMALIES, LEVELS, judgeAnomaly, type AnomalyKey } from "./anomalies";
import { provOf, type Capture } from "./lanes";

// server side: the two tables side by side. the standard's, as the postgres manual's table 13.1
// describes it (three named phenomena plus "serialization anomaly"), and postgres 18.6's, where
// every cell is a captured run judged by its results (the same runs as the anomaly lab).
//
//   <LevelTable traces={{ "dirty read": dirty, … }} />

const STD_COLS = ["dirty read", "non-repeatable read", "phantom", "serialization anomaly"];
const STD: boolean[][] = [
  [true, true, true, true],
  [false, true, true, true],
  [false, false, true, true],
  [false, false, false, false],
];

function Head({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr>
        <th className="border-0 px-1.5 pb-1.5 text-left font-normal text-faint">level</th>
        {cols.map((c) => (
          <th key={c} className="border-0 px-1 pb-1.5 text-center leading-tight font-normal text-mute">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Mark({ text, tone, boxed }: { text: string; tone: "dead" | "live" | "mute" | "faint"; boxed?: boolean }) {
  return (
    <span
      className="inline-block rounded-[3px] px-1 leading-[1.5]"
      style={{ color: `var(--${tone})`, background: tone === "dead" ? tint("dead", 12) : undefined, boxShadow: boxed ? ring("live", 55) : undefined }}
    >
      {text}
    </span>
  );
}

export function LevelTable({ traces }: { traces: Record<AnomalyKey, Capture> }) {
  const judged = Object.fromEntries(ANOMALIES.map((k) => [k, judgeAnomaly(k, traces[k])])) as Record<AnomalyKey, ReturnType<typeof judgeAnomaly>>;
  return (
    <div className="@container grid min-w-0 gap-5 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="grid min-w-0 gap-1.5">
        <div className="text-11 text-faint">the standard, as the postgres manual describes it</div>
        <div className="min-w-0 overflow-x-auto">
          <table className={`w-full min-w-[420px] border-collapse text-11 ${FIG_TABLE}`}>
            <Head cols={STD_COLS} />
            <tbody>
              {LEVELS.map((l, i) => (
                <tr key={l} className="border-t border-line">
                  <th scope="row" className="border-0 px-1.5 py-1.5 text-left font-normal whitespace-nowrap text-hi">
                    {l}
                  </th>
                  {STD[i].map((p, j) => (
                    <td key={j} className="px-1 py-1.5 text-center">
                      <Mark text={p ? "possible" : "no"} tone={p ? "mute" : "faint"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="text-11 text-faint">postgres 18.6, one captured run per cell</div>
        <div className="min-w-0 overflow-x-auto">
          <table className={`w-full min-w-[520px] border-collapse text-11 ${FIG_TABLE}`}>
            <Head cols={ANOMALIES} />
            <tbody>
              {LEVELS.map((l, i) => (
                <tr key={l} className="border-t border-line">
                  <th scope="row" className="border-0 px-1.5 py-1.5 text-left font-normal whitespace-nowrap text-hi">
                    {l}
                  </th>
                  {ANOMALIES.map((k) => {
                    const c = judged[k][i];
                    return (
                      <td key={k} className="px-1 py-1.5 text-center" title={c.text}>
                        {c.outcome === "happens" ? <Mark text="happens" tone="dead" /> : c.outcome === "40001" ? <Mark text="40001" tone="live" boxed /> : <Mark text="no" tone="live" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend items={[["dead", "it happened"], ["live", "prevented (40001: by aborting a transaction)"]]} />
        <Provenance trace={{ ...provOf(traces["dirty read"]), scenario: "content/transactions/traces/anomaly-*.scenario.sql" }} />
      </div>
    </div>
  );
}
