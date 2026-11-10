import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { prov, records } from "./source";

// an inverted index drawn from a real query: one line per lexeme, and the ids of the rows that
// contain it (a step returning lexeme, ids as an int array). server only: nothing moves.
//
//   <Postings trace={trace} step={1} hot="steel" />

const ids = (v: string | null) => (v ?? "").replace(/[{}]/g, "").split(",").filter(Boolean);

export function Postings({ trace, step, hot }: { trace: Capture; step: number; hot?: string }) {
  const rows = records(trace, step);
  return (
    <div className="grid min-w-0 gap-3 text-12" role="img" aria-label={`an inverted index: ${rows.map((r) => `${r.lexeme} in ${ids(r.ids).length} rows`).join(", ")}`}>
      <div className="grid gap-1.5">
        {rows.map((r) => {
          const on = r.lexeme === hot;
          return (
            <div key={r.lexeme} className="grid grid-cols-[8ch_minmax(0,1fr)] items-start gap-3">
              <span className="pt-0.5 text-right" style={{ color: on ? "var(--hot)" : "var(--hi)" }}>
                {r.lexeme}
              </span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {ids(r.ids).map((id) => (
                  <span
                    key={id}
                    className="rounded-xs px-1.5 text-11 leading-[20px] tabular"
                    style={{
                      color: "var(--ref)",
                      background: "color-mix(in srgb, var(--ref) 9%, transparent)",
                      boxShadow: on ? "inset 0 0 0 1px var(--hot)" : "inset 0 0 0 1px color-mix(in srgb, var(--ref) 45%, transparent)",
                    }}
                  >
                    {id}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
