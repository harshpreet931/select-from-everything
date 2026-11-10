"use client";

import { Fragment, useState, type ReactNode } from "react";
import { displayCell } from "@/lib/sql/shared/display.mjs";
import { fmt } from "./format";
import { FIG_TABLE } from "./classes";
import { foldGaps, foldRows } from "./fold";
import { tint, tv, type Ink, type Tone } from "./tone";

// a query result, drawn the same way the runner draws one (same display.mjs: numbers
// right, NULL faint italic, '' faint). figures add tones on top: a row or a cell can be
// tinted, ghosted (removed by this step), grouped (GROUP BY buckets alternate a neutral
// tint), or carry the ref cursor ▶ of an executor walking it.

export type CellValue = string | number | boolean | null;
export type Cell = CellValue | { v: CellValue; tone?: Ink; ghost?: boolean; title?: string };
export type Column = string | { name: string; type?: string; sys?: boolean };

const colName = (c: Column) => (typeof c === "string" ? c : c.name);
const colType = (c: Column) => (typeof c === "string" ? "" : (c.type ?? ""));
const isSys = (c: Column) => typeof c !== "string" && !!c.sys;
const raw = (c: Cell): CellValue => (c !== null && typeof c === "object" ? c.v : c);
const asText = (v: CellValue): string | null => (v === null ? null : typeof v === "boolean" ? (v ? "t" : "f") : String(v));

/** guess a type from the values when the column doesn't say (numbers right-align). */
function guessType(rows: Cell[][], j: number): string {
  let num = 0;
  let seen = 0;
  for (const r of rows.slice(0, 50)) {
    const v = raw(r[j]);
    if (v === null || v === undefined) continue;
    seen++;
    if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) num++;
  }
  return seen && num === seen ? "numeric" : "text";
}

