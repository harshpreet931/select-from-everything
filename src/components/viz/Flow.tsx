"use client";

import { useState } from "react";

type Stage = { label: string; sub?: string; note?: string };

/**
 * a pipeline: boxes joined by lines, with a dot travelling through.
 * hover or focus a stage to read its note.
 *
 *   <Flow stages={[
 *     { label: "Main.java", sub: "source", note: "what you write." },
 *     { label: "javac", sub: "compiler", note: "checks types, emits bytecode." },
 *     { label: "Main.class", sub: "bytecode" },
 *     { label: "JVM", sub: "runtime", note: "interprets, then JIT compiles the hot parts." },
 *   ]} />
 */
export function Flow({ stages, vertical }: { stages: (Stage | string)[]; vertical?: boolean }) {
  const list = stages.map((s) => (typeof s === "string" ? { label: s } : s));
  const [active, setActive] = useState<number | null>(null);
  const note = active !== null ? list[active].note : undefined;
  const hasNotes = list.some((s) => s.note);

  return (
    <div className="flow">
      <ol
        className={`flex ${vertical ? "flex-col" : "flex-col sm:flex-row sm:items-stretch"}`}
        style={{ ["--n" as string]: list.length }}
      >
        {list.map((s, i) => (
          <li key={i} className={`flex ${vertical ? "flex-col" : "flex-col sm:flex-1 sm:flex-row"} items-stretch`}>
            <button
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              className={`flex min-w-0 flex-1 flex-col justify-center rounded-xs px-3.5 py-3 text-left transition-[box-shadow,color] duration-150 ${
                active === i ? "shadow-[inset_0_0_0_1px_var(--ink)]" : "shadow-[inset_0_0_0_1px_var(--line-2)]"
              }`}
            >
              <span className="text-13 text-hi">{s.label}</span>
              {s.sub && <span className="mt-0.5 text-11 text-faint">{s.sub}</span>}
            </button>
            {i < list.length - 1 && (
              <span
                aria-hidden
                className={`relative flex items-center justify-center ${
                  vertical ? "h-7 w-full" : "h-7 w-full sm:h-auto sm:w-9"
                }`}
              >
                <span className={`absolute bg-line-2 ${vertical ? "h-full w-px" : "h-full w-px sm:h-px sm:w-full"}`} />
                <span
                  className={`flow-dot absolute size-[5px] rounded-full bg-hot ${vertical ? "flow-dot-v" : ""}`}
                  style={{ animationDelay: `${i * 0.6}s` }}
                />
              </span>
            )}
          </li>
        ))}
      </ol>
      {hasNotes && (
        <p className="mt-4 min-h-[1.7em] font-serif text-[1.02rem] leading-[1.6] text-mute" aria-live="polite">
          {note ?? <span className="text-faint">hover a stage.</span>}
        </p>
      )}
    </div>
  );
}
