"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { displayCell } from "@/lib/sql/shared/display.mjs";
import { FIG_TABLE, Legend, Narration, Provenance, SqlPanel, Words, ring, tint, useReducedMotion, type LegendItem } from "@/components/figures/kit";
import type { FrameRun } from "./frames";

// a window frame, drawn on the rows it slides over. pick the mode and the bounds, move the
// current row, and the bracket shows exactly which rows fed the window function for that row.
// nothing collapses: every row keeps its own value in the out columns.
//
// every frame is postgres's own answer (array_agg(id) OVER w in the capture, read by frameLab
// in ./frames.ts); nothing here decides which rows are in a frame. draw="arrow" is the same
// figure for LAG and LEAD: the frame column is lag(id), the one row that was read.

type Col = { name: string; type?: string };
type Opt = string | { v: string; label: string };
const val = (o: Opt) => (typeof o === "string" ? o : o.v);

const FRAME = /\b(ROWS|RANGE|GROUPS)\s+BETWEEN\s+[\s\S]+?\s+AND\s+(?:UNBOUNDED\s+FOLLOWING|CURRENT\s+ROW|[^\s()]+(?:\s+'[^']*')?\s+(?:PRECEDING|FOLLOWING)|interval\s+'[^']*'\s+(?:PRECEDING|FOLLOWING))(?:\s+EXCLUDE\s+(?:CURRENT\s+ROW|GROUP|TIES|NO\s+OTHERS))?/i;
const CALL = /\b(lag|lead|first_value|last_value|nth_value)\s*\([^)]*\)/gi;

function marksOf(sql: string, extra: string[]) {
  const out: { from: number; to: number; tone: "hot" }[] = [];
  const f = FRAME.exec(sql);
  if (f) out.push({ from: f.index, to: f.index + f[0].length, tone: "hot" });
  for (const m of sql.matchAll(CALL)) out.push({ from: m.index!, to: m.index! + m[0].length, tone: "hot" });
  for (const h of extra) {
    const at = sql.indexOf(h);
    if (at >= 0) out.push({ from: at, to: at + h.length, tone: "hot" });
  }
  return out;
}

const text = (v: string | null) => (v === null ? "null" : v);

