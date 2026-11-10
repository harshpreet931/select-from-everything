import { tint } from "@/components/figures/kit/tone";

// a BRIN index as what it is: one [min, max] per block range, here drawn on a time axis, one
// row per range. the ranges a query's interval overlaps are the ones the bitmap has to read
// (hot); the rest are skipped. rows come from brin_page_items in the chapter's golden.
// server only.
//
//   <BrinRanges rows={[{ blk: 0, lo: "2026-01-01 00:01:00+00", hi: "…" }]} query={["2026-03-01", "2026-03-02"]} />

export type BrinRow = { blk: number; lo: string; hi: string };

const t = (s: string) => Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
const day = (ms: number) => new Date(ms).toISOString().slice(5, 10);

export function BrinRanges({ rows, query, label, ppr }: { rows: BrinRow[]; query: [string, string]; label: string; ppr: number }) {
  const lo = Math.min(...rows.map((r) => t(r.lo)));
  const hi = Math.max(...rows.map((r) => t(r.hi)));
  const q0 = t(query[0] + "T00:00:00Z");
  const q1 = t(query[1] + "T00:00:00Z");
  const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const hits = rows.filter((r) => t(r.hi) >= q0 && t(r.lo) < q1).length;
  return (
    <div className="mb-6 grid min-w-0 gap-1.5 text-11 last:mb-0" role="img" aria-label={`${label}: ${rows.length} block ranges of ${ppr} pages; a query for ${query[0]} overlaps ${hits} of them`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-hi">{label}</span>
        <span className="text-faint tabular">
          ranges to read: <span className={hits === rows.length ? "text-dead" : "text-hot"}>{hits}</span> of {rows.length}
        </span>
      </div>
      <div className="relative grid gap-[3px] py-1">
        <span className="pointer-events-none absolute inset-y-0 right-0" style={{ left: "calc(6.5ch + 0.5rem)", zIndex: 1 }}>
          <span className="absolute inset-y-0" style={{ left: pct(q0), width: `max(2px, ${((q1 - q0) / (hi - lo)) * 100}%)`, background: tint("hot", 30) }} />
        </span>
        {rows.map((r) => {
          const on = t(r.hi) >= q0 && t(r.lo) < q1;
          return (
            <div key={r.blk} className="grid grid-cols-[6.5ch_minmax(0,1fr)] items-center gap-2">
              <span className="text-right text-[10px] text-faint tabular">{r.blk}</span>
              <span className="relative h-3">
                <span
                  className="absolute inset-y-0 rounded-[2px]"
                  title={`blocks ${r.blk} to ${r.blk + ppr - 1}: ${r.lo} .. ${r.hi}`}
                  style={{ left: pct(t(r.lo)), width: `max(2px, ${((t(r.hi) - t(r.lo)) / (hi - lo)) * 100}%)`, background: on ? "var(--hot)" : "color-mix(in srgb, var(--mute) 45%, transparent)" }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[6.5ch_minmax(0,1fr)] gap-2 text-[10px] text-faint tabular">
        <span className="text-right">block</span>
        <span className="relative flex h-4 justify-between">
          <span>{day(lo)}</span>
          <span className="absolute -translate-x-1/2 text-hot" style={{ left: pct(q0) }}>
            {query[0].slice(5)}
          </span>
          <span>{day(hi)}</span>
        </span>
      </div>
    </div>
  );
}
