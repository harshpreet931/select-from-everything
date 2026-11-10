"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Stat, fmt, useReducedMotion } from "@/components/figures/kit";
import { PageDiagram, SlotList, TupleCard } from "@/components/db/PageView";
import { StepSql } from "@/components/db/StepSql";
import type { Page, XactStatus } from "@/lib/db/views";

// one heap page through a few statements, captured: the 8 KB strip on top (header, line
// pointers growing right, free space, tuples packed back from the end), the slots under it,
// and the header of the tuple you pick. what changed since the previous step is hot.

export type FillStep = { session: string; sql: string; note?: string; page: Page | null; xact: Record<number, XactStatus>; horizon?: number };

const sig = (p: Page | null, lp: number) => JSON.stringify(p?.tuples.find((t) => t.lp === lp) ?? null);

export function PageFillStepper({ steps, source, start = 0 }: { steps: FillStep[]; source: { engine: { version: string; build?: string }; scenario: string }; start?: number }) {
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 2200, start });
  const [focus, setFocus] = useState<number | undefined>(1);
  const st = steps[s.i];
  const prev = s.i > 0 ? steps[s.i - 1].page : null;
  const page = st.page;
  const hot = page ? page.tuples.filter((t) => sig(prev, t.lp) !== sig(page, t.lp)).map((t) => t.lp) : [];
  const t = page?.tuples.find((x) => x.lp === focus) ?? page?.tuples[0];
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="a heap page, one statement at a time">
      <StepSql label={`${st.session}: ${st.sql}`} />
      {page ? (
        <>
          <PageDiagram page={page} xact={st.xact} horizon={st.horizon} focus={t?.lp} hot={hot} onFocus={setFocus} layout="auto" />
          <div className="grid grid-cols-2 gap-3 @min-[520px]:grid-cols-4">
            <Stat k="pd_lower" v={page.lower} tone="ref" />
            <Stat k="pd_upper" v={fmt(page.upper)} />
            <Stat k="free between them" v={`${fmt(page.upper - page.lower)} B`} />
            <Stat k="line pointers" v={page.tuples.length} tone="ref" />
          </div>
          <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
            <SlotList page={page} xact={st.xact} horizon={st.horizon} focus={t?.lp} hot={hot} onFocus={setFocus} fields={["id", "note"]} />
            <div className="min-h-[12rem] rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-live="polite">
              {t ? <TupleCard page={page} t={t} xact={st.xact} /> : <span className="text-faint">pick a line pointer.</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="grid min-h-[9rem] place-items-center rounded-md text-12 text-faint italic" style={{ outline: "1px dashed var(--line-2)", outlineOffset: -1 }}>
          no pages yet: the table&apos;s file is 0 bytes
        </div>
      )}
      <Narration minLines={3}>{st.note}</Narration>
      <Legend
        items={[
          ["meta", "page header"],
          ["ref", "line pointer → tuple", "line"],
          ["mute", "free space, unused slot", "dashed"],
          ["hot", "changed in this step"],
          ["dead", "deleted, waiting for vacuum", "ghost"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <Provenance trace={source} />
    </div>
  );
}
