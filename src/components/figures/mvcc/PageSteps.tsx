"use client";

import { useState } from "react";
import { Narration, Row, Words } from "@/components/figures/kit";
import { PageView } from "@/components/db/PageView";
import type { PgTrace } from "@/lib/db/pgtrace";
import type { Page } from "@/lib/db/views";
import { engineText } from "./source";

// one heap page from a capture, at a few chosen steps, with a switch between them
// ("before | after the UPDATE"). the slots that changed since the previous pick are hot,
// and the tuple card stays on the slot you picked, so you can watch one tuple's header
// change. every number is the capture's.
//
//   <PageSteps trace={trace} rel="accounts" labels={["before", "after the UPDATE"]} focus={1} />

/** line pointers whose tuple changed between two captures of the same page */
function changed(a: Page | undefined, b: Page): number[] {
  if (!a) return [];
  const sig = (p: Page, lp: number) => JSON.stringify(p.tuples.find((t) => t.lp === lp) ?? null);
  return b.tuples.filter((t) => sig(a, t.lp) !== sig(b, t.lp)).map((t) => t.lp);
}

export function PageSteps({
  trace,
  rel,
  labels,
  steps,
  focus = 1,
  fields,
  start,
}: {
  trace: PgTrace;
  rel: string;
  /** one label per shown step */
  labels: string[];
  /** which trace steps to show (default: the first labels.length) */
  steps?: number[];
  focus?: number;
  fields?: string[];
  /** the label shown first (default: the last one) */
  start?: string;
}) {
  const idx = steps ?? labels.map((_, i) => i);
  const [pick, setPick] = useState(start ?? labels[labels.length - 1]);
  const k = Math.max(0, labels.indexOf(pick));
  const st = trace.steps[idx[k]];
  const page = st?.heap?.[rel]?.[0];
  const prev = k > 0 ? trace.steps[idx[k - 1]]?.heap?.[rel]?.[0] : undefined;
  if (!page) return null;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="the page =" w="11ch" last>
        <Words label="which moment" options={labels} value={pick} onChange={setPick} />
      </Row>
      <PageView
        key={k}
        page={page}
        xact={st.xact}
        layout="auto"
        focus={focus}
        hot={changed(prev, page)}
        fields={fields}
        provenance={engineText(trace)}
      />
      <Narration minLines={2}>{st.note}</Narration>
    </div>
  );
}
