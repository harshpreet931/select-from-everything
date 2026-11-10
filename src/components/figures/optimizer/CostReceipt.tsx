import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";

// a plan node's cost as a sum you can check, term by term: a count (pages, rows, comparisons)
// times a cost setting. the first `startup` terms are paid before the first row and add up to
// the startup cost. the counts and the settings come from the capture the page passes in; the
// plan line under the sum is what EXPLAIN printed. server component. (a copy of execution's
// CostSum with fractional counts and a startup subtotal.)
//
//   <CostReceipt terms={[{ what: "heap page, fetched out of order", n: 1, setting: "random_page_cost", per: 4 }]} line="..." source={prov(trace)} />

export type Term = { what: string; n: number; digits?: number; setting: string; per: number };

export function CostReceipt({
  terms,
  startup = 0,
  line,
  want,
  source,
}: {
  terms: Term[];
  /** how many leading terms are startup cost */
  startup?: number;
  /** the plan line whose cost this adds up to */
  line: string;
  /** the plan's own numbers. the sum must land on them (to the cent), and they're what's printed,
   *  since float rounding of 0.285 can go either way */
  want: { startup?: number; total: number };
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const sum = (ts: Term[]) => ts.reduce((s, t) => s + t.n * t.per, 0);
  const total = sum(terms);
  const start = sum(terms.slice(0, startup));
  if (Math.abs(total - want.total) > 0.006) throw new Error(`CostReceipt: terms add up to ${total}, the plan says ${want.total}`);
  if (want.startup !== undefined && Math.abs(start - want.startup) > 0.006) throw new Error(`CostReceipt: startup terms add up to ${start}, the plan says ${want.startup}`);
  const label = (t: Term) => `× ${t.setting} ${t.per}`;
  return (
    <div
      className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12"
      role="img"
      aria-label={`${terms.map((t) => `${t.n} ${t.what} times ${t.setting} ${t.per}`).join(" plus ")} equals ${total.toFixed(2)}`}
    >
      <div className="grid grid-cols-[2ch_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 @min-[600px]:grid-cols-[2ch_minmax(0,1fr)_auto_auto]">
        {terms.map((t, i) => (
          <div key={i} className="contents">
            <span className="text-faint">{i ? "+" : ""}</span>
            <span className="min-w-0 text-ink">
              <span className="text-hi tabular">{fmt(t.n, t.digits ?? 0)}</span> {t.what}
              {i < startup && <span className="ml-1.5 text-[10px] text-faint">startup</span>}
              <span className="block text-11 text-mute @min-[600px]:hidden">{label(t)}</span>
            </span>
            <span className="hidden text-mute @min-[600px]:block">
              × {t.setting} <span className="text-hi tabular">{t.per}</span>
            </span>
            <span className="text-right text-hi tabular">{t.n * t.per < 0.1 ? String(Number((t.n * t.per).toFixed(4))) : (t.n * t.per).toFixed(2)}</span>
          </div>
        ))}
        <span className="col-span-full h-px bg-line-2" />
        {startup > 0 && (
          <>
            <span className="text-faint" />
            <span className="text-mute">startup cost (the first {startup} lines)</span>
            <span className="hidden @min-[600px]:block" />
            <span className="text-right text-hi tabular">{(want.startup ?? start).toFixed(2)}</span>
          </>
        )}
        <span className="text-faint">=</span>
        <span className="text-mute">total cost</span>
        <span className="hidden @min-[600px]:block" />
        <span className="text-right text-hot tabular">{want.total.toFixed(2)}</span>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-md bg-well px-3 py-2 text-12 whitespace-pre text-ink shadow-[inset_0_0_0_1px_var(--line)]">{line.trim().replace(/^->\s+/, "")}</div>
      <Provenance trace={source} />
    </div>
  );
}
