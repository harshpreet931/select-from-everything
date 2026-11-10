"use client";

import { useState, type ReactNode } from "react";
import { Chip, FIG_TABLE, Heads, Legend, NARR, bytes, fmt, headId, ring, statusLook, tid, tint, tv, useSvgId, useWidth, type LegendItem } from "@/components/figures/kit";
import type { Page, Snap, Tuple, XactStatus } from "@/lib/db/views";
import { HEAP_HOT_UPDATED, HEAP_ONLY_TUPLE, HEAP_XMAX_IS_MULTI, HEAP_XMAX_LOCK_ONLY, removable, visible, type Reader } from "@/lib/db/visibility";
import { describePage } from "@/lib/db/describe";

// an 8 KB heap page. on top, the whole page to scale: a 24 B header (meta), the line
// pointer array growing right from byte 24 (ref), free space in the middle (dashed), tuples
// packed back from the end (pd_upper). under it the same page with the free space
// squeezed so you can read it: every line pointer arrows to its tuple. then the slots,
// one per line pointer. pick one for its header: xmin/xmax by commit status, t_ctid,
// infomask bits, the null bitmap, the values. under 560 px the strip folds away.
//
//   <PageView page={trace.steps[2].heap.accounts[0]} xact={trace.steps[2].xact} />
//   <PageView page={page} xact={xact} snap={{ xmin: 754, xmax: 756, xip: [754] }} me={755} focus={2} />

const tupleTone = (t: Tuple, xact: Record<number, XactStatus>, reader?: Reader, horizon?: number) => {
  if (t.lpFlags !== "normal") return null;
  const st = t.xmin ? statusLook(t.xmin <= 2 ? "committed" : xact[t.xmin]) : statusLook("committed");
  const dead = removable(t, xact, horizon);
  const vis = reader ? visible(t, xact, reader) : null;
  return { st, dead, vis };
};


