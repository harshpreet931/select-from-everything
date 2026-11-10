"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * the engine behind every step-through figure.
 *
 *   const s = useStepper(steps.length);
 *   <div {...s.keys}> ...render steps[s.i]... <StepControls s={s} /> </div>
 *
 * keys when the figure has focus: ← → step, space play/pause, home/end.
 * autoplay pauses itself when the figure scrolls out of view.
 */
export function useStepper(count: number, opts: { interval?: number; loop?: boolean; start?: number } = {}) {
  const { interval = 1400, loop = false, start = 0 } = opts;
  const [i, setI] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(true);
  const iRef = useRef(i);
  iRef.current = i;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const go = useCallback(
    (n: number) => {
      const target = Math.max(0, Math.min(count - 1, n));
      setDir(target >= iRef.current ? 1 : -1);
      setI(target);
    },
    [count],
  );
  const next = useCallback(() => {
    setDir(1);
    setI((c) => (c + 1 < count ? c + 1 : loop ? 0 : c));
  }, [count, loop]);
  const prev = useCallback(() => {
    setDir(-1);
    setI((c) => Math.max(0, c - 1));
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    setDir(-1);
    setI(0);
  }, []);
  const toggle = useCallback(() => {
    if (!playingRef.current && iRef.current >= count - 1 && !loop) setI(0);
    setPlaying((p) => !p);
  }, [count, loop]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (!visible.current) return;
      const c = iRef.current;
      setDir(1);
      if (c + 1 < count) setI(c + 1);
      else if (loop) setI(0);
      else setPlaying(false);
    }, interval);
    return () => clearInterval(t);
  }, [playing, count, interval, loop]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea, select, .cm-editor")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(count - 1);
    }
  };

  return {
    i,
    count,
    dir,
    playing,
    atStart: i === 0,
    atEnd: i === count - 1,
    next,
    prev,
    go,
    reset,
    toggle,
    setPlaying,
    /** spread on the figure root */
    keys: { ref, tabIndex: 0, onKeyDown, "data-stepper": "" },
  };
}

export type Stepper = ReturnType<typeof useStepper>;

/** play / back / step / reset, a counter, and a scrubber. */
export function StepControls({
  s,
  label = "step",
  className = "",
  compact,
}: {
  s: Stepper;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-2 ${className}`}>
      <button className="act !px-2.5" onClick={s.prev} disabled={s.atStart} aria-label="previous step">
        ←
      </button>
      <button className="act solid min-w-[7.5ch]" onClick={s.next} disabled={s.atEnd} aria-label="next step">
        step →
      </button>
      {!compact && (
        <button className="act min-w-[7ch]" onClick={s.toggle} aria-label={s.playing ? "pause" : "play"}>
          {s.playing ? "pause" : "play"}
        </button>
      )}
      <button className="act" onClick={s.reset} disabled={s.atStart && !s.playing} aria-label="reset">
        reset
      </button>
      <div className="ml-2 flex min-w-[10ch] flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={s.count - 1}
          value={s.i}
          onChange={(e) => s.go(Number(e.target.value))}
          aria-label="scrub through steps"
          className="scrub hidden min-w-0 flex-1 sm:block"
        />
        <span className="ml-auto text-12 whitespace-nowrap text-faint tabular">
          {label} {s.i + 1}/{s.count}
        </span>
      </div>
    </div>
  );
}
