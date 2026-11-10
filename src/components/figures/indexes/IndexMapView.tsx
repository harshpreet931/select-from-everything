"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, ring, tint, useWidth } from "@/components/figures/kit";

// the back-of-the-book picture with real data: on one side the index, its keys in sorted order,
// each with the address of its row; on the other the table, in the order it's stored (by ctid).
// ref lines join each entry to its row. pick an entry (hover, focus or tap) and its line and its
// row go hot. an entry with a posting list (equal keys, deduplicated) has a line per address.

export type MapEntry = { key: string; tids: string[] };
export type MapRow = { ctid: string; cells: (string | null)[] };

const GAP = 4;

export function IndexMapView({ entries, rows, columns, index, source }: { entries: MapEntry[]; rows: MapRow[]; columns: string[]; index: string; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [on, setOn] = useState<number | null>(null);
  const [mid, w] = useWidth<HTMLDivElement>(120);
  const [box, full] = useWidth<HTMLDivElement>(700);
  // on a phone each side stacks its two parts (key over address, address over name)
  const narrow = full < 520;
  const ROW = narrow ? 40 : 26;
  const at = new Map(rows.map((r, i) => [r.ctid, i]));
  const y = (i: number) => i * (ROW + GAP) + ROW / 2;
  const H = Math.max(entries.length, rows.length) * (ROW + GAP) - GAP;
  const hotRows = new Set(on === null ? [] : entries[on].tids.map((t) => at.get(t)));
  const pick = on === null ? null : entries[on];
  return (
    <div ref={box} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label={`the index ${index} next to its table, each entry joined to its row`}>
      <div className={`grid gap-0 ${narrow ? "grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_minmax(28px,110px)_minmax(0,1.15fr)]"}`}>
        <div className="mb-1.5 text-11 text-faint">index {index}, in key order</div>
        <div />
        <div className="mb-1.5 text-11 text-faint">table, in storage order</div>
        <ul className="grid min-w-0" style={{ gap: GAP }} aria-label="index entries">
          {entries.map((e, i) => (
            <li key={i} className="min-w-0">
              <button
                type="button"
                onMouseEnter={() => setOn(i)}
                onFocus={() => setOn(i)}
                onClick={() => setOn(on === i ? null : i)}
                className={`flex w-full min-w-0 rounded-[3px] px-2 text-left ${narrow ? "flex-col items-start justify-center" : "items-center justify-between gap-2"}`}
                style={{ height: ROW, background: on === i ? tint("hot", 14) : "var(--bg)", boxShadow: on === i ? ring("hot", 70) : ring("line-2") }}
              >
                <span className="max-w-full truncate text-hi">{e.key}</span>
                <span className="shrink-0 text-11 text-ref tabular">{e.tids.join(" ")}</span>
              </button>
            </li>
          ))}
        </ul>
        <div ref={mid} className="relative min-w-0" aria-hidden>
          <svg width={w} height={H} className="absolute inset-0 overflow-visible">
            {entries.flatMap((e, i) =>
              e.tids.map((t) => {
                const j = at.get(t);
                if (j === undefined) return null;
                const lit = on === i;
                return (
                  <path
                    key={`${i}-${t}`}
                    d={`M0 ${y(i)} C${w * 0.5} ${y(i)}, ${w * 0.5} ${y(j)}, ${w} ${y(j)}`}
                    fill="none"
                    stroke={lit ? "var(--hot)" : "var(--ref)"}
                    strokeWidth={lit ? 1.8 : 1}
                    opacity={on === null ? 0.6 : lit ? 1 : 0.18}
                  />
                );
              }),
            )}
          </svg>
        </div>
        <ul className="grid min-w-0" style={{ gap: GAP }} aria-label="table rows">
          {rows.map((r, j) => (
            <li
              key={r.ctid}
              className={`flex min-w-0 rounded-[3px] px-2 ${narrow ? "flex-col items-start justify-center" : "items-center gap-2"}`}
              style={{ height: ROW, background: hotRows.has(j) ? tint("hot", 14) : "var(--well-2)", boxShadow: hotRows.has(j) ? ring("hot", 70) : undefined }}
            >
              <span className="shrink-0 text-11 text-ref tabular">{r.ctid}</span>
              <span className="flex min-w-0 max-w-full gap-2">
                {r.cells.map((c, k) => (
                  <span key={k} className={`truncate ${k === 0 ? "shrink-0 text-mute tabular" : "text-ink"}`}>
                    {c === null ? <span className="text-faint italic">null</span> : c}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Narration minLines={2}>
        {pick
          ? pick.tids.length > 1
            ? `"${pick.key}" is one entry with ${pick.tids.length} addresses: ${pick.tids.length} rows share this key, and the index stores it once, followed by every address (a posting list).`
            : `"${pick.key}" points at ${pick.tids[0]}: page ${pick.tids[0].slice(1).split(",")[0]}, slot ${pick.tids[0].slice(0, -1).split(",")[1]} of the table.`
          : `${entries.length} entries for ${rows.length} rows. pick an entry to follow its address.`}
      </Narration>
      <Legend
        items={[
          ["ref", "an address (ctid): page, slot", "line"],
          ["hot", "the entry you picked, and its row"],
        ]}
      />
      <Provenance trace={source} />
      <span className="sr-only">{columns.join(", ")}</span>
    </div>
  );
}