export function ResultTable({
  columns,
  rows,
  rowTones,
  ghostRows = [],
  cursor,
  hotCell,
  group,
  footer = "auto",
  caption,
  dense,
  maxRows,
  focusRows = [],
  className = "",
}: {
  columns: Column[];
  rows: Cell[][];
  /** a tint per row (live = matches, dead = an anomaly row, hot = current) */
  rowTones?: (Ink | null | undefined)[];
  /** rows that were just removed: drawn faint and struck through */
  ghostRows?: number[];
  /** the executor's cursor: a row index, or before the first / after the last row */
  cursor?: number | "before" | "after";
  /** [row, column] being read right now */
  hotCell?: [number, number];
  /** column (index or name) whose runs of equal values form groups; groups alternate a neutral tint */
  group?: number | string;
  footer?: "auto" | "none" | ReactNode;
  caption?: ReactNode;
  dense?: boolean;
  /** show this many rows, then "… n more" with a button for the rest */
  maxRows?: number;
  /** rows that stay visible when folding (e.g. the ones a step just removed) */
  focusRows?: number[];
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const types = columns.map((c, j) => colType(c) || guessType(rows, j));
  const gi = typeof group === "string" ? columns.findIndex((c) => colName(c) === group) : group;
  // group parity per row
  const parity: number[] = [];
  let p = 0;
  rows.forEach((r, i) => {
    if (gi != null && gi >= 0 && i > 0 && asText(raw(r[gi])) !== asText(raw(rows[i - 1][gi]))) p ^= 1;
    parity.push(p);
  });
  // which rows to draw: every ghost and focus row, the rest of the room from the top (fold.ts)
  const visible = foldRows(rows.length, all ? undefined : maxRows, [...ghostRows, ...focusRows]);
  const gaps = foldGaps(rows.length, visible);
  const gapAt = new Map(gaps.map((g) => [g.at, g.count]));
  const lastGap = gaps.at(-1)?.at;
  const ghosts = new Set(ghostRows);
  const live = rows.length - ghosts.size;
  const py = dense ? "py-[3px]" : "py-[5px]";
  const hasCursor = cursor !== undefined;

  // "… n more": n is exactly the rows hidden at that spot (and how many of them were removed);
  // the last one offers to show all
  const gapRow = (count: number, last: boolean, at: number) => {
    let gone = 0;
    for (let i = at - count; i < at; i++) if (ghosts.has(i)) gone++;
    const what = gone === count ? `… ${fmt(count)} more removed` : gone ? `… ${fmt(count)} more, ${fmt(gone)} of them removed` : `… ${fmt(count)} more`;
    return (
    <tr className="text-11 text-faint">
      {hasCursor && <td className="p-0" />}
      <td colSpan={columns.length} className="border-t border-line px-3 py-1">
        {what}
        {last && (
          <button type="button" className="ml-3 text-link underline-offset-2 hover:underline" onClick={() => setAll(true)}>
            show all {fmt(rows.length)}
          </button>
        )}
      </td>
    </tr>
    );
  };

  const cursorRow = (label: string, on: boolean) => (
    <tr className="text-11 text-faint">
      <td className="w-[2.4ch] p-0 text-center text-12 text-ref" aria-hidden>
        {on ? "▶" : ""}
      </td>
      <td colSpan={columns.length} className="px-3 py-0.5 italic">
        {label}
      </td>
    </tr>
  );

  return (
    <div className={`min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)] ${className}`}>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
          {caption != null && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {hasCursor && <th className="w-[2.4ch] border-b border-line-2 p-0" aria-label="cursor" />}
              {columns.map((c, j) => {
                const t = colType(c);
                const right = displayCell("0", types[j]).align === "right";
                return (
                  <th
                    key={j}
                    scope="col"
                    className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap ${right ? "text-right" : "text-left"}`}
                  >
                    <span style={{ color: isSys(c) ? "var(--meta)" : "var(--hi)" }}>{colName(c)}</span>
                    {t && <span className="ml-1.5 text-11 text-faint">{t}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cursor === "before" && cursorRow("before first", true)}
            {visible.map((i) => {
              const r = rows[i];
              const ghost = ghosts.has(i);
              const rt = rowTones?.[i];
              const on = cursor === i;
              const semantic = rt && rt !== "mute" && rt !== "faint" && rt !== "ink" && rt !== "hi";
              const bg = semantic ? tint(rt as Tone | "accent", 12) : on ? tint("ref", 9) : gi != null && gi >= 0 && parity[i] ? "var(--well-2)" : undefined;
              return (
                <Fragment key={i}>
                {gapAt.has(i) && gapRow(gapAt.get(i)!, lastGap === i, i)}
                <tr
                  className="transition-[background-color,opacity] duration-200 ease-sfe"
                  style={{
                    background: bg,
                    opacity: ghost ? 0.4 : 1,
                    boxShadow: rt && semantic ? `inset 2px 0 0 ${tv(rt)}` : undefined,
                  }}
                  aria-label={ghost ? "removed" : undefined}
                >
                  {hasCursor && (
                    <td className="p-0 text-center text-12 text-ref" aria-hidden>
                      {on ? "▶" : ""}
                    </td>
                  )}
                  {columns.map((c, j) => {
                    const cell = r[j];
                    const o = cell !== null && typeof cell === "object" ? cell : null;
                    // text EXPLAIN (a "QUERY PLAN" column): indentation is the tree, and a long line
                    // (Remote SQL: …) is the point, so keep both and let the table scroll
                    const plan = /^query plan$/i.test(colName(c));
                    const d = displayCell(asText(raw(cell)), types[j], plan ? {} : { maxChars: 48 });
                    const isHot = hotCell && hotCell[0] === i && hotCell[1] === j;
                    const sys = isSys(c);
                    const k: Ink | undefined = o?.tone ?? (sys ? (colName(c) === "ctid" ? "ref" : "meta") : undefined);
                    return (
                      <td
                        key={j}
                        title={o?.title}
                        className={`border-t border-line px-3 ${py} ${plan ? "whitespace-pre" : "whitespace-nowrap"} tabular ${d.align === "right" ? "text-right" : "text-left"}`}
                        style={{
                          color: isHot ? "var(--hot)" : k ? tv(k) : d.isNull || d.empty ? "var(--faint)" : "var(--ink)",
                          background: isHot ? tint("hot", 16) : undefined,
                          fontStyle: d.isNull ? "italic" : undefined,
                          textDecoration: ghost || o?.ghost ? "line-through" : undefined,
                          opacity: o?.ghost ? 0.4 : undefined,
                        }}
                      >
                        {d.text}
                      </td>
                    );
                  })}
                </tr>
                </Fragment>
              );
            })}
            {gapAt.has(rows.length) && gapRow(gapAt.get(rows.length)!, true, rows.length)}
            {cursor === "after" && cursorRow("after last", true)}
          </tbody>
        </table>
      </div>
      {footer !== "none" && (
        <div className="border-t border-line px-3 py-1 text-11 text-faint tabular">
          {footer === "auto" ? `(${fmt(live)} ${live === 1 ? "row" : "rows"})` : footer}
        </div>
      )}
    </div>
  );
}
