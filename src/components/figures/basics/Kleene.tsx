"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, Words, ring, tint } from "@/components/figures/kit";

// AND, OR and NOT with a third value. every cell is postgres's own answer (one captured SELECT
// over true, false and NULL crossed with themselves); the narration explains a cell the way the
// logic works: read unknown as "true or false, nobody knows which", try both, and if both give
// the same answer, that's the answer. the tries are looked up in the same captured table.

type V = "t" | "f" | null;
type Op = "AND" | "OR" | "NOT";
const VALS: V[] = ["t", "f", null];
const word = (v: V) => (v === "t" ? "true" : v === "f" ? "false" : "unknown");

function Cell({ v, on, onClick, label }: { v: V; on: boolean; onClick: () => void; label: string }) {
  const style =
    v === "t"
      ? { color: "var(--live)", background: tint("live", 10), boxShadow: ring("live", 55) }
      : v === "f"
        ? { color: "var(--mute)", boxShadow: ring("line-2") }
        : { color: "var(--mute)", outline: "1px dashed var(--faint)", outlineOffset: -1, fontStyle: "italic" as const };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className="relative flex h-9 w-full min-w-[9ch] items-center justify-center rounded-xs text-12 transition-[box-shadow,background-color] duration-150 ease-sfe"
      style={on ? { ...style, boxShadow: `${ring("hot", undefined, 2)}${style.boxShadow ? `, ${style.boxShadow}` : ""}` } : style}
    >
      {word(v)}
    </button>
  );
}

export function Kleene({
  table,
  trace,
}: {
  /** captured: columns a, b, "a AND b", "a OR b", "NOT a"; rows for every (a, b) */
  table: { columns: { name: string }[]; rows: (string | null)[][] };
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [op, setOp] = useState<Op>("AND");
  const [sel, setSel] = useState<[V, V]>([null, "f"]);
  const at = (name: string) => table.columns.findIndex((c) => c.name === name);
  const ia = at("a");
  const ib = at("b");
  const asV = (x: string | null | undefined): V => (x === "t" || x === "f" ? x : null);
  const look = (o: Op, a: V, b: V): V => {
    const r = table.rows.find((x) => asV(x[ia]) === a && (o === "NOT" || asV(x[ib]) === b));
    return asV(r?.[at(o === "NOT" ? "NOT a" : `a ${o} b`)]);
  };

  const [a, b] = sel;
  const res = look(op, a, b);
  // try every way the unknowns could turn out
  const as = a === null ? (["t", "f"] as V[]) : [a];
  const bs = op === "NOT" ? [b] : b === null ? (["t", "f"] as V[]) : [b];
  const tries = as.flatMap((x) => bs.map((y) => ({ x, y, r: look(op, x, y) })));
  const same = tries.every((t) => t.r === tries[0].r);
  const expr = (x: V, y: V) => (op === "NOT" ? `NOT ${word(x)}` : `${word(x)} ${op} ${word(y)}`);

  let note: string;
  if (a !== null && (op === "NOT" || b !== null)) note = `${expr(a, b)} is plain two-valued logic: ${word(res)}.`;
  else {
    const list = tries.map((t) => `${expr(t.x, t.y)} is ${word(t.r)}`).join(", ");
    note = same
      ? `read unknown as "true or false, nobody knows which" and try both: ${list}. every way gives ${word(tries[0].r)}, so ${expr(a, b)} is ${word(res)}.`
      : `read unknown as "true or false, nobody knows which" and try both: ${list}. the answers disagree, so ${expr(a, b)} is unknown.`;
  }

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="truth tables for AND, OR and NOT with unknown">
      <div className="grid grid-cols-[10ch_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-2 text-12">
        <span className="text-faint">operator =</span>
        <Words
          options={["AND", "OR", "NOT"] as Op[]}
          value={op}
          onChange={(o) => {
            setOp(o);
            if (o === "NOT") setSel([sel[0], null]);
            else if (sel[1] === null && sel[0] !== null) setSel([sel[0], "f"]);
          }}
          label="operator"
        />
      </div>

      <div className="overflow-x-auto">
        <table className={`mx-auto border-separate border-spacing-1.5 text-12 ${FIG_TABLE} [&_th]:border-0`}>
          <caption className="sr-only">{op === "NOT" ? "NOT a, for each a" : `a ${op} b, for each a and b`}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 text-right text-11 text-faint">
                {op === "NOT" ? "a" : "a ╲ b"}
              </th>
              {op === "NOT" ? (
                <th scope="col" className="px-2 text-center text-11 text-faint">
                  NOT a
                </th>
              ) : (
                VALS.map((y) => (
                  <th key={String(y)} scope="col" className="px-2 text-center text-11 text-hi">
                    {word(y)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {VALS.map((x) => (
              <tr key={String(x)}>
                <th scope="row" className="px-2 text-right text-11 text-hi">
                  {word(x)}
                </th>
                {(op === "NOT" ? [null] : VALS).map((y) => {
                  const v = look(op, x, y);
                  const on = sel[0] === x && (op === "NOT" || sel[1] === y);
                  return (
                    <td key={String(y)} className="p-0">
                      <Cell v={v} on={on} onClick={() => setSel([x, y])} label={`${expr(x, y)} is ${word(v)}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Narration minLines={3}>{note}</Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
