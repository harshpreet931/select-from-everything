"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Stat, Words, fmt, ring, tint } from "@/components/figures/kit";

// the same rows stored two ways. "row store" draws each row the way the postgres heap keeps it:
// a 23-byte tuple header (padded to 24 here), then every column, one tuple after another, with a
// 4-byte line pointer each; the tuple sizes are real lp_len values from pageinspect. "column store"
// draws one strip per column. pick a query and the bytes it has to touch light up: SUM(qty) reads
// every byte of every tuple in the row store, and only the qty strip in the column store.

type Col = { name: string; bytes: number | null };

export function RowVsColumn({
  columns,
  rows,
  lpLen,
  sumCol,
  provenance,
}: {
  columns: Col[];
  rows: string[][];
  /** each row's real tuple length on the heap page */
  lpLen: number[];
  /** index into columns of the column SUM() reads */
  sumCol: number;
  provenance: string;
}) {
  const [layout, setLayout] = useState<"row" | "col">("row");
  const [q, setQ] = useState<"sum" | "star">("sum");
  const read = (c: number) => q === "star" || c === sumCol;
  const n = rows.length;
  const rowBytes = lpLen.reduce((a, b) => a + b, 0) + 4 * n;
  const valBytes = (c: number) => (columns[c].bytes ?? 0) * n;
  const colBytes = q === "star" ? columns.reduce((a, _, c) => a + valBytes(c), 0) : valBytes(sumCol);
  const touched = layout === "row" ? rowBytes : colBytes;
  const varNote = columns.some((c) => c.bytes == null);

  const cell = (on: boolean, hot: boolean) => ({
    background: on ? tint("hot", hot ? 26 : 12) : "var(--well-2)",
    boxShadow: on ? ring("hot", 55) : ring("line-2"),
    opacity: on ? 1 : 0.55,
  });

  return (
    <div className="@container grid min-w-0 gap-3 font-mono text-11">
      <div>
        <Row k="stored">
          <Words
            label="layout"
            value={layout}
            onChange={setLayout}
            options={[
              { v: "row", label: "row by row (heap)" },
              { v: "col", label: "column by column" },
            ]}
          />
        </Row>
        <Row k="query" last>
          <Words
            label="query"
            value={q}
            onChange={setQ}
            options={[
              { v: "sum", label: `SUM(${columns[sumCol].name})` },
              { v: "star", label: "SELECT *" },
            ]}
          />
        </Row>
      </div>

      <div className="w-0 min-w-full overflow-x-auto">
        {layout === "row" ? (
          <div className="grid min-w-[420px] gap-1" role="img" aria-label={`${n} tuples stored one after another, each with a header and all ${columns.length} columns`}>
            {rows.map((r, i) => (
              <div key={i} className="flex gap-[3px]">
                <span className="w-[3.2ch] shrink-0 self-center text-right text-faint">{i + 1}</span>
                <span className="flex w-[5.5ch] shrink-0 items-center justify-center rounded-[3px] py-1 text-meta" style={{ background: tint("meta", 12), boxShadow: ring("meta", 40), opacity: 1 }} title="tuple header">
                  hdr
                </span>
                {r.map((v, c) => (
                  <span key={c} className="flex min-w-0 flex-1 items-center justify-center truncate rounded-[3px] px-1 py-1 text-hi" style={{ ...cell(true, read(c)), opacity: 1 }} title={columns[c].name}>
                    {v}
                  </span>
                ))}
                <span className="w-[6.5ch] shrink-0 self-center text-right text-faint">{lpLen[i]} B</span>
              </div>
            ))}
            <div className="flex gap-[3px] text-faint">
              <span className="w-[3.2ch] shrink-0" />
              <span className="w-[5.5ch] shrink-0 text-center">23 B</span>
              {columns.map((c) => (
                <span key={c.name} className="min-w-0 flex-1 truncate text-center">
                  {c.name}
                </span>
              ))}
              <span className="w-[6.5ch] shrink-0 text-right">lp_len</span>
            </div>
          </div>
        ) : (
          <div className="grid min-w-[420px] gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} role="img" aria-label={`${columns.length} column strips of ${n} values each`}>
            {columns.map((c, ci) => (
              <div key={c.name} className="grid content-start gap-[3px]">
                <span className="truncate text-center text-faint">{c.name}</span>
                {rows.map((r, i) => (
                  <span key={i} className="flex items-center justify-center truncate rounded-[3px] px-1 py-1 text-hi" style={cell(read(ci), read(ci) && q === "sum")}>
                    {r[ci]}
                  </span>
                ))}
                <span className="text-center text-faint">{c.bytes == null ? "var" : `${c.bytes} B each`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 @min-[520px]:grid-cols-3">
        <Stat k="bytes this query touches" v={`${fmt(touched)} B`} tone="hot" />
        <Stat k={layout === "row" ? "of which the answer needs" : "row store, same query"} v={layout === "row" ? `${fmt(q === "sum" ? valBytes(sumCol) : rowBytes)} B` : `${fmt(rowBytes)} B`} />
        <Stat k="rows" v={n} />
      </div>

      <Narration minLines={3}>
        {layout === "row"
          ? q === "sum"
            ? `the heap keeps whole rows together, so summing one 4-byte column still drags every tuple through memory: headers, all ${columns.length} columns, and a line pointer each. ${fmt(rowBytes)} bytes touched for ${fmt(valBytes(sumCol))} bytes of answer.`
            : "for SELECT * the row layout is the right one: each row is one contiguous run of bytes, found with one line pointer."
          : q === "sum"
            ? `one strip, ${n} values, nothing else: ${fmt(colBytes)} bytes. no headers, because visibility lives elsewhere, and the strip is all one type, which is what makes it compress.`
            : `SELECT * has to visit every strip and stitch row i back together from each one. that's the column store's bad case.${varNote ? " (numeric is variable-length, so its strip isn't counted.)" : ""}`}
      </Narration>
      <Legend
        items={[
          ["meta", "tuple header"],
          ["hot", "bytes the query reads"],
          ["mute", "bytes it skips", "ghost"],
        ]}
      />
      <Provenance recorded={provenance} />
    </div>
  );
}
