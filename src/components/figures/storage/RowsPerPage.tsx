"use client";

import { useState } from "react";
import { Narration, Provenance, Slider, fmt, ring, tint } from "@/components/figures/kit";

// pick one row of the lab's notes table: the page it lives on lights up, and every other row on
// that page comes along, because the page is the smallest thing postgres reads. the page
// numbers and row ranges are the capture's (ctid of every row, grouped by page).

export type NotesPage = { page: number; rows: number; first: number; last: number };

export function RowsPerPage({ pages, source }: { pages: NotesPage[]; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const max = pages.at(-1)?.last ?? 1;
  const [id, setId] = useState(200);
  const p = pages.find((x) => id >= x.first && id <= x.last) ?? pages[0];
  const most = Math.max(...pages.map((x) => x.rows));
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-faint">WHERE id =</span>
        <Slider k="which note to read" min={1} max={max} value={id} onChange={setId} />
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }} role="img" aria-label={`note ${id} is on page ${p.page}, with ${p.rows - 1} other rows`}>
        {pages.map((x) => {
          const on = x.page === p.page;
          return (
            <div key={x.page} className="flex min-w-0 flex-col items-center gap-1">
              <div className="relative h-28 w-full overflow-hidden rounded-[4px]" style={{ boxShadow: on ? ring("hot", undefined, 1.5) : ring("line-2") }}>
                <span className="absolute inset-x-0 bottom-0 transition-[background-color] duration-200" style={{ height: `${(x.rows / most) * 92}%`, background: on ? tint("hot", 22) : "var(--well-2)" }} />
                {on && <span className="absolute inset-x-1 h-[3px] rounded-full" style={{ bottom: `${((id - x.first + 0.5) / most) * 92}%`, background: "var(--hot)" }} />}
              </div>
              <span className={`text-11 tabular ${on ? "text-hot" : "text-faint"}`}>page {x.page}</span>
              <span className="text-[10px] text-faint tabular">
                {x.first}–{x.last}
              </span>
            </div>
          );
        })}
      </div>
      <Narration minLines={2}>
        note {id} lives on page {p.page}. asking for it reads the whole 8 KB page, so {fmt(p.rows - 1)} other note{p.rows - 1 === 1 ? "" : "s"} (ids {p.first} to {p.last}) come along for free.
      </Narration>
      <Provenance trace={source} />
    </div>
  );
}
