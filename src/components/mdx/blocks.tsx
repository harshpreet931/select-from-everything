import type { ReactNode } from "react";

// small server-rendered building blocks for chapters. see AUTHORING.md.

type Tone = "ref" | "live" | "dead" | "meta" | "hot" | "mute";
const toneVar = (t: Tone) => (t === "mute" ? "var(--mute)" : `var(--${t})`);

/** the tl;dr. every chapter opens with one. rendered as the opening paragraph, drop cap and all. */
export function InShort({ children }: { children: ReactNode }) {
  return <div className="inshort measure mx-auto my-12">{children}</div>;
}

function Callout({ label, tone, children }: { label: ReactNode; tone: Tone; children: ReactNode }) {
  return (
    <aside
      className="measure callout mx-auto my-10 border-l-2 pl-6 text-[1.06rem] leading-[1.75] [&>*+*]:mt-3"
      style={{ borderColor: `color-mix(in srgb, ${toneVar(tone)} 55%, transparent)` }}
    >
      <div className="font-display text-[1.15rem] italic" style={{ color: toneVar(tone) }}>
        {label}
      </div>
      {children}
    </aside>
  );
}

/** the thing that bites people. bugs, traps, prod incidents. */
export function Gotcha({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Callout label={title ? `gotcha: ${title}` : "gotcha"} tone="dead">
      {children}
    </Callout>
  );
}

/** how this shows up in interviews, and the answer that lands. */
export function Interview({ children, q }: { children: ReactNode; q?: string }) {
  return (
    <Callout label="interview" tone="hot">
      {q && <p className="text-hi">“{q}”</p>}
      {children}
    </Callout>
  );
}

/** a pointer into the postgres manual. paraphrase, never quote it. */
export function Docs({ children, href, title }: { children?: ReactNode; href: string; title: string }) {
  return (
    <Callout label={<>in the postgres docs: <a className="link" href={href} target="_blank" rel="noreferrer">{title}</a></>} tone="meta">
      {children}
    </Callout>
  );
}

/** a neutral aside. use sparingly. */
export function Note({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Callout label={title ?? "note"} tone="mute">
      {children}
    </Callout>
  );
}

/** how things work underneath, for people who want one level deeper. collapsed by default. */
export function Deep({ children, title }: { children: ReactNode; title: string }) {
  return (
    <details className="measure deep group mx-auto my-10 rounded-lg bg-well px-6 shadow-[inset_0_0_0_1px_var(--line)]">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 text-ink transition-colors duration-150 hover:text-hi [&::-webkit-details-marker]:hidden">
        <span className="text-[1.06rem]">
          <span className="mr-2.5 font-display text-[1.1rem] text-meta italic">one level deeper:</span>
          {title}
        </span>
        <span className="font-mono text-mute transition-transform duration-200 ease-sfe group-open:rotate-45">+</span>
      </summary>
      <div className="pb-6 text-[1.04rem] leading-[1.75] [&>*+*]:mt-3">{children}</div>
    </details>
  );
}

/** end-of-chapter recap. one line each, write them like you'd say them. */
export function Keylines({ children }: { children: ReactNode }) {
  return (
    <section className="keylines measure mx-auto mt-24">
      <span className="ornament" aria-hidden />
      <div className="mt-6 mb-6 text-center font-display text-[1.6rem] font-light text-hi">keylines</div>
      <div className="text-[1.1rem] text-ink [&_li]:py-2.5 [&_li+li]:!mt-0 [&_li+li]:border-t [&_li+li]:border-line [&_ul]:!max-w-none">
        {children}
      </div>
    </section>
  );
}

/** colour a word so it matches a figure. k = ref | live | dead | meta | hot */
export function C({ k, children }: { k: Tone; children: ReactNode }) {
  return <span style={{ color: toneVar(k) }}>{children}</span>;
}

/**
 * an inline version chip. props combine:
 *   <Since v={17} />          "pg 17+"
 *   <Since std="SQL:2023" />  "SQL:2023"
 *   <Since only />            "postgres only"
 *   <Since v={19} preview />  "postgres 19"
 */
export function Since({ v, std, only, preview }: { v?: number; std?: string; only?: boolean; preview?: boolean }) {
  const bits = [
    preview ? `postgres ${v ?? ""}`.trim() : v ? `pg ${v}+` : null,
    std ?? null,
    only ? "postgres only" : null,
  ].filter(Boolean);
  return (
    <span className="mx-0.5 inline-flex -translate-y-px items-center rounded-sm px-1.5 align-middle font-mono text-11 whitespace-nowrap leading-[18px] text-accent shadow-[inset_0_0_0_1px_var(--accent-2)]">
      {bits.join(" · ")}
    </span>
  );
}

/** a figure frame: a soft panel, optional caption. captions say what to click and what to notice. */
export function Figure({
  children,
  caption,
  wide,
  bare,
}: {
  children: ReactNode;
  caption?: ReactNode;
  wide?: boolean;
  bare?: boolean;
}) {
  return (
    <figure className={`figure my-14 ${wide ? "lg:-mx-12" : ""}`}>
      <div className={`figure-body ${bare ? "" : "ticks px-4 py-6 sm:px-8 sm:py-8"}`}>{children}</div>
      {caption && (
        <figcaption className="mx-auto mt-4 max-w-[36rem] text-center text-[0.98rem] leading-[1.6] text-mute italic [&_code]:not-italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** a bigger version of a definition. term on the left, meaning on the right. */
export function Defs({ children }: { children: ReactNode }) {
  return (
    <dl className="measure mx-auto my-8 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 text-[1.04rem] [&>dd]:border-b [&>dd]:border-line [&>dd]:py-2.5 [&>dd]:text-ink [&>dt]:border-b [&>dt]:border-line [&>dt]:py-2.5 [&>dt]:text-hi">
      {children}
    </dl>
  );
}
