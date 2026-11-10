"use client";

import { useEffect, useRef, useState } from "react";

type Tone = "ref" | "live" | "dead" | "meta" | "hot";

// tiny and huge values get exponent notation instead of rounding to "0"
const fmt = (v: number) =>
  v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e12) ? v.toExponential(2).replace("e", "E") : v.toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * horizontal bars for numbers that should be compared (benchmarks, sizes).
 *
 *   <Bars unit="ns/op" data={[
 *     { label: "ArrayList.get", value: 1.2, tone: "live" },
 *     { label: "LinkedList.get", value: 4100, tone: "dead" },
 *   ]} log />
 */
export function Bars({
  data,
  unit = "",
  log,
  max,
}: {
  data: { label: string; value: number; tone?: Tone; note?: string }[];
  unit?: string;
  /** log scale, for values spanning orders of magnitude */
  log?: boolean;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const top = max ?? Math.max(...data.map((d) => d.value));
  const scale = (v: number) => (log ? Math.log10(v + 1) / Math.log10(top + 1) : v / top);

  // under 480 px of container the label goes on its own line above the bar, so long labels
  // can't squeeze the bar to nothing; wider, the label column takes at most 45%
  return (
    <div ref={ref} className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-13 @min-[480px]:grid-cols-[fit-content(45%)_minmax(0,1fr)_auto] @min-[480px]:gap-y-2.5">
        {data.map((d, i) => (
          <div key={d.label} className="contents">
            <span className={`col-span-2 text-ink [overflow-wrap:anywhere] @min-[480px]:col-span-1 @min-[480px]:pt-0 ${i ? "pt-2" : ""}`}>{d.label}</span>
            <span className="relative h-[14px] bg-well-2">
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-sfe"
                style={{
                  width: shown && d.value > 0 ? `${Math.max(0.5, scale(d.value) * 100)}%` : "0%",
                  background: d.tone ? `var(--${d.tone})` : "var(--ink)",
                }}
              />
            </span>
            <span className="text-right text-12 text-mute tabular">
              {fmt(d.value)}
              {unit && <span className="text-faint"> {unit}</span>}
            </span>
          </div>
        ))}
        {log && <span className="col-span-full mt-1 text-11 text-faint">log scale</span>}
      </div>
    </div>
  );
}
