import { Fragment } from "react";
import { Provenance } from "@/components/figures/kit/Provenance";
import { fmt } from "@/components/figures/kit/format";

// the kitchen line: one tray per clause, drawn to the shape of the table that clause hands on.
// a server component on purpose: it reads a capture's @stages and ships only svg, so the stage
// rows aren't sent to the browser a second time (the ClauseStepper already carries them).
//
// heights grow with the square root of the row count (200 rows and 3 rows on one scale), widths
// with the column count. inside a tray, parts are linear: the rows a clause throws out are the
// dashed slice, GROUP BY buckets are bands in proportion to their size. no semantic colour: this
// is a picture of shapes, nothing in it is a pointer, a state or "look here".
//
//   <TrayLine stages={trace.steps[0].stages} table={{ columns: 9 }} group="category" jobs={{ FROM: "fetch" }} trace={trace} />

type StageIn = { clause: string; columns: string[]; data: (string | null)[][] };

type Shape = {
  clause: string;
  rows: number;
  cols: number;
  /** the rows (or buckets) this clause threw out */
  removed: number;
  /** bucket sizes, in the order the stage lists them; `gone` marks buckets HAVING threw out */
  buckets?: { key: string | null; size: number; gone?: boolean }[];
};

const sameCols = (a: StageIn, b: StageIn) => a.columns.length === b.columns.length && a.columns.every((c, i) => c === b.columns[i]);
const BEFORE_SELECT = new Set(["FROM", "WHERE", "GROUP BY", "HAVING"]);
const H = 112; // tray height for the biggest table, px
const CW = 8; // one column, px

function shapes(stages: StageIn[], tableCols: number, group: string): Shape[] {
  const out: Shape[] = [];
  let bucketsSeen: Shape["buckets"];
  stages.forEach((st, i) => {
    const prev = stages[i - 1];
    const clause = st.clause.toUpperCase();
    const s: Shape = {
      clause: st.clause,
      rows: st.data.length,
      // FROM hands over every column of the table, even when the capture only kept a few
      cols: BEFORE_SELECT.has(clause) ? tableCols : st.columns.length,
      // only a clause that keeps the columns can throw rows out. SELECT changes the columns:
      // its 10 rows aren't 175 removed, they're 10 buckets turned into rows
      removed: prev && sameCols(prev, st) ? Math.max(0, prev.data.length - st.data.length) : 0,
    };
    if (clause === "GROUP BY" || clause === "HAVING") {
      const j = st.columns.indexOf(group);
      const runs: { key: string | null; size: number }[] = [];
      for (const r of st.data) {
        const k = r[j] ?? null;
        if (runs.length && runs[runs.length - 1].key === k) runs[runs.length - 1].size++;
        else runs.push({ key: k, size: 1 });
      }
      if (clause === "GROUP BY") bucketsSeen = s.buckets = runs;
      else {
        const kept = new Set(runs.map((r) => r.key));
        s.buckets = (bucketsSeen ?? runs).map((b) => ({ ...b, gone: !kept.has(b.key) }));
        s.removed = s.buckets.filter((b) => b.gone).length;
      }
    }
    out.push(s);
  });
  return out;
}

function Tray({ s, prevRows, maxRows }: { s: Shape; prevRows: number; maxRows: number }) {
  // a clause that throws rows out keeps the tray it was handed and dashes the part it binned
  const total = s.buckets ? s.buckets.reduce((a, b) => a + b.size, 0) : Math.max(s.rows, s.removed && prevRows);
  const h = Math.max(8, Math.round(H * Math.sqrt(total / maxRows)));
  const w = s.cols * CW;
  // neutral shades of the label colour, so a tray reads on paper and at night alike:
  // the tray, its outline, and the two alternating bucket shades
  const mix = (pct: number) => `color-mix(in srgb, var(--faint) ${pct}%, transparent)`;
  const fill = mix(30);
  const edge = mix(55);
  const soft = mix(16);
  const band = mix(40);
  const cols = Array.from({ length: s.cols - 1 }, (_, c) => (c + 1) * CW);
  const body: React.ReactNode[] = [];

  if (s.buckets) {
    // bands, linear in size, never thinner than 3px so the NULL bucket stays visible
    const gap = 1.5;
    const usable = h - gap * (s.buckets.length - 1);
    const raw = s.buckets.map((b) => Math.max(3, (b.size / total) * usable));
    const k = usable / raw.reduce((a, b) => a + b, 0);
    let y = 0;
    s.buckets.forEach((b, i) => {
      const bh = raw[i] * k;
      body.push(
        b.gone ? (
          <rect key={i} x={0.5} y={y + 0.5} width={w - 1} height={Math.max(1, bh - 1)} rx={1} fill="none" stroke="var(--faint)" strokeDasharray="2 2" />
        ) : (
          <rect key={i} x={0} y={y} width={w} height={bh} rx={1} fill={i % 2 ? soft : band} />
        ),
      );
      y += bh + gap;
    });
  } else {
    const cut = s.removed ? Math.max(3, Math.round((s.removed / total) * h)) : 0;
    if (cut) body.push(<rect key="gone" x={0.5} y={0.5} width={w - 1} height={cut - 1} rx={1} fill="none" stroke="var(--faint)" strokeDasharray="2 2" />);
    body.push(<rect key="kept" x={0} y={cut} width={w} height={h - cut} rx={1.5} fill={fill} stroke={edge} />);
    // a short table gets its row lines: you can count them
    if (s.rows <= 12) {
      const rh = (h - cut) / s.rows;
      for (let r = 1; r < s.rows; r++) body.push(<line key={`r${r}`} x1={0} x2={w} y1={cut + r * rh} y2={cut + r * rh} stroke={edge} strokeWidth={0.75} />);
    }
  }

  return (
    <svg
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      width={w + 2}
      height={h + 2}
      className="block h-[calc(var(--h)*0.6)] w-auto @min-[620px]:h-(--h)"
      style={{ ["--h" as string]: `${h + 2}px` }}
      aria-hidden
    >
      {body}
      {cols.map((x) => (
        <line key={x} x1={x} x2={x} y1={0} y2={h} stroke="var(--bg)" strokeOpacity={0.9} strokeWidth={1} />
      ))}
    </svg>
  );
}

