"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Stat, Words, fmt, ring, tint } from "@/components/figures/kit";
import { Sql } from "@/components/figures/kit/SqlPanel";

// the leaf level of an index on (a, b), in index order, wrapped so that each value of a is one
// row: read it like a book, left to right, then the next line. the two shades are leaf pages
// (a meta tick where a new one starts). pick a query: the entries it returns are hot. the strip
// under the grid is the same leaf level as one line of pages. with `hops`, a ref marker sits on
// each entry an index search landed on (one per value of a that has a match).

export type GridQuery = {
  label: string;
  sql: string;
  note?: string;
  matches: [number, number][];
  op: string;
  cond: string;
  searches: number;
  pages: number;
};

type Pg = { n: number; blk: number; keys: [number, number][] };

export function LeafGridView({ pages, queries, hops, source }: { pages: Pg[]; queries: GridQuery[]; hops?: boolean; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [pick, setPick] = useState(queries[0].label);
  const q = queries.find((x) => x.label === pick) ?? queries[0];
  const hit = new Set(q.matches.map(([a, b]) => `${a},${b}`));
  const entries = pages.flatMap((p) => p.keys.map(([a, b], i) => ({ a, b, page: p.n, starts: i === 0 && p.n > 1 })));
  const as = [...new Set(entries.map((e) => e.a))];
  const width = Math.max(...as.map((a) => entries.filter((e) => e.a === a).length));
  // the first match in each row: where a search lands when the scan hops
  const landing = new Set(as.map((a) => q.matches.find(([x]) => x === a)).filter(Boolean).map((m) => `${m![0]},${m![1]}`));
  const pagesHit = new Set(entries.filter((e) => hit.has(`${e.a},${e.b}`)).map((e) => e.page));
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="the leaf level of a two-column index, and the entries a query needs">
      <Row k="WHERE" w="6ch" last>
        <Words label="query" options={queries.map((x) => x.label)} value={q.label} onChange={setPick} />
      </Row>
      <div className="grid min-w-0 gap-[3px]" role="img" aria-label={`${entries.length} index entries in ${pages.length} leaf pages; ${q.matches.length} match ${q.label}`}>
        <div className="grid grid-cols-[5.5ch_minmax(0,1fr)] items-end gap-2">
          <span className="text-[10px] text-faint">b =</span>
          <div className="grid text-[10px] text-faint tabular" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
            {Array.from({ length: width }, (_, i) => (
              <span key={i} className="overflow-visible text-center whitespace-nowrap">
                {i === 0 || (i + 1) % 10 === 0 ? i + 1 : ""}
              </span>
            ))}
          </div>
        </div>
        {as.map((a) => {
          const row = entries.filter((e) => e.a === a);
          return (
            <div key={a} className="grid grid-cols-[5.5ch_minmax(0,1fr)] items-center gap-2">
              <span className="text-11 text-mute tabular">a = {a}</span>
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
                {row.map((e) => {
                  const on = hit.has(`${e.a},${e.b}`);
                  const land = hops && landing.has(`${e.a},${e.b}`);
                  return (
                    <span
                      key={e.b}
                      title={`(${e.a}, ${e.b}) · leaf page ${e.page}`}
                      className="relative aspect-square rounded-[2px] transition-[background-color,box-shadow] duration-200 ease-sfe"
                      style={{
                        background: on ? "var(--hot)" : e.page % 2 ? "var(--well-2)" : tint("meta", 9),
                        boxShadow: land ? ring("ref", undefined, 2) : e.starts ? "inset 2px 0 0 var(--meta)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1">
        <div className="text-11 text-faint">the same leaf level as one line of pages</div>
        <div className="flex gap-[3px]">
          {pages.map((p) => (
            <span
              key={p.n}
              className="flex h-6 min-w-0 items-center justify-center rounded-[3px] text-[10px] tabular"
              style={{
                flexGrow: p.keys.length,
                flexBasis: 0,
                background: pagesHit.has(p.n) ? tint("hot", 16) : p.n % 2 ? "var(--well-2)" : tint("meta", 9),
                boxShadow: pagesHit.has(p.n) ? ring("hot", 70) : ring("line-2"),
                color: pagesHit.has(p.n) ? "var(--hi)" : "var(--faint)",
              }}
            >
              {p.n}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Sql code={q.sql} className="text-12" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Stat k="rows" v={fmt(q.matches.length)} />
        <Stat k="leaf pages with a match" v={fmt(pagesHit.size)} />
        <Stat k="Index Searches" v={fmt(q.searches)} tone={q.searches > 1 ? "ref" : undefined} />
        <Stat k="pages read (Buffers)" v={fmt(q.pages)} />
      </div>
      <div className="text-11 break-words text-mute">
        {q.op} · Index Cond: {q.cond}
      </div>
      <Narration minLines={2}>{q.note}</Narration>
      <Legend
        items={[
          ["hot", "entries the query returns"],
          ["meta", "start of a new leaf page", "line"],
          ...(hops ? ([["ref", "where an index search landed"]] as ["ref", string][]) : []),
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
