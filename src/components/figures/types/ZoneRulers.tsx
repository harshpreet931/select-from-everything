"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, SqlPanel, Words, ring, tint, useWidth } from "@/components/figures/kit";

// one instant, four wall clocks. each ruler is a time zone; its ticks sit at the same UTC hours
// on every ruler and are labelled with the wall-clock time that zone shows then (captured with
// AT TIME ZONE). the instant is one vertical line through all of them. a ruler whose clock jumps
// (a daylight saving change) gets a dashed cut at the instant it jumps: the skipped wall-clock
// hour has no width on a line of real time.

export type Zone = { zone: string; printed: string; note: string };

const ms = (s: string) => Date.parse(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));

export function ZoneRulers({
  zones,
  ticks,
  instant,
  trace,
}: {
  zones: Zone[];
  /** captured: zone, utc (printed in UTC), wall (HH24:MI) */
  ticks: (string | null)[][];
  /** the instant, printed in UTC */
  instant: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [pick, setPick] = useState(zones[2]?.zone ?? zones[0].zone);
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const z = zones.find((x) => x.zone === pick)!;
  const all = ticks.map((t) => ms(t[1]!));
  const t0 = Math.min(...all);
  const t1 = Math.max(...all);
  const pad = 4;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (100 - 2 * pad);
  const xi = x(ms(instant));
  const sparse = w < 460;
  const sql = `SET TimeZone = '${pick}';\nSELECT created_at FROM customers WHERE id = 12;`;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="one instant on four time zones' clocks">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[11ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">TimeZone =</span>
        <Words options={zones.map((q) => q.zone)} value={pick} onChange={setPick} label="session time zone" />
      </div>
      <SqlPanel code={sql} file="signup.sql" right={<span className="text-hot">{z.printed}</span>} wrap />
      <div ref={ref} className="relative grid gap-1 rounded-md bg-well px-1 pt-3 pb-2 shadow-[inset_0_0_0_1px_var(--line)]" role="img" aria-label={zones.map((q) => `${q.zone}: ${q.printed}`).join("; ")}>
        <div className="pointer-events-none absolute top-1 bottom-1 w-px" style={{ left: `${xi}%`, background: "var(--hot)" }} aria-hidden />
        {zones.map((q) => {
          const rows = ticks.filter((t) => t[0] === q.zone);
          const on = q.zone === pick;
          // a jump: consecutive hourly ticks whose wall clocks are not one hour apart
          const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
          const jumps = rows.slice(1).flatMap((r, i) => {
            const d = (mins(r[2]!) - mins(rows[i][2]!) + 1440) % 1440;
            return d !== 60 ? [{ from: ms(rows[i][1]!), to: ms(r[1]!), was: rows[i][2]!, now: r[2]! }] : [];
          });
          return (
            <div key={q.zone} className="relative h-[54px] transition-opacity duration-200 ease-sfe" style={{ opacity: on ? 1 : 0.55 }}>
              <span className="absolute top-0 left-[4%] text-11" style={{ color: on ? "var(--hi)" : "var(--mute)" }}>
                {q.zone}
              </span>
              <span
                className="absolute top-0 rounded-xs px-1 text-[10px] leading-4 whitespace-nowrap tabular"
                style={{ left: `calc(${Math.min(78, xi)}% + 5px)`, color: "var(--hot)", background: on ? tint("hot", 12) : undefined, boxShadow: on ? ring("hot", 60) : undefined }}
              >
                {q.printed.slice(11)}
              </span>
              <div className="absolute right-[4%] left-[4%] top-[26px] h-px" style={{ background: on ? "var(--ink)" : "var(--line-2)" }} />
              {jumps.map((j) => (
                <div
                  key={j.from}
                  className="absolute top-[12px] h-[30px] w-0"
                  style={{ left: `${x(j.to)}%`, borderLeft: "2px dashed var(--mute)" }}
                  title={`the clock jumps from ${j.was} to ${j.now}: the hour in between never happens`}
                />
              ))}
              {rows.map((r, i) => {
                const show = !sparse || i % 2 === 0 || jumps.some((j) => j.to === ms(r[1]!));
                return (
                  <div key={r[1]} className="absolute top-[22px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${x(ms(r[1]!))}%` }}>
                    <span className="h-[9px] w-px" style={{ background: on ? "var(--ink)" : "var(--line-2)" }} />
                    {show && <span className="mt-0.5 text-[10px] leading-3 text-faint tabular">{r[2]}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Narration minLines={3}>{z.note}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend items={[["hot", "the signup: one instant"], ["mute", "the clock jumps an hour", "dashed"]]} />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