export function TrayLine({
  stages,
  table,
  group,
  jobs,
  notes = {},
  trace,
}: {
  /** a capture's @stages, as captured: { clause, columns, data }[] */
  stages: StageIn[];
  /** the source table's real width: FROM hands over all of it */
  table: { columns: number };
  /** the GROUP BY column, to find the buckets */
  group: string;
  /** clause → the kitchen station's job, in a few words */
  jobs: Record<string, string>;
  /** clause → a short faint line under the shape, for a station that throws nothing out ("by avg_price desc") */
  notes?: Record<string, string>;
  trace?: { engine?: { version?: string }; scenario?: string };
}) {
  const list = shapes(stages, table.columns, group);
  const maxRows = Math.max(...list.map((s) => s.rows + s.removed), 1);
  const label = (s: Shape) => (s.buckets ? `${s.buckets.filter((b) => !b.gone).length} groups` : `${fmt(s.rows)} × ${s.cols}`);
  const lost = (s: Shape) => (s.removed ? `${fmt(s.removed)} ${s.buckets ? (s.removed === 1 ? "group" : "groups") : "rows"} out` : (notes[s.clause] ?? null));

  return (
    <div className="@container min-w-0">
      <ol
        className="grid grid-cols-[minmax(0,1fr)] @min-[620px]:grid-cols-[repeat(7,minmax(0,1fr))] @min-[620px]:gap-x-2"
        aria-label={`the kitchen line: ${list.map((s) => `${s.clause} hands on ${label(s)}`).join(", ")}`}
      >
        {list.map((s, i) => (
          <Fragment key={s.clause}>
            <li className="relative grid grid-cols-[6.5rem_4.5rem_minmax(0,1fr)] items-center gap-x-3 border-t border-line py-2.5 first:border-t-0 @min-[620px]:flex @min-[620px]:flex-col @min-[620px]:items-center @min-[620px]:border-t-0 @min-[620px]:py-0">
              {i > 0 && (
                <span aria-hidden className="absolute top-[85px] -left-[0.55rem] hidden -translate-x-1/2 -translate-y-1/2 text-12 text-faint @min-[620px]:block">
                  →
                </span>
              )}
              <div className="flex flex-col @min-[620px]:items-center">
                <span className="text-12 whitespace-nowrap text-hi">{s.clause}</span>
                <span className="text-11 text-faint tabular @min-[620px]:hidden">{label(s)}</span>
                {lost(s) && <span className="text-11 text-faint tabular @min-[620px]:hidden">{lost(s)}</span>}
              </div>
              <div className="flex items-center justify-center @min-[620px]:mt-2 @min-[620px]:h-[118px] @min-[620px]:items-end">
                <Tray s={s} prevRows={i ? list[i - 1].rows : s.rows} maxRows={maxRows} />
              </div>
              <div className="hidden text-center @min-[620px]:mt-2 @min-[620px]:block">
                <div className="text-11 text-ink tabular">{label(s)}</div>
                <div className="min-h-4 text-[10.5px] leading-4 text-faint tabular">{lost(s) ?? ""}</div>
              </div>
              <span className="font-serif text-[0.98rem] leading-snug text-mute italic @min-[620px]:mt-1.5 @min-[620px]:text-center @min-[620px]:text-[0.92rem]">{jobs[s.clause] ?? ""}</span>
            </li>
          </Fragment>
        ))}
      </ol>
      {trace && <Provenance trace={trace} className="mt-4" />}
    </div>
  );
}