export function PageDiagram({
  page,
  xact = {},
  reader,
  horizon,
  focus,
  hot = [],
  onFocus,
  layout = "auto",
}: {
  page: Page;
  xact?: Record<number, XactStatus>;
  reader?: Reader;
  horizon?: number;
  focus?: number;
  hot?: number[];
  onFocus?: (lp: number) => void;
  layout?: "auto" | "bytes" | "slots";
}) {
  const id = useSvgId();
  const [wrap, w] = useWidth<HTMLDivElement>(640);
  const W = Math.max(200, w);
  const size = page.size || 8192;
  const mode = layout === "auto" ? (W < 560 ? "slots" : "bytes") : layout;
  const tuples = page.tuples.filter((t) => t.lpFlags === "normal" && t.off != null && t.len != null).sort((a, b) => a.off! - b.off!);
  const free = Math.max(0, page.upper - page.lower);
  const special = size - page.special;

  // minimap: whole page to scale
  const mx = (b: number) => (b / size) * W;

  // exploded strip: bytes to scale except the free gap, which gets a fixed width. the scale comes
  // from the width, never the other way round, so the strip fits at any fill (a near-empty page
  // is capped instead of blown up). when slots or tuples get thinner than a few pixels, the line
  // pointers draw as one band and the tuples without outlines; the slot list still has every one.
  const used = page.lower + (size - page.upper);
  const gap = Math.min(150, Math.max(56, W * 0.16));
  const k = Math.min(8, (W - gap) / Math.max(1, used));
  const ex = (b: number) => (b <= page.lower ? b * k : page.lower * k + gap + (b - page.upper) * k);
  const denseLp = 4 * k < 3;
  const many = page.tuples.length > 24;
  const SY = 44; // strip top
  const SH = 30;
  const arcRoom = Math.min(96, 30 + Math.min(24, tuples.length) * 7);
  const H = SY + SH + arcRoom + 8;

  const lpX = (lp: number) => ex(24 + (lp - 1) * 4) + 2 * k;
  const tupleOf = (lp: number) => page.tuples.find((t) => t.lp === lp);

  return (
    <div ref={wrap} className="min-w-0">
      {/* the whole page, to scale */}
      <div className="mb-1 flex justify-between text-[10px] text-faint">
        <span>0</span>
        <span>
          {page.rel} · block {page.block} · {bytes(size)}
        </span>
        <span>{fmt(size)}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-[2px]" style={{ boxShadow: ring("line-2") }} role="img" aria-label={describePage(page)}>
        <span className="absolute inset-y-0" style={{ left: 0, width: Math.max(1, mx(24)), background: tv("meta") }} />
        <span className="absolute inset-y-0" style={{ left: mx(24), width: Math.max(1, mx(page.lower - 24)), background: tint("ref", 70) }} />
        <span className="absolute inset-y-0" style={{ left: mx(page.lower), width: mx(free), outline: "1px dashed var(--line-2)", outlineOffset: -2 }} />
        {tuples.map((t) => {
          const tt = tupleTone(t, xact, reader, horizon)!;
          return (
            <span
              key={t.lp}
              className="absolute inset-y-0"
              style={{ left: mx(t.off!), width: Math.max(1, mx(t.len!)), background: tt.dead ? tint("dead", 55) : tt.vis?.visible ? tv("live") : "var(--mute)", opacity: tt.dead ? 0.6 : 1 }}
            />
          );
        })}
        {special > 0 && <span className="absolute inset-y-0" style={{ left: mx(page.special), width: Math.max(1, mx(special)), background: tv("meta") }} />}
      </div>
      <div className="relative mt-0.5 h-4 text-[10px] text-meta">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: Math.min(W - 60, Math.max(30, mx(page.lower))) }}>
          ↑ lower {page.lower}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: Math.max(60, Math.min(W - 40, mx(page.upper))) }}>
          ↑ upper {page.upper}
        </span>
      </div>

      {mode === "bytes" && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full max-w-full overflow-visible" style={{ fontFamily: "var(--font-code)" }} aria-hidden>
          <Heads id={id} tones={["ref", "hot", "dead"]} />
          {/* header */}
          <rect x={0.5} y={SY + 0.5} width={Math.max(1, ex(24) - 1)} height={SH - 1} rx={2} fill={tint("meta", 14)} stroke="var(--meta)" />
          {ex(24) > 44 && (
            <text x={ex(24) / 2} y={SY + SH / 2 + 3.5} textAnchor="middle" fontSize={10} fill="var(--meta)">
              header
            </text>
          )}
          {/* line pointers: one cell each, or one band when they're too thin to tell apart */}
          {denseLp && (
            <g>
              <rect x={ex(24)} y={SY + 0.5} width={Math.max(1, ex(page.lower) - ex(24))} height={SH - 1} rx={1.5} fill={tint("ref", 14)} stroke="var(--ref)" />
              <text x={ex(24)} y={SY - 4} fontSize={9} fill="var(--faint)">
                {page.tuples.length} line pointers
              </text>
              {[...new Set([focus, ...hot])].filter((lp): lp is number => lp != null).map((lp) => (
                <line key={lp} x1={lpX(lp)} x2={lpX(lp)} y1={SY - 1} y2={SY + SH + 1} stroke={hot.includes(lp) ? "var(--hot)" : "var(--ref)"} strokeWidth={1.5} />
              ))}
            </g>
          )}
          {!denseLp && page.tuples.map((t) => {
            const x = ex(24 + (t.lp - 1) * 4);
            const f = focus === t.lp;
            const isHot = hot.includes(t.lp);
            const stroke = t.lpFlags === "dead" ? "var(--dead)" : t.lpFlags === "unused" ? "var(--faint)" : isHot ? "var(--hot)" : "var(--ref)";
            return (
              <g key={t.lp} onClick={() => onFocus?.(t.lp)} className="cursor-pointer">
                <rect
                  x={x + 0.5}
                  y={SY + 0.5}
                  width={Math.max(2, 4 * k - 1)}
                  height={SH - 1}
                  rx={1.5}
                  fill={f ? tint("ref", 22) : "var(--bg)"}
                  stroke={stroke}
                  strokeWidth={f || isHot ? 1.5 : 1}
                  strokeDasharray={t.lpFlags === "unused" ? "2 2" : undefined}
                />
                {4 * k >= 9 && (
                  <text x={x + 2 * k} y={SY - 4} textAnchor="middle" fontSize={9} fill={f ? "var(--ref)" : "var(--faint)"}>
                    {t.lp}
                  </text>
                )}
              </g>
            );
          })}
          {/* free space */}
          <rect x={ex(page.lower) + 2} y={SY + 1} width={gap - 4} height={SH - 2} rx={2} fill="none" stroke="var(--line-2)" strokeDasharray="3 3" />
          <text x={ex(page.lower) + gap / 2} y={SY + SH / 2 + 3.5} textAnchor="middle" fontSize={10} fill="var(--mute)">
            free {fmt(free)} B
          </text>
          {/* tuples */}
          {tuples.map((t) => {
            const tt = tupleTone(t, xact, reader, horizon)!;
            const x = ex(t.off!);
            const wd = t.len! * k;
            const thin = wd < 4;
            const f = focus === t.lp;
            const isHot = hot.includes(t.lp);
            const stroke = tt.dead ? "var(--dead)" : isHot ? "var(--hot)" : tv(tt.st.tone);
            if (thin)
              return (
                <rect
                  key={t.lp}
                  x={x}
                  y={SY + 0.5}
                  width={Math.max(0.5, wd - 0.3)}
                  height={SH - 1}
                  fill={isHot ? "var(--hot)" : f ? "var(--ref)" : tt.dead ? tint("dead", 45) : tt.vis?.visible ? tint("live", 55) : "color-mix(in srgb, var(--mute) 45%, transparent)"}
                  onClick={() => onFocus?.(t.lp)}
                  className="cursor-pointer"
                />
              );
            return (
              <g key={t.lp} onClick={() => onFocus?.(t.lp)} className="cursor-pointer" opacity={tt.dead ? 0.55 : 1}>
                <rect
                  x={x + 1}
                  y={SY + 0.5}
                  width={Math.max(1, wd - 2)}
                  height={SH - 1}
                  rx={2}
                  fill={tt.vis?.visible ? tint("live", 16) : f ? "var(--well-2)" : "var(--bg)"}
                  stroke={stroke}
                  strokeOpacity={tt.st.tone === "ink" && !isHot && !tt.dead ? 0.5 : 1}
                  strokeWidth={f || isHot ? 1.75 : 1}
                  strokeDasharray={tt.dead || tt.st.dashed ? "3 2" : undefined}
                />
                {wd > 40 && (
                  <text x={x + wd / 2} y={SY + SH / 2 + 3.5} textAnchor="middle" fontSize={10} fill={isHot ? "var(--hot)" : tt.dead ? "var(--dead)" : "var(--ink)"}>
                    {wd > 70 ? `(${page.block},${t.lp}) ${t.len} B` : `(${page.block},${t.lp})`}
                  </text>
                )}
              </g>
            );
          })}
          {special > 0 && <rect x={ex(page.special)} y={SY + 0.5} width={Math.max(1, special * k)} height={SH - 1} rx={2} fill={tint("meta", 14)} stroke="var(--meta)" />}
          {/* lp → tuple arrows, under the strip */}
          {page.tuples.map((t, i) => {
            const target = t.lpFlags === "redirect" ? tupleOf(t.redirect ?? 0) : t;
            if (!target || target.lpFlags !== "normal" || target.off == null) return null;
            const f = focus === t.lp;
            const isHot = hot.includes(t.lp);
            // on a crowded page only the slots that matter right now get an arrow
            if (many && !f && !isHot) return null;
            const x1 = lpX(t.lp);
            const x2 = ex(target.off) + (target.len! * k) / 2;
            const depth = 18 + ((i * 7) % Math.max(8, arcRoom - 26));
            const y = SY + SH;
            const tone = isHot ? "hot" : "ref";
            return (
              <path
                key={t.lp}
                d={`M${x1} ${y + 1} C${x1} ${y + depth}, ${x2} ${y + depth}, ${x2} ${y + 3}`}
                fill="none"
                stroke={tv(tone)}
                strokeWidth={f || isHot ? 1.5 : 1}
                strokeDasharray={t.lpFlags === "redirect" ? "4 3" : undefined}
                opacity={focus == null || f || isHot ? 0.9 : 0.3}
                markerEnd={`url(#${headId(id, tone)})`}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** the slots, one row per line pointer. buttons, so you can tab through them. */
export function SlotList({
  page,
  xact = {},
  reader,
  horizon,
  focus,
  hot = [],
  onFocus,
  fields,
}: {
  page: Page;
  xact?: Record<number, XactStatus>;
  reader?: Reader;
  horizon?: number;
  focus?: number;
  hot?: number[];
  onFocus?: (lp: number) => void;
  fields?: string[];
}) {
  const cols = fields ?? Object.keys(page.tuples.find((t) => t.data)?.data ?? {}).slice(0, 3);
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className={`w-full border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`}>
        <thead>
          <tr className="text-left text-faint">
            <th className="border-b border-line px-2 py-1 font-normal">lp</th>
            <th className="border-b border-line px-2 py-1 font-normal">ctid</th>
            <th className="border-b border-line px-2 py-1 font-normal">xmin</th>
            <th className="border-b border-line px-2 py-1 font-normal">xmax</th>
            <th className="border-b border-line px-2 py-1 font-normal">t_ctid</th>
            {cols.map((c) => (
              <th key={c} className="border-b border-line px-2 py-1 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.tuples.map((t) => {
            const tt = tupleTone(t, xact, reader, horizon);
            const f = focus === t.lp;
            const isHot = hot.includes(t.lp);
            const ghost = t.lpFlags !== "normal" || tt?.dead;
            return (
              <tr
                key={t.lp}
                className="cursor-pointer border-t border-line transition-[background-color] duration-200 ease-sfe"
                style={{
                  background: tt?.vis?.visible ? tint("live", f ? 16 : 9) : f ? "var(--well-2)" : undefined,
                  boxShadow: isHot ? "inset 2px 0 0 var(--hot)" : f ? "inset 2px 0 0 var(--ref)" : undefined,
                }}
                onClick={() => onFocus?.(t.lp)}
              >
                <td className="px-2 py-1">
                  <button type="button" className="text-ref tabular" aria-pressed={f} aria-label={`line pointer ${t.lp}${t.lpFlags !== "normal" ? `, ${t.lpFlags}` : ""}`} onClick={() => onFocus?.(t.lp)}>
                    {t.lp}
                  </button>
                </td>
                {t.lpFlags !== "normal" ? (
                  <td colSpan={4 + cols.length} className="px-2 py-1">
                    {t.lpFlags === "redirect" ? (
                      <span className="text-ref">redirect → lp {t.redirect}</span>
                    ) : t.lpFlags === "dead" ? (
                      <Chip tone="dead">dead</Chip>
                    ) : (
                      <span className="text-faint italic">unused</span>
                    )}
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1 tabular" style={{ color: "var(--ref)", opacity: ghost ? 0.55 : 1 }}>
                      ({page.block},{t.lp})
                    </td>
                    <td className="px-2 py-1">
                      <XidChip x={t.xmin} st={t.xmin ? xact[t.xmin] : undefined} />
                    </td>
                    <td className="px-2 py-1">
                      <XmaxChip t={t} xact={xact} />
                    </td>
                    <td className="px-2 py-1 tabular" style={{ color: "var(--ref)" }}>
                      {tid(t.ctid)}
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="max-w-[14ch] truncate px-2 py-1" style={{ color: t.data?.[c] == null ? "var(--faint)" : tt?.dead ? "var(--mute)" : "var(--ink)", textDecoration: tt?.dead ? "line-through" : undefined }}>
                        {t.data?.[c] ?? "null"}
                      </td>
                    ))}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** an xmax that is a MultiXactId (HEAP_XMAX_IS_MULTI): a group of lockers, maybe one updater. not an xid, so no clog status */
const isMulti = (t: Pick<Tuple, "infomask">) => !!((t.infomask ?? 0) & HEAP_XMAX_IS_MULTI);

function XmaxChip({ t, xact }: { t: Tuple; xact: Record<number, XactStatus> }) {
  return isMulti(t) && t.xmax ? <XidChip x={t.xmax} multi /> : <XidChip x={t.xmax} st={t.xmax ? xact[t.xmax] : undefined} />;
}

export function XidChip({ x, st, label, multi }: { x?: number; st?: XactStatus; label?: string; /** x is a MultiXactId: drawn "multi N" in meta, no commit status */ multi?: boolean }) {
  if (!x) return <span className="text-faint tabular">0</span>;
  if (multi)
    return (
      <span className="inline-flex items-center rounded-xs px-1 leading-[18px] whitespace-nowrap tabular" title={`multixact ${x}: a set of transactions sharing this row, not an xid`} style={{ color: "var(--meta)", boxShadow: ring("meta", 60) }}>
        {label ?? `multi ${x}`}
      </span>
    );
  const lk = statusLook(x <= 2 ? "committed" : st);
  return (
    <span
      className="inline-flex items-center rounded-xs px-1 leading-[18px] tabular"
      title={st ? `xid ${x}: ${st}` : `xid ${x}`}
      style={{
        color: lk.tone === "ink" ? "var(--hi)" : tv(lk.tone),
        boxShadow: lk.dashed ? undefined : ring(lk.tone === "ink" ? "line-2" : lk.tone, lk.tone === "ink" ? undefined : 60),
        outline: lk.dashed ? "1px dashed var(--mute)" : undefined,
        outlineOffset: lk.dashed ? -1 : undefined,
      }}
    >
      {label ?? x}
    </span>
  );
}

const FLAG = (f: string) => f.replace(/^HEAP_/, "");

/** the header of one tuple, field by field */
export function TupleCard({ page, t, xact = {}, reader, who }: { page: Page; t: Tuple; xact?: Record<number, XactStatus>; reader?: Reader; who?: string }) {
  if (t.lpFlags !== "normal")
    return (
      <div className={NARR}>
        line pointer {t.lp} is <strong>{t.lpFlags}</strong>
        {t.lpFlags === "redirect" ? `: it points at lp ${t.redirect}, the live end of a HOT chain, so index entries for lp ${t.lp} still work.` : t.lpFlags === "dead" ? ": the tuple is gone, the slot waits for vacuum to clear the index entries pointing here." : ": free to reuse."}
      </div>
    );
  const vis = reader ? visible(t, xact, reader) : null;
  const self = t.ctid && t.ctid[0] === page.block && t.ctid[1] === t.lp;
  const flags = t.flags ?? [];
  const hotBits = [(t.infomask2 ?? 0) & HEAP_HOT_UPDATED ? "HOT_UPDATED" : null, (t.infomask2 ?? 0) & HEAP_ONLY_TUPLE ? "ONLY_TUPLE" : null].filter(Boolean) as string[];
  const shown = [...new Set([...flags.map(FLAG), ...hotBits])];
  const row = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[8.5ch_minmax(0,1fr)] items-baseline gap-x-2 py-[3px]">
      <span className="text-meta">{k}</span>
      <span className="min-w-0">{v}</span>
    </div>
  );
  return (
    <div className="grid gap-0.5 text-11 @min-[520px]:text-12">
      <div className="mb-1 text-hi">
        tuple ({page.block},{t.lp}) <span className="text-faint">· off {t.off} · len {t.len} B</span>
      </div>
      {row(
        "t_xmin",
        <>
          <XidChip x={t.xmin} st={t.xmin ? xact[t.xmin] : undefined} /> <span className="text-faint">{t.xmin ? (t.xmin <= 2 ? "frozen" : (xact[t.xmin] ?? "")) : ""}</span>
        </>,
      )}
      {row(
        "t_xmax",
        <>
          <XmaxChip t={t} xact={xact} />{" "}
          <span className="text-faint">
            {!t.xmax ? "nobody deleted it" : isMulti(t) ? ((t.infomask ?? 0) & HEAP_XMAX_LOCK_ONLY ? "a multixact: several transactions lock the row" : "a multixact: lockers plus the transaction that updated or deleted it") : (xact[t.xmax] ?? "")}
          </span>
        </>,
      )}
      {row(
        "t_ctid",
        <>
          <span className="text-ref tabular">{tid(t.ctid)}</span> <span className="text-faint">{self ? "itself: the newest version" : "→ the next version"}</span>
        </>,
      )}
      {row(
        "infomask",
        <span className="flex flex-wrap gap-1">
          {shown.length ? (
            shown.map((f) => (
              <Chip key={f} tone="meta">
                {f}
              </Chip>
            ))
          ) : (
            <span className="text-faint">none</span>
          )}
        </span>,
      )}
      {row("t_hoff", <span className="tabular">{t.hoff ?? 24} B</span>)}
      {t.nullBits &&
        row(
          "nulls",
          <span className="inline-flex gap-[2px]" aria-label={`null bitmap ${t.nullBits}`}>
            {t.nullBits.split("").map((b, i) => (
              <span key={i} className="inline-flex size-4 items-center justify-center rounded-[2px] text-[10px]" style={{ boxShadow: ring("meta", 60), color: b === "1" ? "var(--meta)" : "var(--faint)" }}>
                {b}
              </span>
            ))}
          </span>,
        )}
      {t.data &&
        row(
          "data",
          <span className="flex flex-wrap gap-x-3">
            {Object.entries(t.data).map(([k, v]) => (
              <span key={k}>
                <span className="text-mute">{k}</span> <span className={v == null ? "text-faint italic" : "text-hi"}>{v ?? "null"}</span>
              </span>
            ))}
          </span>,
        )}
      {vis && (
        <p className={`${NARR} mt-2`}>
          <span style={{ color: vis.visible ? "var(--live)" : "var(--mute)" }}>{vis.visible ? `visible${who ? ` to ${who}` : ""}.` : `not visible${who ? ` to ${who}` : ""}.`}</span> {vis.why}
        </p>
      )}
    </div>
  );
}

const PAGE_LEGEND = (withSnap: boolean): LegendItem[] => [
  ["meta", "header"],
  ["ref", "line pointer → tuple", "line"],
  ["mute", "free space", "dashed"],
  ...(withSnap ? ([["live", "visible to the snapshot"]] as LegendItem[]) : []),
  ["dead", "dead", "ghost"],
  ["mute", "in progress", "dashed"],
];

export function PageView({
  page,
  xact,
  snap,
  me,
  horizon,
  layout = "auto",
  focus: focus0,
  hot,
  fields,
  label,
  who,
  provenance,
}: {
  page: Page;
  xact?: Record<number, XactStatus>;
  snap?: Snap;
  /** the reader's own xid, for visibility */
  me?: number;
  horizon?: number;
  layout?: "auto" | "bytes" | "slots";
  focus?: number;
  hot?: number[];
  fields?: string[];
  label?: ReactNode;
  /** who the snapshot belongs to, for the narration: "T2" */
  who?: string;
  provenance?: ReactNode;
}) {
  const [focus, setFocus] = useState<number | undefined>(focus0 ?? page.tuples.find((t) => t.lpFlags === "normal")?.lp);
  const reader: Reader | undefined = snap ? { snap, me } : undefined;
  const t = page.tuples.find((x) => x.lp === focus);
  return (
    <div className="@container grid min-w-0 gap-4 text-12 grid-cols-[minmax(0,1fr)]">
      {label != null && <div className="text-11 text-faint">{label}</div>}
      <PageDiagram page={page} xact={xact} reader={reader} horizon={horizon} focus={focus} hot={hot} onFocus={setFocus} layout={layout} />
      <div className="grid min-w-0 gap-4 @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] grid-cols-[minmax(0,1fr)]">
        <SlotList page={page} xact={xact} reader={reader} horizon={horizon} focus={focus} hot={hot} onFocus={setFocus} fields={fields} />
        <div className="min-h-[12rem] rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-live="polite">
          {t ? <TupleCard page={page} t={t} xact={xact} reader={reader} who={who} /> : <span className="text-faint">pick a line pointer.</span>}
        </div>
      </div>
      <Legend items={PAGE_LEGEND(!!snap)} />
      {provenance != null && <div className="text-right text-[10px] text-faint">{provenance}</div>}
    </div>
  );
}

