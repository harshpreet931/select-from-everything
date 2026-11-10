import { Legend, Provenance } from "@/components/figures/kit";
import { asTrace, errorsIn, provOf, valueAt, type Capture } from "./lanes";

// server side: the balance each captured run ended with (the value its last step read), as bars.
// a run that ended short of the expected total with no error and no UPDATE 0 anywhere lost an
// update (dead); one that reached it is live; one that ended short because a transaction was told
// to try again (40001, or an UPDATE 0) is left neutral, with its note.
//
//   <FinalBalances expect="130.00" runs={[{ label: "read committed", trace: lost, note: "…" }, …]} />

export function FinalBalances({ runs, expect }: { runs: { label: string; trace: Capture; note?: string }[]; expect: string }) {
  const data = runs.map((r) => {
    const tr = asTrace(r.trace);
    const last = tr.steps.length - 1;
    const v = valueAt(r.trace, last) ?? tr.steps[last].result?.data?.[0]?.[0] ?? "0";
    const errored = errorsIn(r.trace, tr.steps.map((_, i) => i)).length > 0;
    const zero = tr.steps.some((s) => s.result?.command === "UPDATE" && s.result.rows === 0);
    const tone = v === expect ? "live" : errored || zero ? null : "dead";
    return { label: r.label, v, tone, note: r.note };
  });
  const top = Math.max(Number(expect), ...data.map((d) => Number(d.v)));
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="grid gap-y-3">
        {data.map((d) => (
          <div key={d.label} className="grid grid-cols-[minmax(0,1fr)_7ch] items-center gap-x-3 gap-y-1 @min-[520px]:grid-cols-[17ch_minmax(0,1fr)_7ch]">
            <span className="col-span-2 text-hi @min-[520px]:col-span-1">{d.label}</span>
            <span className="relative h-[14px] rounded-[2px] bg-well-2">
              <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${(Number(d.v) / top) * 100}%`, background: d.tone ? `var(--${d.tone})` : "var(--mute)" }} />
            </span>
            <span className="text-right tabular" style={{ color: d.tone ? `var(--${d.tone})` : "var(--ink)" }}>
              {d.v}
            </span>
            {d.note && <span className="col-span-2 text-11 text-mute @min-[520px]:col-start-2 @min-[520px]:col-end-4">{d.note}</span>}
          </div>
        ))}
      </div>
      <Legend
        items={[
          ["live", `${expect}: both deposits`],
          ["dead", "short, and nobody was told: lost"],
          ["mute", "short, but one side was told to retry"],
        ]}
      />
      <Provenance trace={{ ...provOf(runs[0].trace), scenario: "content/transactions/traces/lost-update*.scenario.sql" }} />
    </div>
  );
}
