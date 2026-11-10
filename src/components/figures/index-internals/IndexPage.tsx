import { ring, tint } from "@/components/figures/kit/tone";

// one index page to scale, from real page_header / bt_page_stats numbers: the 24-byte header
// (meta), the line pointers growing down (ref), free space (dashed), the index tuples growing
// up from the end, and the special space with the sibling links and level (meta). under it,
// optionally, a strip of the page's items in slot order: the high key (meta, italic), keys,
// posting-list tuples with their row count, a key-less downlink. server only: nothing moves.
//
//   <IndexPage pages={[{ label: "leaf 1", lower: 1492, upper: 2304, special: 8176 }]} items={[...]} />

export type PageNums = { label: string; lower: number; upper: number; special: number; size?: number; note?: string };
export type PageItem = { text: string; kind?: "high" | "key" | "posting" | "minus" | "dead" | "more"; n?: number; hot?: boolean; slot?: number };

function Bar({ p }: { p: PageNums }) {
  const size = p.size ?? 8192;
  const pct = (b: number) => `${(b / size) * 100}%`;
  const parts = [
    { from: 0, to: 24, fill: tint("meta", 30), edge: "var(--meta)", name: "header" },
    { from: 24, to: p.lower, fill: tint("ref", 30), edge: "var(--ref)", name: "line pointers" },
    { from: p.lower, to: p.upper, fill: "transparent", edge: "", name: "free" },
    { from: p.upper, to: p.special, fill: "color-mix(in srgb, var(--mute) 30%, transparent)", edge: "var(--mute)", name: "index tuples" },
    { from: p.special, to: size, fill: tint("meta", 30), edge: "var(--meta)", name: "special" },
  ];
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-11">
        <span className="text-hi">{p.label}</span>
        <span className="text-faint tabular">
          free <span className="text-hi">{(p.upper - p.lower).toLocaleString("en-US")}</span> of {size.toLocaleString("en-US")} bytes
        </span>
      </div>
      <div
        className="relative h-5 overflow-hidden rounded-[3px]"
        style={{ boxShadow: ring("line-2") }}
        role="img"
        aria-label={`${p.label}: header 24 bytes, line pointers to byte ${p.lower}, free space to byte ${p.upper}, index tuples to byte ${p.special}, special space to the end`}
      >
        {parts.map((x) =>
          x.to > x.from ? (
            <span
              key={x.name}
              className="absolute inset-y-0"
              title={`${x.name}: ${x.to - x.from} bytes`}
              style={{
                left: pct(x.from),
                width: pct(x.to - x.from),
                background: x.fill,
                boxShadow: x.edge ? `inset 0 0 0 1px ${x.edge}` : undefined,
                outline: x.name === "free" ? "1px dashed var(--line-2)" : undefined,
                outlineOffset: -3,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="relative h-4 text-[10px] text-faint tabular">
        {p.lower / size > 0.07 && <span className="absolute left-0">0</span>}
        <span className="absolute -translate-x-1/2" style={{ left: pct(p.lower) }}>
          {p.lower}
        </span>
        {p.upper - p.lower > 900 && (
          <span className="absolute -translate-x-1/2" style={{ left: pct(p.upper) }}>
            {p.upper}
          </span>
        )}
        <span className="absolute right-0">{size}</span>
      </div>
      {p.note ? <div className="text-11 text-mute">{p.note}</div> : null}
    </div>
  );
}

function Chip({ it, slot }: { it: PageItem; slot?: number }) {
  const k = it.kind ?? "key";
  const color = it.hot ? "var(--hot)" : k === "high" ? "var(--meta)" : k === "minus" ? "var(--ref)" : k === "dead" ? "var(--dead)" : k === "more" ? "var(--faint)" : "var(--ink)";
  const shadow = it.hot ? ring("hot", undefined, 1.5) : k === "high" ? ring("meta", 70) : k === "posting" ? ring("ref", 60) : k === "more" ? undefined : ring("line-2");
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className="rounded-[3px] px-1.5 text-11 leading-[20px] whitespace-nowrap tabular"
        style={{
          color,
          boxShadow: shadow,
          background: k === "posting" ? tint("ref", 8) : undefined,
          fontStyle: k === "high" ? "italic" : undefined,
          textDecoration: k === "dead" ? "line-through" : undefined,
        }}
      >
        {it.text}
        {k === "posting" && it.n ? <span className="text-ref"> ×{it.n}</span> : null}
      </span>
      {slot !== undefined && k !== "more" ? <span className="text-[9px] text-faint tabular">{slot}</span> : <span className="text-[9px]">&nbsp;</span>}
    </span>
  );
}

export function IndexPage({
  pages = [],
  items,
  itemsLabel,
  provenance,
}: {
  pages?: PageNums[];
  items?: PageItem[];
  itemsLabel?: string;
  /** one faint line, e.g. "real output, postgres 18.6 (PGlite 0.5.12) · the run blocks above" */
  provenance?: string;
}) {
  let slot = 0;
  return (
    <div className="grid min-w-0 gap-4 text-12">
      {pages.map((p) => (
        <Bar key={p.label} p={p} />
      ))}
      {pages.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-mute">
          <span><span className="text-meta">■</span> header and special space</span>
          <span><span className="text-ref">■</span> line pointers, 4 bytes each</span>
          <span><span className="text-mute">■</span> index tuples</span>
          <span>▭ free</span>
        </div>
      )}
      {items && (
        <div className="grid gap-1.5">
          {itemsLabel ? <div className="text-11 text-faint">{itemsLabel}</div> : null}
          <div className="flex flex-wrap items-start gap-1.5">
            {items.map((it, i) => (
              <Chip key={i} it={it} slot={it.kind === "more" ? undefined : (slot = it.slot ?? slot + 1)} />
            ))}
          </div>
        </div>
      )}
      {provenance ? <div className="text-right text-[10px] leading-4 text-faint">{provenance}</div> : null}
    </div>
  );
}
