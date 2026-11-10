import type { CSSProperties, ReactNode } from "react";
import { NARR } from "./classes";
import { ring, tint, tv, type Ink, type Tone } from "./tone";

// no "use client": nothing here holds state, so server figures can render these directly and
// client figures bundle them. (Words, Toggle and Slider take callbacks, so only client figures use those.)
// the furniture every figure shares: config rows, option words, wells, chips, legends,
// narration. mono for labels and data, serif for anything people read as sentences.

/* ---- config-file rows: `key =` on the left ------------------------------------ */

export function Row({
  k,
  children,
  w = "10ch",
  last,
  align = "center",
}: {
  k: ReactNode;
  children: ReactNode;
  w?: string;
  last?: boolean;
  align?: "center" | "baseline" | "start";
}) {
  // wide labels stack above their options on phones, short ones stay inline
  const wide = parseFloat(w) > 12;
  return (
    <div
      className={`grid gap-x-3 gap-y-1 py-2 text-12 ${
        wide ? "grid-cols-[minmax(0,1fr)] @min-[520px]:grid-cols-[var(--kw)_minmax(0,1fr)]" : "grid-cols-[var(--kw)_minmax(0,1fr)]"
      } ${last ? "" : "border-b border-line"}`}
      style={{ ["--kw" as string]: w, alignItems: align } as CSSProperties}
    >
      <span className="text-faint">{k}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export type Opt<T> = T | { v: T; label: ReactNode; title?: string };

/** a row of .word options; the selected one is a soft chip. */
export function Words<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Opt<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === "object" ? o.v : o;
        const text = typeof o === "object" ? o.label : String(o);
        return (
          <button
            key={String(v)}
            type="button"
            className="word"
            aria-pressed={value === v}
            title={typeof o === "object" ? o.title : undefined}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, children, label }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className="word" aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
      <span aria-hidden className="mr-1.5 inline-block size-2 rounded-[2px]" style={{ boxShadow: ring(on ? "hi" : "line-2", undefined, 1), background: on ? "var(--hi)" : undefined }} />
      {children}
    </button>
  );
}

export function Slider({
  k,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
}: {
  k: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <input
        type="range"
        className="slider min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={k}
      />
      <span className="min-w-[6ch] text-right text-12 text-hi tabular">{format ? format(value) : value.toLocaleString("en-US")}</span>
    </div>
  );
}

/* ---- wells, chips, labels ------------------------------------------------------ */

export function Well({
  children,
  label,
  right,
  tone,
  dashed,
  className = "",
  style,
}: {
  children: ReactNode;
  label?: ReactNode;
  right?: ReactNode;
  tone?: Ink;
  dashed?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`min-w-0 rounded-md bg-well transition-[box-shadow] duration-200 ease-sfe ${className}`}
      style={{
        boxShadow: dashed ? undefined : tone ? ring(tone) : ring("line"),
        outline: dashed ? `1px dashed ${tone ? tv(tone) : "var(--line-2)"}` : undefined,
        outlineOffset: dashed ? -1 : undefined,
        ...style,
      }}
    >
      {label != null && (
        <div className="flex min-h-8 items-center justify-between gap-3 border-b border-line px-3 py-1 text-11 text-faint">
          <span className="min-w-0 truncate">{label}</span>
          {right != null && <span className="shrink-0">{right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone,
  dashed,
  solid,
  ghost,
  strike,
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: Ink;
  dashed?: boolean;
  solid?: boolean;
  ghost?: boolean;
  strike?: boolean;
  title?: string;
  className?: string;
}) {
  const c = tone ? tv(tone) : "var(--ink)";
  const semantic = tone && tone !== "mute" && tone !== "faint" && tone !== "ink" && tone !== "hi";
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center rounded-xs px-1.5 text-11 leading-[20px] whitespace-nowrap ${className}`}
      style={{
        color: solid ? "var(--bg)" : c,
        background: solid ? c : semantic ? tint(tone as Tone, 9) : undefined,
        boxShadow: dashed ? undefined : solid ? undefined : tone ? ring(tone, semantic ? 55 : undefined) : ring("line-2"),
        outline: dashed ? `1px dashed ${tone ? c : "var(--line-2)"}` : undefined,
        outlineOffset: dashed ? -1 : undefined,
        opacity: ghost ? 0.5 : undefined,
        textDecoration: strike ? "line-through" : undefined,
      }}
    >
      {children}
    </span>
  );
}

export type LegendItem = [Ink, string] | [Ink, string, "dashed" | "ghost" | "line" | "solid"];

/** a key for the colours in a figure. caption <C k> words should match these labels. */
export function Legend({ items, className = "" }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-11 text-faint ${className}`}>
      {items.map(([t, label, style]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block rounded-[2px]"
            style={
              style === "line"
                ? { width: 12, height: 0, borderTop: `1.5px solid ${tv(t)}` }
                : style === "dashed"
                  ? { width: 9, height: 9, outline: `1px dashed ${tv(t)}`, outlineOffset: -1 }
                  : style === "ghost"
                    ? { width: 9, height: 9, boxShadow: ring(t), opacity: 0.45 }
                    : { width: 9, height: 9, background: tv(t) }
            }
          />
          {label}
        </span>
      ))}
    </div>
  );
}

/** a small stat: faint label over a number. */
export function Stat({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: Ink }) {
  return (
    <div className="min-w-0">
      <div className="text-11 text-faint">{k}</div>
      <div className="text-14 tabular" style={{ color: tone ? tv(tone) : "var(--hi)" }}>
        {v}
      </div>
    </div>
  );
}

/* ---- narration ----------------------------------------------------------------- */


export function Narration({
  children,
  minLines = 2,
  live = true,
  tag,
  className = "",
}: {
  children: ReactNode;
  minLines?: number;
  live?: boolean;
  /** a small mono label in front: "split", "redo", "WHERE" */
  tag?: ReactNode;
  className?: string;
}) {
  return (
    <p className={`${NARR} ${className}`} style={{ minHeight: `${minLines * 1.6}em` }} aria-live={live ? "polite" : undefined}>
      {tag != null && tag !== "" && <span className="mr-2 font-mono text-11 text-hot not-italic">{tag}</span>}
      {children}
    </p>
  );
}

/** the end of an anomaly run: live "prevented." or dead "happened." and why. */
export function Verdict({ ok, children, what }: { ok: boolean; children?: ReactNode; what?: string }) {
  return (
    <p className={NARR} aria-live="polite">
      <span style={{ color: ok ? "var(--live)" : "var(--dead)" }}>
        {what ? `${what}: ` : ""}
        {ok ? "prevented." : "happened."}
      </span>{" "}
      {children}
    </p>
  );
}

/** psql-ish output: a terminal well, mono, no colouring unless the caller adds it. */
export function Console({ children, label, minH }: { children: ReactNode; label?: ReactNode; minH?: string }) {
  return (
    <Well label={label}>
      <pre className="overflow-x-auto px-3 py-2.5 text-12 leading-[1.7] whitespace-pre text-ink" style={{ minHeight: minH }}>
        {children}
      </pre>
    </Well>
  );
}
