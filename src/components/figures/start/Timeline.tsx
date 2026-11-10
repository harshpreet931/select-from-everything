"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Narration, Provenance, ring, tint } from "@/components/figures/kit";

// a row of dated events on a hairline. click one (or use ← →) to read its note.
// plain data props so mdx can pass it: { year, label, note }[]. sources go in `source`.

export type TimelineEvent = { year: string; label: string; note: string; here?: boolean };

export function Timeline({ events, start = 0, source }: { events: TimelineEvent[]; start?: number; source?: string }) {
  const [i, setI] = useState(start);
  const ev = events[i];
  const list = useRef<HTMLOListElement>(null);
  const moved = useRef(false);
  // keep the chosen event visible when the row scrolls (phones, or arrow keys past the edge).
  // only after the reader has moved: never scroll anything on first render.
  useEffect(() => {
    if (!moved.current) return;
    const el = list.current?.children[i + 1] as HTMLElement | undefined;
    const box = list.current?.parentElement;
    if (!el || !box) return;
    const l = el.offsetLeft - box.offsetLeft;
    if (l < box.scrollLeft || l + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: l - box.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [i]);
  const pick = (n: number) => {
    moved.current = true;
    setI(n);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      pick(Math.min(events.length - 1, i + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      pick(Math.max(0, i - 1));
    }
  };
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" tabIndex={0} onKeyDown={onKey} aria-label="a timeline. use the arrow keys to move between events">
      <div className="relative overflow-x-auto pb-1">
        <ol ref={list} className="relative flex w-full gap-1 pt-1" style={{ minWidth: `${events.length * 4.35}rem` }}>
          <span aria-hidden className="absolute top-[19px] right-0 left-0 h-px bg-line-2" />
          {events.map((e, k) => {
            const on = k === i;
            return (
              <li key={e.year + e.label} className="relative flex-1">
                <button
                  type="button"
                  onClick={() => pick(k)}
                  aria-current={on ? "step" : undefined}
                  className="flex w-full min-w-[4.1rem] flex-col items-center gap-1.5 rounded-xs px-1 pb-1.5 text-center transition-[background-color] duration-200 ease-sfe"
                  style={{ background: on ? tint("hot", 8) : undefined }}
                >
                  <span
                    aria-hidden
                    className="mt-[13px] block size-[11px] rounded-full transition-[background-color,box-shadow] duration-200 ease-sfe"
                    style={{ background: on ? "var(--hot)" : e.here ? "var(--ref)" : "var(--well)", boxShadow: on ? ring("hot") : e.here ? ring("ref") : ring("line-2") }}
                  />
                  <span className="text-12 tabular" style={{ color: on ? "var(--hot)" : "var(--hi)" }}>
                    {e.year}
                  </span>
                  <span className="text-11 leading-[1.35] text-mute">{e.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <Narration minLines={3}>
        <span className="mr-2 font-mono text-11 text-hot not-italic">{ev.year}</span>
        {ev.note}
      </Narration>
      {source && <Provenance drawn={source} />}
    </div>
  );
}
