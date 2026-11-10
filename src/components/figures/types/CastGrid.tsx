"use client";

import { useState } from "react";
import { FIG_TABLE, Legend, Narration, Provenance, ring } from "@/components/figures/kit";

// pg_cast as a grid: rows are the type you have, columns the type you want, and each cell is the
// context the cast is allowed in (i implicit, a assignment, e explicit) or empty when pg_cast has
// no entry. the cells are a captured pg_cast listing; click one for what it means.

type Ctx = "i" | "a" | "e";

const SAYS: Record<Ctx, string> = {
  i: "implicit. postgres adds this cast on its own wherever it helps: in arithmetic, in a comparison, in a function call.",
  a: "assignment. postgres adds it only when you store a value into a column of the target type (INSERT, UPDATE). anywhere else, you write the cast.",
  e: "explicit only. it happens when you ask for it with :: or CAST, never on its own.",
};

export function CastGrid({
  types,
  rows,
  start = ["integer", "bigint"],
  trace,
}: {
  /** the types in order: the regtype name the capture prints, and a short label */
  types: { name: string; label: string }[];
  /** captured pg_cast rows: [source, target, context] */
  rows: (string | null)[][];
  start?: [string, string];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const ctx = new Map(rows.map((r) => [`${r[0]}→${r[1]}`, r[2] as Ctx]));
  const [sel, setSel] = useState<[string, string]>(start);
  const label = (n: string) => types.find((t) => t.name === n)?.label ?? n;
  const cur = ctx.get(`${sel[0]}→${sel[1]}`);
  const note =
    sel[0] === sel[1]
      ? `${label(sel[0])} to itself: nothing to cast.`
      : cur
        ? `${label(sel[0])} → ${label(sel[1])}: ${SAYS[cur]}`
        : `${label(sel[0])} → ${label(sel[1])}: no row in pg_cast at all. there is no way to turn one into the other, not even with ::, short of going through text.`;
  const look = (c: Ctx | undefined): { color: string; bg?: string; ring?: string; dashed?: boolean } =>
    c === "i"
      ? { color: "var(--hi)", bg: "var(--well-2)", ring: ring("hi", 80) }
      : c === "a"
        ? { color: "var(--ink)", ring: ring("line-2") }
        : c === "e"
          ? { color: "var(--mute)", dashed: true }
          : { color: "var(--faint)" };

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the casts between eight types, from pg_cast">
      <div className="min-w-0 overflow-x-auto">
        <table className={`mx-auto border-collapse text-12 ${FIG_TABLE}`}>
          <caption className="sr-only">rows: the type you have. columns: the type you want.</caption>
          <thead>
            <tr>
              <th className="border-0 px-1 pb-1 text-right text-[10px] font-normal text-faint">from ↓ to →</th>
              {types.map((t) => (
                <th key={t.name} scope="col" className="border-0 px-0.5 pb-1 text-center text-[10px] font-normal @min-[420px]:text-11" style={{ color: t.name === sel[1] ? "var(--hot)" : "var(--mute)" }}>
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((src) => (
              <tr key={src.name}>
                <th scope="row" className="border-0 pr-2 text-right text-11 font-normal whitespace-nowrap" style={{ color: src.name === sel[0] ? "var(--hot)" : "var(--mute)" }}>
                  {src.label}
                </th>
                {types.map((dst) => {
                  const same = src.name === dst.name;
                  const c = ctx.get(`${src.name}→${dst.name}`);
                  const l = look(c);
                  const on = sel[0] === src.name && sel[1] === dst.name;
                  return (
                    <td key={dst.name} className="border-0 p-0.5">
                      <button
                        type="button"
                        onClick={() => setSel([src.name, dst.name])}
                        aria-pressed={on}
                        aria-label={`${src.label} to ${dst.label}: ${same ? "same type" : c === "i" ? "implicit" : c === "a" ? "assignment" : c === "e" ? "explicit" : "no cast"}`}
                        className="flex size-7 items-center justify-center rounded-xs text-11 @min-[420px]:size-9 @min-[420px]:text-12 transition-[box-shadow,background-color] duration-200 ease-sfe @min-[520px]:size-10"
                        style={{
                          color: same ? "var(--faint)" : l.color,
                          background: same ? "var(--well-2)" : l.bg,
                          boxShadow: on ? `${ring("hot", undefined, 2)}` : l.ring,
                          outline: l.dashed && !on ? "1px dashed var(--line-2)" : undefined,
                          outlineOffset: -1,
                        }}
                      >
                        {same ? "" : (c ?? "·")}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Narration minLines={3}>{note}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend
          items={[
            ["hi", "i  implicit", "ghost"],
            ["mute", "a  assignment", "ghost"],
            ["mute", "e  explicit", "dashed"],
            ["faint", "·  no cast", "line"],
          ]}
        />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
