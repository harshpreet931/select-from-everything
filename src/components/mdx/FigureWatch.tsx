"use client";

import { useEffect, useRef } from "react";
import { watchFigure } from "@/lib/analytics";

/** an empty marker inside every <Figure>: reports the first interaction with that figure */
export function FigureWatch() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => watchFigure(ref.current?.closest("figure") ?? null), []);
  return <span ref={ref} hidden />;
}
