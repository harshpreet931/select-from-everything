import type { ReactNode } from "react";
import { tokenizeSql, tokStyle, type SqlKind } from "./sql";
import { tint, tv, type Tone } from "./tone";

// sql in figures: an inline <Sql> and a code panel with a file tab, numbered lines,
// whole-line highlights (hot / live / dead) and character marks (a clause, an injected
// string). no hooks, so it renders on the server straight from mdx too.

export type Mark = { line?: number; from: number; to: number; tone: Tone };

/** one line (or a few) of sql, coloured like the code blocks. */
export function Sql({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span className={`font-mono ${className}`}>
      {tokenizeSql(code).map((x, i) => (
        <span key={i} style={tokStyle(x.k)}>
          {x.t}
        </span>
      ))}
    </span>
  );
}

type Seg = { from: number; to: number; k: SqlKind | "plain" | Tone | "faint" | "mute" | "hi" };

// colour for EXPLAIN text output, psql sessions and plain text
function planSegs(line: string, base: number): Seg[] {
  const segs: Seg[] = [];
  const push = (from: number, to: number, k: Seg["k"]) => to > from && segs.push({ from: base + from, to: base + to, k });
  const arrow = line.indexOf("->");
  const start = arrow >= 0 ? arrow + 2 : line.search(/\S/);
  if (arrow >= 0) push(0, arrow + 2, "faint");
  else if (start > 0) push(0, start, "plain");
  const paren = line.indexOf("(", Math.max(0, start));
  const colon = /^\s*[A-Z][A-Za-z ]+:/.test(line.slice(Math.max(0, start)));
  if (colon) {
    const c = line.indexOf(":", start) + 1;
    push(Math.max(0, start), c, "mute");
    push(c, line.length, "plain");
  } else if (paren > 0) {
    push(Math.max(0, start), paren, "hi");
    push(paren, line.length, "faint");
  } else push(Math.max(0, start), line.length, "hi");
  return segs;
}

function psqlSegs(line: string, base: number): Seg[] {
  const m = /^(\S*=[#>]\s?)/.exec(line);
  if (m) {
    const rest = tokenizeSql(line.slice(m[0].length)).map((t) => ({ from: base + m[0].length + t.at, to: base + m[0].length + t.at + t.t.length, k: t.k }));
    return [{ from: base, to: base + m[0].length, k: "faint" }, ...rest];
  }
  if (/^(ERROR|FATAL|PANIC):/.test(line)) return [{ from: base, to: base + line.length, k: "dead" }];
  if (/^(NOTICE|WARNING|DETAIL|HINT|LOG):/.test(line)) return [{ from: base, to: base + line.length, k: "mute" }];
  return [{ from: base, to: base + line.length, k: "plain" }];
}

function segStyle(k: Seg["k"]) {
  if (k === "plain") return { color: "var(--ink)" };
  if (k === "faint" || k === "mute" || k === "hi") return { color: `var(--${k})` };
  if (k === "ref" || k === "live" || k === "dead" || k === "meta" || k === "hot") return { color: tv(k) };
  return tokStyle(k);
}

export function SqlPanel({
  code,
  file,
  right,
  nolines,
  lang = "sql",
  hot = [],
  live = [],
  dead = [],
  marks = [],
  className = "",
  wrap,
}: {
  code: string;
  file?: ReactNode;
  right?: ReactNode;
  nolines?: boolean;
  lang?: "sql" | "plan" | "psql" | "text";
  hot?: number[];
  live?: number[];
  dead?: number[];
  marks?: Mark[];
  className?: string;
  /** wrap long lines instead of scrolling */
  wrap?: boolean;
}) {
  const src = code.replace(/\n$/, "");
  const lines = src.split("\n");
  const starts: number[] = [];
  let acc = 0;
  for (const l of lines) {
    starts.push(acc);
    acc += l.length + 1;
  }
  // segments over the whole source
  let segs: Seg[] = [];
  if (lang === "sql") segs = tokenizeSql(src).map((t) => ({ from: t.at, to: t.at + t.t.length, k: t.k }));
  else if (lang === "plan") lines.forEach((l, i) => segs.push(...planSegs(l, starts[i])));
  else if (lang === "psql") lines.forEach((l, i) => segs.push(...psqlSegs(l, starts[i])));
  else segs = [{ from: 0, to: src.length, k: "plain" }];
  // marks as absolute ranges
  const abs = marks.map((m) => (m.line ? { from: starts[m.line - 1] + m.from, to: starts[m.line - 1] + m.to, tone: m.tone } : m));

  return (
    <div className={`min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)] ${className}`}>
      {(file != null || right != null) && (
        <div className="flex h-8 items-center justify-between gap-3 border-b border-line px-3 text-11">
          <span className="truncate text-ink">{file}</span>
          {right != null && <span className="shrink-0 text-faint">{right}</span>}
        </div>
      )}
      <div className={`${wrap ? "" : "overflow-x-auto"} py-2.5`}>
        <ol className={`${wrap ? "" : "min-w-max"} text-12 leading-[1.75] @min-[520px]:text-13`}>
          {lines.map((l, i) => {
            const n = i + 1;
            const tone: Tone | null = hot.includes(n) ? "hot" : dead.includes(n) ? "dead" : live.includes(n) ? "live" : null;
            const a = starts[i];
            const b = a + l.length;
            return (
              <li
                key={i}
                className={`grid border-l-2 pr-4 transition-colors duration-200 ease-sfe ${nolines ? "grid-cols-[minmax(0,1fr)] pl-3" : "grid-cols-[3ch_minmax(0,1fr)] gap-x-3"}`}
                style={{ borderColor: tone ? tv(tone) : "transparent", background: tone ? tint(tone, 10) : undefined }}
              >
                {!nolines && (
                  <span className="text-right tabular select-none" style={{ color: tone ? tv(tone) : "var(--faint)", opacity: tone ? 1 : 0.6 }}>
                    {n}
                  </span>
                )}
                <span className={wrap ? "break-words whitespace-pre-wrap" : "whitespace-pre"}>{l ? renderLine(src, a, b, segs, abs) : " "}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function renderLine(src: string, a: number, b: number, segs: Seg[], marks: { from: number; to: number; tone: Tone }[]) {
  // cut points: segment edges and mark edges inside [a, b)
  const cuts = new Set<number>([a, b]);
  for (const s of segs) {
    if (s.to <= a || s.from >= b) continue;
    cuts.add(Math.max(a, s.from));
    cuts.add(Math.min(b, s.to));
  }
  for (const m of marks) {
    if (m.to <= a || m.from >= b) continue;
    cuts.add(Math.max(a, m.from));
    cuts.add(Math.min(b, m.to));
  }
  const pts = [...cuts].sort((x, y) => x - y);
  const out: ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const from = pts[i];
    const to = pts[i + 1];
    if (to <= from) continue;
    const seg = segs.find((s) => s.from <= from && s.to >= to);
    const mark = marks.find((m) => m.from <= from && m.to >= to);
    const text = src.slice(from, to);
    out.push(
      <span
        key={from}
        style={{
          ...(seg ? segStyle(seg.k) : { color: "var(--ink)" }),
          ...(mark
            ? {
                background: tint(mark.tone, 14),
                boxShadow: `inset 0 -1.5px 0 ${tv(mark.tone)}`,
                transition: "background-color 200ms var(--ease), box-shadow 200ms var(--ease)",
              }
            : {}),
        }}
      >
        {text}
      </span>,
    );
  }
  return out;
}
