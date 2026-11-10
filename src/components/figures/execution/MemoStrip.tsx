import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";
import { planText, prov } from "./source";

// what Memoize did, one square per outer row: the cache key each row brought (a captured list,
// in the order the plan's outer side produced them), coloured miss (first time this key: the
// inner index scan runs) or hit (seen before: answered from the cache). with no evictions,
// misses are just the distinct keys, and the figure checks its counts against the Hits and
// Misses EXPLAIN printed for the same plan before it draws anything. server component.
//
//   <MemoStrip trace={trace} keys={7} plan={6} />

export function MemoStrip({ trace, keys, plan }: { trace: Capture; keys: number; plan: number }) {
  const ks = (trace.steps[keys]?.result?.data ?? []).map((r) => r[0]);
  const m = /Hits: (\d+)\s+Misses: (\d+)\s+Evictions: (\d+)/.exec(planText(trace, plan));
  if (!m) throw new Error(`MemoStrip: no Memoize line in step ${plan} of ${trace.scenario}`);
  const [hits, misses, evictions] = m.slice(1).map(Number);
  if (evictions) throw new Error("MemoStrip: the plan evicted entries, so misses aren't just the distinct keys");
  const seen = new Set<string | null>();
  const cells = ks.map((k) => {
    const hit = seen.has(k);
    seen.add(k);
    return hit;
  });
  const mHits = cells.filter(Boolean).length;
  if (mHits !== hits || cells.length - mHits !== misses) throw new Error(`MemoStrip: model ${mHits}/${cells.length - mHits} vs EXPLAIN ${hits}/${misses}`);
  // hits per hundred rows, to show the cache warming up
  const per = Array.from({ length: Math.ceil(cells.length / 100) }, (_, i) => cells.slice(i * 100, i * 100 + 100).filter(Boolean).length);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-11 text-faint">outer rows</div>
          <div className="text-14 text-hi tabular">{fmt(cells.length)}</div>
        </div>
        <div>
          <div className="text-11 text-faint">misses (lookups)</div>
          <div className="text-14 text-hot tabular">{fmt(misses)}</div>
        </div>
        <div>
          <div className="text-11 text-faint">hits (from cache)</div>
          <div className="text-14 text-live tabular">{fmt(hits)}</div>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[2px] @min-[560px]:grid-cols-[repeat(50,minmax(0,1fr))]" role="img" aria-label={`${cells.length} outer rows in order: ${misses} misses, ${hits} hits. hits per hundred rows: ${per.join(", ")}`}>
        {cells.map((hit, i) => (
          <span key={i} title={`row ${i + 1}: customer ${ks[i]}, ${hit ? "hit" : "miss"}`} className="aspect-square rounded-[1px]" style={{ background: hit ? "var(--live)" : "var(--hot)", opacity: hit ? 0.85 : 0.55 }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-11 text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-[9px] rounded-[2px]" style={{ background: "var(--hot)", opacity: 0.55 }} /> miss: the index scan runs
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-[9px] rounded-[2px]" style={{ background: "var(--live)", opacity: 0.85 }} /> hit: the cache answers
        </span>
        <span>hits per 100 rows: {per.join(" · ")}</span>
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
