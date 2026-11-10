"use client";

import { useState } from "react";
import { Legend, Provenance, Row, Stat, Words, ring, tint } from "@/components/figures/kit";

// one heap tuple, byte by byte, straight off the page: the 23-byte header, the null bitmap if
// there is one, the padding that rounds the header up to t_hoff, then each column at its
// alignment, with the padding in front of it. the bytes are the capture's; the split into
// fields follows the column types (typalign c = 1, s = 2, i = 4, d = 8).
//
//   <TupleBytes tuples={[...]} tables={{ loose: [["a", "bool"], ...] }} source={...} />

export type Col = [name: string, type: "bool" | "int2" | "int4" | "int8"];
export type RawTuple = { key: string; label: string; table: string; len: number; hoff: number; bits: string | null; hex: string };

const SIZE: Record<Col[1], number> = { bool: 1, int2: 2, int4: 4, int8: 8 };
type Seg = { label: string; bytes: string[]; kind: "header" | "bitmap" | "pad" | "data"; title: string };

const HEADER: [string, number, string][] = [
  ["t_xmin", 4, "the transaction that inserted it"],
  ["t_xmax", 4, "the transaction that deleted or locked it, 0 if none"],
  ["t_cid", 4, "command id inside the inserting transaction"],
  ["t_ctid", 6, "block (4 bytes) and slot (2 bytes): itself, or the newer version"],
  ["t_infomask2", 2, "number of columns, and HOT bits"],
  ["t_infomask", 2, "flags: has nulls, has varlena, commit hints"],
  ["t_hoff", 1, "where the data starts"],
];

function segments(t: RawTuple, cols: Col[]): Seg[] {
  const b = t.hex.match(/../g) ?? [];
  const out: Seg[] = [];
  let at = 0;
  for (const [label, n, title] of HEADER) {
    out.push({ label, bytes: b.slice(at, at + n), kind: "header", title });
    at += n;
  }
  if (t.bits) {
    const n = Math.ceil(cols.length / 8);
    out.push({ label: "nulls", bytes: b.slice(at, at + n), kind: "bitmap", title: `null bitmap: ${t.bits.slice(0, cols.length)} (1 = has a value)` });
    at += n;
  }
  if (t.hoff > at) {
    out.push({ label: `pad ${t.hoff - at}`, bytes: b.slice(at, t.hoff), kind: "pad", title: "the header is rounded up to a multiple of 8" });
    at = t.hoff;
  }
  cols.forEach(([name, type], i) => {
    if (t.bits && t.bits[i] === "0") return; // NULL: no bytes at all
    const n = SIZE[type];
    const aligned = Math.ceil(at / n) * n;
    if (aligned > at) {
      out.push({ label: `pad ${aligned - at}`, bytes: b.slice(at, aligned), kind: "pad", title: `${name} is ${type}, which must start at a multiple of ${n}` });
      at = aligned;
    }
    out.push({ label: name, bytes: b.slice(at, at + n), kind: "data", title: `${name} ${type}` });
    at += n;
  });
  return out;
}

const LOOK = {
  header: { box: ring("meta", 45), bg: tint("meta", 9), ink: "var(--meta)" },
  bitmap: { box: ring("meta", 90), bg: tint("meta", 20), ink: "var(--meta)" },
  pad: { box: undefined, bg: undefined, ink: "var(--faint)" },
  data: { box: ring("line-2"), bg: "var(--bg)", ink: "var(--hi)" },
};

export function TupleBytes({ tuples, tables, source }: { tuples: RawTuple[]; tables: Record<string, Col[]>; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const [key, setKey] = useState(tuples[0]?.key);
  const t = tuples.find((x) => x.key === key) ?? tuples[0];
  const segs = segments(t, tables[t.table]);
  const pad = segs.filter((s) => s.kind === "pad").reduce((a, s) => a + s.bytes.length, 0);
  const data = segs.filter((s) => s.kind === "data").reduce((a, s) => a + s.bytes.length, 0);
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="tuple =" w="8ch" last>
        <Words label="which tuple" options={tuples.map((x) => ({ v: x.key, label: x.label }))} value={t.key} onChange={setKey} />
      </Row>
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-3" role="img" aria-label={`${t.len} bytes: ${segs.map((s) => `${s.label} ${s.bytes.length}`).join(", ")}`}>
        {segs.map((s, i) => {
          const lk = LOOK[s.kind];
          return (
            <div key={i} className="flex flex-col items-center gap-1" title={s.title}>
              <div
                className="flex gap-[2px] rounded-[4px] px-[3px] py-[3px]"
                style={{ boxShadow: lk.box, background: lk.bg, outline: s.kind === "pad" ? "1px dashed var(--line-2)" : undefined, outlineOffset: -1 }}
              >
                {s.bytes.map((byte, j) => (
                  <span key={j} className="w-[2.2ch] text-center text-11 leading-[18px] tabular" style={{ color: s.kind === "data" && byte === "00" ? "var(--mute)" : lk.ink }}>
                    {byte}
                  </span>
                ))}
              </div>
              <span className="text-[10px] leading-3" style={{ color: s.kind === "data" ? "var(--ink)" : lk.ink }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 @min-[520px]:grid-cols-4">
        <Stat k="lp_len" v={`${t.len} B`} />
        <Stat k="header (t_hoff)" v={`${t.hoff} B`} tone="meta" />
        <Stat k="column data" v={`${data} B`} />
        <Stat k="padding" v={`${pad} B`} tone="mute" />
      </div>
      <Legend
        items={[
          ["meta", "tuple header, null bitmap"],
          ["ink", "column values"],
          ["mute", "alignment padding", "dashed"],
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
