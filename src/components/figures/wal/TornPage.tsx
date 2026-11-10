"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Row, Words, useReducedMotion } from "@/components/figures/kit";
import { useState } from "react";

// the textbook torn page: an 8 KB page written as two 4 KB halves (the filesystem's or the
// disk's unit), a crash between them, and what redo can do with the result, with and without
// a full-page image in the WAL. drawn by hand: the sizes are postgres's (BLCKSZ 8192) and a
// common 4 KB sector/page size; the timing of the crash is the thought experiment.

type Half = "old" | "new" | "writing" | "image";
type Frame = { mem: [Half, Half]; disk: [Half, Half]; wal: string[]; note: string; verdict?: "ok" | "bad" };

const FRAMES: Record<"off" | "on", Frame[]> = {
  on: [
    { mem: ["old", "old"], disk: ["old", "old"], wal: ["checkpoint"], note: "after a checkpoint, the page in memory and the page on disk are the same." },
    { mem: ["new", "new"], disk: ["old", "old"], wal: ["checkpoint", "update + page image"], note: "the first change since the checkpoint. the WAL record carries a full copy of the page as it was before the change, plus the change." },
    { mem: ["new", "new"], disk: ["writing", "old"], wal: ["checkpoint", "update + page image"], note: "later, the page is written out. the disk takes 8 KB as two 4 KB pieces, and the first one lands." },
    { mem: ["new", "new"], disk: ["new", "old"], wal: ["checkpoint", "update + page image"], note: "crash before the second piece. the file now holds half a new page and half an old one: a torn page. no checksum or LSN in it can be trusted." },
    { mem: ["new", "new"], disk: ["image", "image"], wal: ["checkpoint", "update + page image"], note: "redo reaches the record, sees the image, and overwrites the whole page with it, never reading the torn one. then it applies the change. the page is whole again.", verdict: "ok" },
  ],
  off: [
    { mem: ["old", "old"], disk: ["old", "old"], wal: ["checkpoint"], note: "after a checkpoint, the page in memory and the page on disk are the same." },
    { mem: ["new", "new"], disk: ["old", "old"], wal: ["checkpoint", "update"], note: "the first change since the checkpoint. with full_page_writes off, the record is just the change: put this tuple in slot 7." },
    { mem: ["new", "new"], disk: ["writing", "old"], wal: ["checkpoint", "update"], note: "later, the page is written out, as two 4 KB pieces. the first one lands." },
    { mem: ["new", "new"], disk: ["new", "old"], wal: ["checkpoint", "update"], note: "crash before the second piece. a torn page: its header says one thing, its line pointers and tuples another." },
    { mem: ["new", "new"], disk: ["new", "old"], wal: ["checkpoint", "update"], note: "redo reads the torn page and tries to apply 'put this tuple in slot 7' to it. the change assumes a page that no longer exists. at best the checksum fails; at worst the page is silently wrong.", verdict: "bad" },
  ],
};

const FILL: Record<Half, { bg: string; label: string; dash?: boolean }> = {
  old: { bg: "var(--well-2)", label: "old" },
  new: { bg: "color-mix(in srgb, var(--accent) 22%, transparent)", label: "new" },
  writing: { bg: "color-mix(in srgb, var(--hot) 22%, transparent)", label: "new" },
  image: { bg: "color-mix(in srgb, var(--live) 20%, transparent)", label: "from image" },
};

function PageBox({ title, halves, bad }: { title: string; halves: [Half, Half]; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-11 text-faint">{title}</div>
      <div className="grid grid-cols-2 overflow-hidden rounded-md" style={{ boxShadow: `inset 0 0 0 1px var(--${bad ? "dead" : "line-2"})` }}>
        {halves.map((h, i) => (
          <div key={i} className="flex h-14 flex-col items-center justify-center gap-0.5 text-11 transition-colors duration-200 ease-sfe" style={{ background: FILL[h].bg, borderLeft: i ? "1px dashed var(--line-2)" : undefined }}>
            <span className={h === "writing" ? "text-hot" : bad && h !== "image" ? "text-dead" : "text-ink"}>{FILL[h].label}</span>
            <span className="text-[10px] text-faint">4 KB</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Run({ frames }: { frames: Frame[] }) {
  const reduce = useReducedMotion();
  const s = useStepper(frames.length, { interval: 1800 });
  const f = frames[s.i];
  const torn = f.disk[0] !== f.disk[1] && f.disk[0] !== "writing";
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]">
      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] @min-[560px]:grid-cols-3">
        <PageBox title="page in shared buffers" halves={f.mem} />
        <PageBox title="page in the file" halves={f.disk} bad={torn || f.verdict === "bad"} />
        <div className="min-w-0">
          <div className="mb-1 text-11 text-faint">WAL on disk</div>
          <div className="flex flex-wrap gap-1.5">
            {f.wal.map((w) => (
              <span key={w} className="rounded-xs bg-bg px-1.5 py-1 text-11 shadow-[inset_0_0_0_1px_var(--line-2)]">
                <span className={w.includes("image") ? "text-live" : w === "checkpoint" ? "text-meta" : "text-ink"}>{w}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <Narration minLines={3} tag={f.verdict === "ok" ? "recovered" : f.verdict === "bad" ? "broken" : undefined}>
        {f.note}
      </Narration>
      <Legend items={[["accent", "changed, not yet on disk"], ["hot", "being written"], ["live", "restored from the image"], ["dead", "torn"]]} />
      <StepControls s={s} compact={reduce} />
    </div>
  );
}

export function TornPage() {
  const [fpw, setFpw] = useState<"on" | "off">("on");
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]" aria-label="a torn page, with and without a full-page image">
      <Row k="full_page_writes =" w="18ch" last>
        <Words label="full_page_writes" options={["on", "off"] as const} value={fpw} onChange={setFpw} />
      </Row>
      <Run key={fpw} frames={FRAMES[fpw]} />
      <Provenance drawn="the textbook case: an 8 KB postgres page on a device that writes 4 KB at a time" />
    </div>
  );
}