export function WindowFrame({
  columns,
  rows,
  outCols,
  runs,
  options,
  start,
  startRow = 0,
  peer,
  draw = "bracket",
  hot = [],
  rowLabel = "row",
  trace,
}: {
  columns: Col[];
  rows: (string | null)[][];
  outCols: Col[];
  runs: Record<string, FrameRun>;
  options: { key: string; values: Opt[] }[];
  start?: string[];
  startRow?: number;
  /** the ORDER BY column: rows with equal values are peers (a stronger line between groups) */
  peer?: string;
  draw?: "bracket" | "arrow";
  /** more substrings to light up in the sql */
  hot?: string[];
  /** what a row is called in the narration ("row", "day", "month") */
  rowLabel?: string;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<string[]>(() => options.map((o, i) => start?.[i] ?? val(o.values[0])));
  const s = useStepper(rows.length, { interval: 1500, start: startRow });
  const key = picked.join(" | ");
  const run = runs[key];
  const cur = Math.min(s.i, rows.length - 1);

  // measured row boxes, so the bracket and arrows sit exactly on the rows
  const wrap = useRef<HTMLDivElement>(null);
  const trs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [box, setBox] = useState<{ top: number; h: number }[]>([]);
  const measure = useCallback(() => {
    const w = wrap.current;
    if (!w) return;
    const base = w.getBoundingClientRect().top;
    setBox(trs.current.slice(0, rows.length).map((tr) => (tr ? { top: tr.getBoundingClientRect().top - base, h: tr.getBoundingClientRect().height } : { top: 0, h: 0 })));
  }, [rows.length]);
  useLayoutEffect(() => {
    measure();
    const w = wrap.current;
    if (!w || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    return () => ro.disconnect();
  }, [measure]);

  const src = run?.src[cur] ?? [];
  const inSrc = new Set(src);
  const span = run?.span?.[cur] ?? (src.length && draw === "bracket" ? ([Math.min(...src), Math.max(...src)] as [number, number]) : null);
  const pj = peer ? columns.findIndex((c) => c.name === peer) : -1;
  const peerOf = (i: number) => (pj >= 0 ? rows[i][pj] : null);
  const peers = pj >= 0 ? rows.flatMap((r, i) => (r[pj] === rows[cur][pj] ? [i] : [])) : [cur];

  const kw = `${Math.max(...options.map((o) => o.key.length)) + 3}ch`;
  const GUT = draw === "arrow" ? 38 : 20;
  const ease = reduce ? undefined : "top 220ms var(--ease), height 220ms var(--ease), opacity 220ms var(--ease)";

  // the bracket
  let bracket: ReactNode = null;
  if (draw === "bracket" && span && box[span[0]] && box[span[1]]) {
    const top = box[span[0]].top + 3;
    const bottom = box[span[1]].top + box[span[1]].h - 3;
    const st: CSSProperties = {
      position: "absolute",
      left: 7,
      width: 8,
      top,
      height: Math.max(6, bottom - top),
      borderLeft: "2px solid var(--live)",
      borderTop: "2px solid var(--live)",
      borderBottom: "2px solid var(--live)",
      borderRadius: "3px 0 0 3px",
      transition: ease,
    };
    bracket = <div aria-hidden style={st} />;
  }

  // the arrow: from the current row to the row it read
  let arrow: ReactNode = null;
  if (draw === "arrow" && box[cur]) {
    const y1 = box[cur].top + box[cur].h / 2;
    const x = GUT - 4;
    if (src.length && box[src[0]]) {
      const y2 = box[src[0]].top + box[src[0]].h / 2;
      const bend = Math.min(GUT - 8, 14 + Math.abs(y2 - y1) / 8);
      arrow = (
        <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={GUT} height={1}>
          <defs>
            <marker id="wf-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0.6 L7.4 4 L0 7.4 z" fill="var(--ref)" />
            </marker>
          </defs>
          <path d={`M${x} ${y1} C${x - bend} ${y1}, ${x - bend} ${y2}, ${x} ${y2}`} fill="none" stroke="var(--ref)" strokeWidth={1.4} markerEnd="url(#wf-head)" />
        </svg>
      );
    } else {
      // no row there: the arrow points off the edge of the partition
      const up = !/\blead\s*\(/i.test(run?.sql ?? "");
      const y2 = up ? y1 - 12 : y1 + 12;
      arrow = (
        <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={GUT} height={1}>
          <path d={`M${x} ${y1} L${x - 10} ${y1} L${x - 10} ${y2}`} fill="none" stroke="var(--faint)" strokeWidth={1.2} strokeDasharray="3 3" />
        </svg>
      );
    }
  }

  const types = columns.map((c) => c.type ?? "");
  const otypes = outCols.map((c) => c.type ?? "");
  const curOut = run?.out[cur] ?? [];
  const names = src.map((i) => rows[i][0]).join(", ");
  const excluded = span ? Array.from({ length: span[1] - span[0] + 1 }, (_, k) => span[0] + k).filter((i) => !inSrc.has(i)) : [];

  const what =
    draw === "arrow"
      ? src.length
        ? `${rowLabel} ${text(rows[cur][0])} reads ${rowLabel} ${text(rows[src[0]][0])}.`
        : `${rowLabel} ${text(rows[cur][0])} has no ${rowLabel} there, so it gets the default: ${text(curOut[0] ?? null)}.`
      : src.length
        ? `${rowLabel} ${text(rows[cur][0])}: ${src.length} ${src.length === 1 ? "row" : "rows"} in the frame (${names})${excluded.length ? `, ${excluded.length} excluded` : ""}${peers.length > 1 ? `; it has ${peers.length - 1} ${peers.length === 2 ? "peer" : "peers"}` : ""}.`
        : `${rowLabel} ${text(rows[cur][0])}: the frame is empty.`;

  const legend: LegendItem[] =
    draw === "arrow"
      ? [
          ["hot", "current row", "line"],
          ["ref", "the row it reads"],
        ]
      : [
          ["hot", "current row", "line"],
          ["live", "in the frame"],
          ...(run?.span ? ([["faint", "excluded", "dashed"]] as LegendItem[]) : []),
        ];

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="a window frame over the rows of a query">
      <div className="grid">
        {options.map((o, i) => (
          <div
            key={o.key}
            className={`grid gap-x-3 gap-y-1 py-2 text-12 ${parseInt(kw) > 12 ? "grid-cols-[minmax(0,1fr)] @min-[520px]:grid-cols-[var(--kw)_minmax(0,1fr)]" : "grid-cols-[var(--kw)_minmax(0,1fr)]"} ${i < options.length - 1 ? "border-b border-line" : ""}`}
            style={{ ["--kw" as string]: kw }}
          >
            <span className="pt-0.5 text-faint">{o.key} =</span>
            <Words options={o.values.map((x) => (typeof x === "string" ? x : { v: x.v, label: x.label }))} value={picked[i]} onChange={(v) => setPicked((p) => p.map((x, j) => (j === i ? v : x)))} label={o.key} />
          </div>
        ))}
      </div>

      {run ? <SqlPanel code={run.sql} file="query.sql" marks={marksOf(run.sql, hot)} /> : <Narration>no capture for {key}.</Narration>}

      <div className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="overflow-x-auto">
          <div ref={wrap} className="relative min-w-max" style={{ paddingLeft: GUT }}>
            {bracket}
            {arrow}
            <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
              <caption className="sr-only">the rows of the window, with the frame of the current row marked</caption>
              <thead>
                <tr>
                  {columns.map((c, j) => (
                    <th key={c.name} scope="col" className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap text-hi ${displayCell("0", types[j] || "text").align === "right" ? "text-right" : "text-left"}`}>
                      {c.name}
                    </th>
                  ))}
                  {outCols.map((c, j) => (
                    <th key={c.name} scope="col" className={`border-b border-l border-line-2 px-3 pt-2 pb-1.5 font-normal whitespace-nowrap text-hi ${displayCell("0", otypes[j] || "text").align === "right" ? "text-right" : "text-left"}`}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isCur = i === cur;
                  const feeds = inSrc.has(i);
                  const ex = excluded.includes(i);
                  const newGroup = i > 0 && pj >= 0 && peerOf(i) !== peerOf(i - 1);
                  const bg = feeds ? tint(draw === "arrow" ? "ref" : "live", 12) : undefined;
                  return (
                    <tr
                      key={i}
                      ref={(el) => {
                        trs.current[i] = el;
                      }}
                      onClick={() => s.go(i)}
                      className="cursor-pointer transition-[background-color,box-shadow,opacity] duration-200 ease-sfe"
                      style={{
                        background: bg,
                        boxShadow: isCur ? ring("hot", undefined, 1.5) : undefined,
                        outline: ex ? "1px dashed var(--faint)" : undefined,
                        outlineOffset: ex ? -2 : undefined,
                      }}
                      aria-current={isCur ? "true" : undefined}
                    >
                      {r.map((v, j) => {
                        const d = displayCell(v, types[j] || "text", { maxChars: 32 });
                        return (
                          <td
                            key={j}
                            className={`px-3 py-[4px] whitespace-nowrap tabular ${d.align === "right" ? "text-right" : "text-left"}`}
                            style={{
                              borderTop: i === 0 ? undefined : `1px solid var(${newGroup ? "--line-2" : "--line"})`,
                              color: isCur && j === 0 ? "var(--hot)" : ex || d.isNull ? "var(--faint)" : "var(--ink)",
                              fontStyle: d.isNull ? "italic" : undefined,
                            }}
                          >
                            {d.text}
                          </td>
                        );
                      })}
                      {(run?.out[i] ?? outCols.map(() => null)).map((v, j) => {
                        const d = displayCell(v, otypes[j] || "text", { maxChars: 32 });
                        return (
                          <td
                            key={`o${j}`}
                            className={`border-l border-line-2 px-3 py-[4px] whitespace-nowrap tabular ${d.align === "right" ? "text-right" : "text-left"}`}
                            style={{
                              borderTop: i === 0 ? undefined : `1px solid var(${newGroup ? "--line-2" : "--line"})`,
                              color: isCur ? "var(--hot)" : d.isNull ? "var(--faint)" : "var(--ink)",
                              fontStyle: d.isNull ? "italic" : undefined,
                              background: isCur ? tint("hot", 10) : undefined,
                            }}
                          >
                            {d.text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-3 py-1.5 text-11 text-faint tabular">
          <span>({rows.length} rows in, {rows.length} rows out)</span>
          <Legend items={legend} />
        </div>
      </div>

      <Narration minLines={3}>
        <span className="font-mono text-11 text-hot not-italic">{what}</span> {run?.note}
      </Narration>
      <StepControls s={s} label={rowLabel} compact={reduce} />
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
