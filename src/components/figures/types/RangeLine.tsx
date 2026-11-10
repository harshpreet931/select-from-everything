import type { ReactNode } from "react";
import { Legend, Provenance, tint, tv, type Ink, type LegendItem } from "@/components/figures/kit";

// ranges drawn on a number line, one row each: a bar from lower to upper, a solid end for an
// inclusive bound and a hollow one for an exclusive bound, and (for discrete ranges) a dot on every
// integer the range contains, filled when it's a member. end ticks longer than two characters align inward, `minor` ticks hide and notes wrap
// under 520 px, so nothing overflows a phone. all bounds and members come from a
// capture; this only lays them out. no state, so it renders on the server.

export type RangeRow = {
  label: ReactNode;
  /** text on the right: the stored form, a guest's name */
  note?: ReactNode;
  lo: number | null;
  hi: number | null;
  loInc?: boolean;
  hiInc?: boolean;
  /** members to dot (discrete ranges); omit for no dots */
  members?: number[];
  tone?: Ink;
  dashed?: boolean;
};

export function RangeLine({
  min,
  max,
  ticks,
  rows,
  dots = false,
  legend,
  trace,
}: {
  min: number;
  max: number;
  /** axis labels: position → text. `minor` ticks are hidden under 520 px, so a phone keeps fewer, wider-spaced labels */
  ticks: { at: number; label: string; minor?: boolean }[];
  rows: RangeRow[];
  /** draw a dot on every integer from min to max in each row */
  dots?: boolean;
  legend?: LegendItem[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const ints = dots ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" role="img" aria-label="ranges on a number line">
      <div className="grid min-w-0 grid-cols-[6ch_minmax(0,1fr)_fit-content(45%)] gap-x-1 gap-y-0.5 @min-[520px]:grid-cols-[9ch_minmax(0,1fr)_auto] @min-[520px]:gap-x-3">
        {rows.map((r, i) => {
          const k = r.tone ?? "ink";
          const c = tv(k);
          const has = r.lo !== null && r.hi !== null;
          return (
            <div key={i} className="contents">
              <div className="self-center text-11 text-hi tabular @min-[520px]:text-12">{r.label}</div>
              <div className="relative mx-2 h-8">
                <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {ints.map((n) => {
                  const on = r.members?.includes(n);
                  return (
                    <span
                      key={n}
                      className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: `${x(n)}%`, background: on ? tv("live") : "var(--bg)", boxShadow: `0 0 0 1px ${on ? tv("live") : "var(--line-2)"}`, zIndex: 2 }}
                    />
                  );
                })}
                {has && (
                  <>
                    <div
                      className="absolute top-1/2 h-[10px] -translate-y-1/2 rounded-[2px]"
                      style={{
                        left: `${x(r.lo!)}%`,
                        width: `${x(r.hi!) - x(r.lo!)}%`,
                        background: k === "ink" ? "var(--well-2)" : tint(k as "ref", 14),
                        outline: r.dashed ? `1px dashed ${c}` : undefined,
                        boxShadow: r.dashed ? undefined : `inset 0 0 0 1px ${k === "ink" ? "var(--line-2)" : c}`,
                      }}
                    />
                    {[
                      [r.lo!, r.loInc],
                      [r.hi!, r.hiInc],
                    ].map(([v, inc], j) => (
                      <span
                        key={j}
                        className="absolute top-1/2 h-[16px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
                        style={{ left: `${x(v as number)}%`, background: inc ? c : "var(--bg)", boxShadow: `0 0 0 1px ${c}`, zIndex: 3 }}
                        title={inc ? "inclusive bound" : "exclusive bound"}
                      />
                    ))}
                  </>
                )}
              </div>
              <div className="self-center text-11 text-mute tabular [overflow-wrap:anywhere] @min-[520px]:text-12 @min-[520px]:whitespace-nowrap">{r.note}</div>
            </div>
          );
        })}
        <div />
        <div className="relative mx-2 h-5 text-[10px] text-faint tabular">
          {ticks.map((t) => (
            <span key={t.at} className={`absolute top-0 whitespace-nowrap ${t.minor ? "hidden @min-[520px]:block" : ""} ${t.label.length <= 2 ? "-translate-x-1/2" : t.at >= max ? "-translate-x-full" : t.at <= min ? "" : "-translate-x-1/2"}`} style={{ left: `${x(t.at)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <div />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        {legend ? <Legend items={legend} /> : <span />}
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
