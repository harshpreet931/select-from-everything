"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { StepControls, useStepper } from "./stepper";

/**
 * the simplest step-through: each <Slide> is one frame. any mdx inside.
 *
 *   <Slides>
 *     <Slide note="first, the reference is copied">...</Slide>
 *     <Slide note="then the method reassigns its copy">...</Slide>
 *   </Slides>
 */
export function Slide({ children }: { children: ReactNode; note?: ReactNode }) {
  return <>{children}</>;
}

export function Slides({ children, interval = 1800, label = "step" }: { children: ReactNode; interval?: number; label?: string }) {
  const slides = Children.toArray(children).filter(isValidElement) as React.ReactElement<{ children: ReactNode; note?: ReactNode }>[];
  const s = useStepper(slides.length, { interval });
  const cur = slides[s.i];
  return (
    <div {...s.keys} className="slides outline-none">
      <div className="grid min-w-0 [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-w-0">
        {slides.map((sl, i) => (
          <div
            key={i}
            aria-hidden={i !== s.i}
            className={`transition-opacity duration-200 ease-sfe ${i === s.i ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {sl.props.children}
          </div>
        ))}
      </div>
      <p className="mt-5 min-h-[1.7em] font-serif text-[1.04rem] leading-[1.65] text-ink" aria-live="polite">
        {cur?.props.note}
      </p>
      <StepControls s={s} label={label} className="mt-3" />
    </div>
  );
}
