"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// figures move only to explain something. ui changes stay under 300ms with ease-sfe.
// prefers-reduced-motion: jump to the end state, never autoplay.

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** setTimeout that cleans up after itself on unmount (and on clear()). */
export function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach((t) => window.clearTimeout(t)), []);
  return useRef({
    after(ms: number, fn: () => void) {
      ids.current.push(window.setTimeout(fn, ms));
    },
    clear() {
      ids.current.forEach((t) => window.clearTimeout(t));
      ids.current = [];
    },
  }).current;
}

/** calls fn every ms while running. pauses when the tab is hidden. */
export function useTicker(running: boolean, ms: number, fn: () => void) {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") f.current();
    }, ms);
    return () => window.clearInterval(t);
  }, [running, ms]);
}

/** wraps a value that can change; when it does, the wrapper flashes hot for a moment (.flash). */
export function Flash({ v, children, className = "" }: { v: unknown; children: ReactNode; className?: string }) {
  const key = JSON.stringify(v ?? null);
  const first = useRef(key);
  const changed = key !== first.current;
  return (
    <span key={key} className={`${changed ? "flash" : ""} ${className}`}>
      {children}
    </span>
  );
}
