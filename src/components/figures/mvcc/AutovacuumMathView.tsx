"use client";

import { useState } from "react";
import { Narration, Provenance, Row, Slider, Stat, Words, fmt, tint } from "@/components/figures/kit";

// the autovacuum trigger formula as a calculator. slide the table size, pick a scale factor, and
// read how many dead rows (or inserted rows, or changed rows) it takes before a worker comes.
// a model: the formula from the postgres 18 docs, with the defaults a real server reported.

export type AvSettings = { base: number; scale: number; max: number; insBase: number; insScale: number; anBase: number; anScale: number };

const short = (n: number) =>
  n >= 1e9 ? `${fmt(Math.round(n / 1e8) / 10)} billion` : n >= 1e6 ? `${fmt(Math.round(n / 1e5) / 10)} million` : fmt(Math.round(n));

export function AutovacuumMathView({ s, version }: { s: AvSettings; version: string }) {
  const [exp, setExp] = useState(6);
  const [sf, setSf] = useState(s.scale);
  const n = Math.round(10 ** exp);
  const raw = s.base + sf * n;
  const vac = Math.min(s.max, raw);
  const capped = raw > s.max;
  const ins = s.insBase + s.insScale * n;
  const an = s.anBase + s.anScale * n;
  const share = vac / (n + vac);
  const options = [...new Set([s.scale, 0.05, 0.01])];
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="rows =" w="16ch">
          <Slider k="rows in the table" min={3} max={10} step={0.25} value={exp} onChange={setExp} format={() => short(n)} />
        </Row>
        <Row k="scale_factor =" w="16ch" last>
          <Words label="autovacuum_vacuum_scale_factor" options={options.map((o) => ({ v: o, label: o === s.scale ? `${o} (default)` : String(o) }))} value={sf} onChange={setSf} />
        </Row>
      </div>
      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] @min-[560px]:grid-cols-3">
        <Stat k="dead rows before a vacuum" v={fmt(Math.round(vac))} tone="dead" />
        <Stat k="inserted rows before a vacuum" v={fmt(Math.round(ins))} />
        <Stat k="changed rows before an analyze" v={fmt(Math.round(an))} />
      </div>
      <div>
        <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-11 text-faint">
          <span>live rows, and dead ones waiting</span>
          <span className="tabular">dead = {fmt(Math.round((vac / n) * 1000) / 10)}% of the live rows</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-[2px]" style={{ boxShadow: "inset 0 0 0 1px var(--line-2)" }} role="img" aria-label={`${fmt(Math.round(share * 100))} percent of the table dead before autovacuum comes`}>
          <span style={{ width: `${(1 - share) * 100}%`, background: "color-mix(in srgb, var(--live) 38%, transparent)" }} />
          <span style={{ width: `${share * 100}%`, background: tint("dead", 30), outline: "1px dashed var(--dead)", outlineOffset: -1 }} />
        </div>
      </div>
      <Narration minLines={3}>
        {`${s.base} + ${sf} × ${fmt(n)} = ${fmt(Math.round(raw))}. `}
        {capped
          ? `that's past autovacuum_vacuum_max_threshold, new in postgres 18, so the trigger is capped at ${fmt(s.max)} dead rows. before 18 this table would wait for all ${fmt(Math.round(raw))}.`
          : n >= 1e8
            ? `a big table waits a long time: every dead row in it is scanned past by every seq scan until then.`
            : n >= 1e5
              ? `${sf === s.scale ? "a fifth" : `${Math.round(sf * 1000) / 10}%`} of the table has to be dead before a worker comes. the bigger the table, the more rows that is.`
              : `small tables get vacuumed after a modest number of dead rows, and often.`}
      </Narration>
      <Provenance sim={`model: the trigger formulas from the postgres 18 docs, defaults as a postgres ${version} server reports them; the insert trigger assumes no page is frozen yet`} />
    </div>
  );
}
