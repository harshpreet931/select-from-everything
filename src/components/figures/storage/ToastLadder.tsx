"use client";

import { useState } from "react";
import { Legend, Provenance, Row, Stat, Words, fmt, ring } from "@/components/figures/kit";

// one text value, growing: where does it end up? each size is a real row from the capture
// (octet_length, pg_column_size, pg_column_compression, the tuple's lp_len, and how many rows
// it took in the toast table). the page strip is the 8 KB heap page with that one tuple to
// scale; the strip under it is the toast table's chunks.
//
//   <ToastLadder rows={[{ kind, bytes, stored, method, tuple, chunks }]} source={...} />

export type ToastRow = { kind: string; bytes: number; stored: number; method: string | null; tuple: number; chunks: number };

const PAGE = 8192;

function verdict(r: ToastRow): { short: string; long: string } {
  if (r.chunks > 0 && r.method)
    return { short: "compressed, then out of line", long: `compressed with ${r.method} to ${fmt(r.stored)} bytes, still too big, so it went to the toast table in ${fmt(r.chunks)} chunks. the row keeps an 18-byte pointer.` };
  if (r.chunks > 0)
    return { short: "out of line, uncompressed", long: `pglz couldn't make it smaller, so it went to the toast table as is, in ${fmt(r.chunks)} chunks. the row keeps an 18-byte pointer.` };
  if (r.method) return { short: "compressed, in the row", long: `too wide for comfort, so it was compressed with ${r.method}: ${fmt(r.bytes)} bytes became ${fmt(r.stored)}, small enough to stay in the row.` };
  return { short: "in the row, as is", long: `small enough to stay in the row untouched. no compression, no toast table.` };
}

export function ToastLadder({ rows, source }: { rows: ToastRow[]; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const [kind, setKind] = useState(kinds.includes("repetitive") ? "repetitive" : kinds[0]);
  const list = rows.filter((r) => r.kind === kind);
  const [i, setI] = useState(Math.min(3, list.length - 1));
  const r = list[Math.min(i, list.length - 1)];
  const v = verdict(r);
  const shown = Math.min(r.chunks, 40);
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="value =" w="9ch">
          <Words
            label="what the value looks like"
            options={kinds.map((k) => ({ v: k, label: k === "repetitive" ? "repetitive ('aaaa…')" : "random (md5 hex)" }))}
            value={kind}
            onChange={setKind}
          />
        </Row>
        <Row k="size =" w="9ch" last>
          <Words label="value size" options={list.map((x, j) => ({ v: j, label: `${fmt(x.bytes)} B` }))} value={Math.min(i, list.length - 1)} onChange={setI} />
        </Row>
      </div>
      <div aria-live="polite">
        <div className="mb-1 text-hi">{v.short}</div>
        <p className="font-serif text-[1.0625rem] leading-[1.6] text-ink">{v.long}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-faint">
          <span>the heap page, 8 KB</span>
          <span>tuple {fmt(r.tuple)} B</span>
        </div>
        <div className="relative h-5 overflow-hidden rounded-[3px]" style={{ boxShadow: ring("line-2") }} role="img" aria-label={`the tuple takes ${r.tuple} of the page's 8192 bytes`}>
          <span className="absolute inset-y-0 left-0" style={{ width: `${(24 / PAGE) * 100}%`, background: "var(--meta)" }} />
          <span
            className="absolute inset-y-0 right-0 transition-[width] duration-300 ease-sfe"
            style={{ width: `${Math.max(0.6, (r.tuple / PAGE) * 100)}%`, background: "var(--well-2)", boxShadow: ring("ink", 60) }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-faint">
          <span>the toast table</span>
          <span>{r.chunks ? `${fmt(r.chunks)} chunk${r.chunks > 1 ? "s" : ""}, up to 1,996 B each` : "nothing here"}</span>
        </div>
        <div className="flex min-h-5 flex-wrap gap-[3px]" role="img" aria-label={`${r.chunks} chunks in the toast table`}>
          {r.chunks === 0 && <span className="h-5 w-full rounded-[3px]" style={{ outline: "1px dashed var(--line-2)", outlineOffset: -1 }} />}
          {Array.from({ length: shown }, (_, k) => (
            <span key={k} className="h-5 w-4 rounded-[2px]" style={{ background: "var(--well-2)", boxShadow: ring("ink", 45) }} />
          ))}
          {r.chunks > shown && <span className="self-center pl-1 text-11 text-faint">+ {fmt(r.chunks - shown)} more</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 @min-[520px]:grid-cols-4">
        <Stat k="the value" v={`${fmt(r.bytes)} B`} />
        <Stat k="stored as" v={`${fmt(r.stored)} B`} />
        <Stat k="compression" v={r.method ?? "none"} />
        <Stat k="the row" v={`${fmt(r.tuple)} B`} />
      </div>
      <Legend
        items={[
          ["meta", "page header"],
          ["ink", "the tuple, the toast chunks"],
          ["mute", "nothing stored", "dashed"],
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
