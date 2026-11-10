"use client";

import { useMemo, useState } from "react";
import { Chip, Legend, NARR, Row, Words, ring, tint } from "@/components/figures/kit";
import type { Snap, Tuple, XactStatus } from "@/lib/db/views";
import { freshReader, snapText, visible, type Reader } from "@/lib/db/visibility";

// the visibility decision as a flowchart, run on real tuples. pick a reader and a version: the
// questions postgres asks light up in order, the one that decides is hot, and the answer is
// live (visible) or mute (invisible). underneath, every tuple's prediction from visibility.ts
// next to the rows postgres really returned to that reader.

export type FlowReader = { name: string; snap: Snap | null; me: number | null; real: string[] };

const NODES: { q: string; yes: "visible" | "invisible" | "depends" }[] = [
  { q: "xmin aborted?", yes: "invisible" },
  { q: "xmin is me?", yes: "depends" },
  { q: "xmin not done at snapshot time?", yes: "invisible" },
  { q: "no xmax, or xmax only locked it?", yes: "visible" },
  { q: "xmax is me?", yes: "invisible" },
  { q: "xmax aborted?", yes: "visible" },
  { q: "xmax not done at snapshot time?", yes: "visible" },
  { q: "otherwise: deleted before my snapshot", yes: "invisible" },
];

type T = Tuple & { block: number };
const ctidOf = (t: T) => `(${t.block},${t.lp})`;

export function VisibilityFlowView({
  tuples,
  xact,
  readers,
  label,
  source,
}: {
  tuples: T[];
  xact: Record<number, XactStatus>;
  readers: FlowReader[];
  label?: string;
  source: string;
}) {
  const [who, setWho] = useState(readers[0]?.name ?? "");
  const [lp, setLp] = useState(tuples[0]?.lp ?? 1);
  const rd = readers.find((r) => r.name === who) ?? readers[0];
  const reader: Reader = useMemo(() => (rd?.snap ? { snap: rd.snap, me: rd.me } : freshReader(xact)), [rd, xact]);
  const verdicts = useMemo(() => tuples.map((t) => ({ t, v: visible(t, xact, reader) })), [tuples, xact, reader]);
  const cur = verdicts.find((d) => d.t.lp === lp) ?? verdicts[0];
  const predicted = verdicts.filter((d) => d.v.visible).map((d) => ctidOf(d.t));
  const real = rd?.real ?? [];
  const same = predicted.length === real.length && predicted.every((c) => real.includes(c));
  if (!cur || !rd) return null;
  const rule = cur.v.rule;

  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="reader =" w="9ch">
          <Words label="who is reading" options={readers.map((r) => r.name)} value={rd.name} onChange={setWho} />
          <span className="ml-1 text-[10px] text-meta">
            snapshot {snapText(reader.snap)}
            {reader.me ? ` · me = ${reader.me}` : ""}
          </span>
        </Row>
        <Row k="version =" w="9ch" last align="start">
          <div className="grid w-full min-w-0 gap-1.5 grid-cols-2 @min-[560px]:grid-cols-3 @min-[760px]:grid-cols-4">
            {verdicts.map(({ t, v }) => {
              const sel = t.lp === cur.t.lp;
              return (
                <button
                  key={t.lp}
                  type="button"
                  onClick={() => setLp(t.lp)}
                  aria-pressed={sel}
                  className="min-w-0 rounded-md px-2 py-1.5 text-left transition-[box-shadow,background-color] duration-200 ease-sfe"
                  style={{ boxShadow: sel ? ring("hot", undefined, 1.5) : ring("line-2"), background: v.visible ? tint("live", 12) : undefined }}
                >
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-ref tabular">{ctidOf(t)}</span>
                    <span className="text-[10px] text-faint tabular">
                      {t.xmin}
                      {t.xmax ? ` / ${t.xmax}` : ""}
                    </span>
                  </span>
                  {label && t.data?.[label] != null && <span className="block truncate text-[10px] text-mute">{t.data[label]}</span>}
                </button>
              );
            })}
          </div>
        </Row>
      </div>

      <ol className="grid gap-1" aria-label="the visibility checks, in order">
        {NODES.map((n, i) => {
          const k = i + 1;
          const asked = k <= rule;
          const hit = k === rule;
          const out = n.yes === "depends" ? (cur.v.visible ? "visible" : "invisible") : n.yes;
          return (
            <li
              key={k}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-[opacity,box-shadow] duration-200 ease-sfe"
              style={{ opacity: asked ? 1 : 0.35, boxShadow: hit ? ring("hot", undefined, 1.5) : ring("line") }}
            >
              <span className="w-4 shrink-0 text-right text-faint tabular">{k}</span>
              <span className={`min-w-0 flex-1 ${hit ? "text-hi" : "text-ink"}`}>{n.q}</span>
              <span className="shrink-0 text-11">
                {hit ? (
                  <Chip tone={out === "visible" ? "live" : "mute"} dashed={out !== "visible"}>
                    {k === 8 ? "" : "yes → "}
                    {out}
                  </Chip>
                ) : asked ? (
                  <span className="text-faint">no</span>
                ) : (
                  <span className="text-faint">{n.yes === "depends" ? "yes → visible*" : `yes → ${n.yes}`}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className={NARR} aria-live="polite">
        <span className="font-mono text-11 text-ref">{ctidOf(cur.t)}</span>{" "}
        <span style={{ color: cur.v.visible ? "var(--live)" : "var(--mute)" }}>{cur.v.visible ? "visible:" : "invisible:"}</span> {cur.v.why}
      </p>

      <div className="grid min-w-0 gap-1 rounded-md bg-well px-3 py-2.5 text-11 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <span className="w-[13ch] shrink-0 text-faint">predicted</span>
          {predicted.map((c) => (
            <span key={c} className="text-ref tabular">
              {c}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <span className="w-[13ch] shrink-0 text-faint">postgres said</span>
          {real.map((c) => (
            <span key={c} className="text-ref tabular">
              {c}
            </span>
          ))}
        </div>
        <div style={{ color: same ? "var(--live)" : "var(--dead)" }}>
          {same ? `same ${real.length} versions: the model agrees with the server for ${rd.name}.` : "the model and the server disagree here."}
        </div>
      </div>
      <Legend
        items={[
          ["hot", "the check that decides"],
          ["live", "visible to this reader"],
          ["mute", "invisible", "dashed"],
          ["ref", "ctid"],
        ]}
      />
      <div className="text-right text-[10px] leading-4 text-faint">
        model: src/lib/db/visibility.ts · checked against {source}
      </div>
    </div>
  );
}
