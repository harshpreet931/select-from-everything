import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";
import { prov } from "./source";

// a plan node's total cost as a sum you can check: each term is a count from the catalog
// times a cost setting. the counts and the settings come from a captured query; the plan
// line under the sum is what EXPLAIN printed for the same scan.
//
//   <CostSum trace={trace} terms={[{ what: "pages read in order", n: 24, setting: "seq_page_cost", per: 1 }]} line="..." />

export function CostSum({
  trace,
  terms,
  line,
}: {
  trace: Capture;
  terms: { what: string; n: number; setting: string; per: number }[];
  /** the plan line whose total cost this adds up to */
  line: string;
}) {
  const total = terms.reduce((s, t) => s + t.n * t.per, 0);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12" role="img" aria-label={`${terms.map((t) => `${t.n} ${t.what} times ${t.setting} ${t.per}`).join(" plus ")} equals ${total.toFixed(2)}`}>
      <div className="grid grid-cols-[2ch_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 @min-[560px]:grid-cols-[2ch_minmax(0,1fr)_auto_auto]">
        {terms.map((t, i) => (
          <div key={t.setting} className="contents">
            <span className="text-faint">{i ? "+" : ""}</span>
            <span className="min-w-0 text-ink">
              <span className="text-hi tabular">{fmt(t.n)}</span> {t.what}
              <span className="block text-11 text-mute @min-[560px]:hidden">
                × {t.setting} {t.per}
              </span>
            </span>
            <span className="hidden text-mute @min-[560px]:block">
              × {t.setting} <span className="text-hi tabular">{t.per}</span>
            </span>
            <span className="text-right text-hi tabular">{(t.n * t.per).toFixed(2)}</span>
          </div>
        ))}
        <span className="col-span-full h-px bg-line-2" />
        <span className="text-faint">=</span>
        <span className="text-mute">total cost</span>
        <span className="hidden @min-[560px]:block" />
        <span className="text-right text-hot tabular">{total.toFixed(2)}</span>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-md bg-well px-3 py-2 text-12 whitespace-pre text-ink shadow-[inset_0_0_0_1px_var(--line)]">{line.trim().replace(/^->\s+/, "")}</div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
