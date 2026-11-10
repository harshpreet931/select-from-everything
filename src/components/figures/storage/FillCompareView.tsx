"use client";

import { useState } from "react";
import { HeapBars } from "@/components/db/HeapFile";
import { Legend, Narration, Provenance, Row, Words, fmt } from "@/components/figures/kit";
import type { HeapFileView } from "@/lib/db/views";

// two tables side by side, page by page, at a few moments. same rows, different fillfactor.

export type FillMoment = { label: string; note?: string; tables: { name: string; caption: string; pages: HeapFileView["pages"] }[] };

export function FillCompareView({ moments, source }: { moments: FillMoment[]; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const [k, setK] = useState(moments.length - 1);
  const m = moments[k];
  const max = Math.max(...moments.flatMap((x) => x.tables.map((t) => t.pages.length)));
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="moment =" w="9ch" last>
        <Words label="which moment" options={moments.map((x, i) => ({ v: i, label: x.label }))} value={k} onChange={setK} />
      </Row>
      <div className="grid min-w-0 gap-5 grid-cols-[minmax(0,1fr)] @min-[600px]:grid-cols-2">
        {m.tables.map((t) => {
          const live = t.pages.reduce((a, p) => a + p.used, 0);
          const dead = t.pages.reduce((a, p) => a + p.dead, 0);
          return (
            <div key={t.name} className="min-w-0">
              <div className="mb-2 text-hi">
                {t.name} <span className="text-faint">· {t.caption}</span>
              </div>
              <HeapBars view={{ rel: t.name, pages: t.pages }} maxPages={max} />
              <div className="mt-2 flex flex-wrap gap-x-4 text-11 text-mute tabular">
                <span>
                  <span className="text-hi">{t.pages.length} pages</span>
                </span>
                <span>
                  live <span className="text-live">{fmt(live)} B</span>
                </span>
                <span>
                  dead <span className="text-dead">{fmt(dead)} B</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <Narration minLines={2}>{m.note}</Narration>
      <Legend
        items={[
          ["live", "live tuples"],
          ["dead", "old versions", "ghost"],
          ["mute", "free space", "dashed"],
          ["meta", "page header and line pointers"],
        ]}
      />
      <Provenance trace={source} />
    </div>
  );
}
