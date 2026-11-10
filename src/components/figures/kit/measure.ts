"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** the element's content width, kept current with a ResizeObserver. fallback before mount. */
export function useWidth<T extends HTMLElement = HTMLDivElement>(fallback = 640): readonly [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
