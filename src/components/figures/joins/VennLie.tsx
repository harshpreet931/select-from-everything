"use client";

import { useId, useState } from "react";
import { Narration, Provenance, Row, Words, fmt, tint } from "@/components/figures/kit";

// the venn diagram from every join cheat sheet, next to what postgres actually returned. the
// shaded part is what the picture promises; the bound under it follows from the picture alone
// (an overlap can't be bigger than a circle, a circle can't be bigger than itself). the counts
// are captured results, so the verdict is postgres against the picture.

type Shade = "inner" | "left" | "full" | "intersect" | "except" | "union";
type Mode = { v: string; label: string; shade: Shade; got: string; shape: string; note?: string };

const BOUND: Record<Shade, (l: number, r: number) => number> = {
  inner: (l, r) => Math.min(l, r),
  intersect: (l, r) => Math.min(l, r),
  left: (l) => l,
  except: (l) => l,
  full: (l, r) => l + r,
  union: (l, r) => l + r,
};

const PROMISE: Record<Shade, string> = {
  inner: "the overlap: part of each circle",
  intersect: "the overlap: part of each circle",
  left: "the whole left circle",
  except: "the left circle, minus the overlap",
  full: "both circles",
  union: "both circles",
};

export function VennLie({
  left,
  right,
  modes,
  trace,
}: {
  left: { name: string; n: string };
  right: { name: string; n: string };
  modes: Mode[];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [v, setV] = useState(modes[0].v);
  const m = modes.find((x) => x.v === v) ?? modes[0];
  const id = useId().replace(/:/g, "");
  const L = Number(left.n);
  const R = Number(right.n);
  const got = Number(m.got);
  const bound = BOUND[m.shade](L, R);
  const holds = got <= bound;
  const fill = tint("hot", 30);
  const lens = m.shade === "inner" || m.shade === "intersect";
  const leftAll = m.shade === "left" || m.shade === "full" || m.shade === "union";
  const rightAll = m.shade === "full" || m.shade === "union";
  const leftOnly = m.shade === "except";

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="a venn diagram next to the real row counts">
      <Row k="query =" w="8ch" last align="baseline">
        <Words label="what to compare" options={modes.map((x) => ({ v: x.v, label: x.label }))} value={v} onChange={setV} />
      </Row>
      <div className="grid min-w-0 items-center gap-4 @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <svg viewBox="0 0 320 196" className="mx-auto w-full max-w-[360px]" role="img" aria-label={`venn diagram: ${PROMISE[m.shade]} is shaded`}>
          <defs>
            <clipPath id={`l${id}`}>
              <circle cx="118" cy="92" r="78" />
            </clipPath>
            <mask id={`x${id}`}>
              <rect width="320" height="196" fill="white" />
              <circle cx="202" cy="92" r="78" fill="black" />
            </mask>
          </defs>
          {leftAll && <circle cx="118" cy="92" r="78" fill={fill} />}
          {rightAll && <circle cx="202" cy="92" r="78" fill={fill} />}
          {leftOnly && <circle cx="118" cy="92" r="78" fill={fill} mask={`url(#x${id})`} />}
          {lens && <circle cx="202" cy="92" r="78" fill={fill} clipPath={`url(#l${id})`} />}
          <circle cx="118" cy="92" r="78" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
          <circle cx="202" cy="92" r="78" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
          <text x="80" y="88" textAnchor="middle" fill="var(--hi)" fontSize="12">
            {left.name}
          </text>
          <text x="80" y="104" textAnchor="middle" fill="var(--mute)" fontSize="11">
            {fmt(L)} rows
          </text>
          <text x="240" y="88" textAnchor="middle" fill="var(--hi)" fontSize="12">
            {right.name}
          </text>
          <text x="240" y="104" textAnchor="middle" fill="var(--mute)" fontSize="11">
            {fmt(R)} rows
          </text>
        </svg>
        <dl className="grid min-w-0 gap-3 text-12">
          <div>
            <dt className="text-11 text-faint">the picture shades</dt>
            <dd className="text-ink">{PROMISE[m.shade]}</dd>
          </div>
          <div>
            <dt className="text-11 text-faint">so it promises</dt>
            <dd className="text-ink tabular">at most {fmt(bound)} rows</dd>
          </div>
          <div>
            <dt className="text-11 text-faint">postgres returned</dt>
            <dd className="text-[1.25rem] leading-tight tabular" style={{ color: holds ? "var(--live)" : "var(--dead)" }}>
              {fmt(got)} rows
            </dd>
          </div>
          <div>
            <dt className="text-11 text-faint">one row is</dt>
            <dd className="text-ink">{m.shape}</dd>
          </div>
          <div>
            <dd className="text-12" style={{ color: holds ? "var(--live)" : "var(--dead)" }}>
              {holds ? "the picture holds." : `the picture lies, by ${fmt(Math.round(got / Math.max(1, bound)))}x.`}
            </dd>
          </div>
        </dl>
      </div>
      <Narration minLines={2}>{m.note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
