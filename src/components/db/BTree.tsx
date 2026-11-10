"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Heads, Legend, Narration, Provenance, Row, Words, fmt, headId, tint, tv, useReducedMotion, useSvgId, useWidth, type Ink, type LegendItem } from "@/components/figures/kit";
import type { BTreeNode, BTreeView, Source, Tid } from "@/lib/db/views";
import { traceBTree } from "@/lib/db/fromTrace";
import { cmpKey } from "@/lib/db/keys";
import { btreeSteps, type BTreeRules } from "@/lib/db/sim/btree";
import { StepSql, stepsOf, traceOf } from "./source";
import { describeBTree } from "@/lib/db/describe";

// a B+tree, level by level, root on top. each page is a row of key cells; child pointers
// leave from the gaps between separators (ref); pages on a level link to their right
// sibling (thin ref); a non-rightmost nbtree page ends in its high key (meta, italic).
// the search path and the key being inserted or found are hot. big captured trees fold:
// "… 25 more pages", "… 362 more" keys. under the leaves, optionally, the heap blocks the
// TIDs point at.
//
//   <BTree view={btreeFromPages(captured)} heap collapse={4} />
//   <BTree trace={trace} select="accounts_pkey" />
//   <BTree lab={{ order: 4, rules: "textbook", presets: [{ label: "1 to 12", keys: [1, 2, ...] }] }} />

const CH = 7.4; // px per mono char at 12px
const CELL_H = 26;
const LEVEL_GAP = 58;
const NODE_GAP = 16;
const GUTTER = 50; // level labels

type Cell = { text: string; kind: "key" | "more" | "high"; key?: string | number; i?: number; full?: string };

/** long keys (text) are cut in the cell; the cell's title keeps the whole key */
const MAX_KEY = 14;
const cut = (t: string) => (t.length > MAX_KEY ? `${t.slice(0, MAX_KEY - 1)}…` : t);
type Box = { id: string; n: BTreeNode | null; x: number; y: number; w: number; cells: (Cell & { x: number; w: number })[]; gap?: number };


function cellsOf(n: BTreeNode, collapse: number): Cell[] {
  const ks = n.keys.map((k, i) => ({ text: cut(String(k)), full: String(k), kind: "key" as const, key: k, i }));
  // keys not drawn: the capture's own trim (n.more at n.moreAt) plus whatever doesn't fit `collapse`
  let hidden = n.more ?? 0;
  let head = ks;
  let tail: typeof ks = [];
  if (n.more) {
    const at = Math.min(ks.length, n.moreAt ?? ks.length - 1);
    head = ks.slice(0, at);
    tail = ks.slice(at);
  }
  if (head.length + tail.length > collapse) {
    const keepHead = Math.max(1, collapse - 1);
    const all = [...head, ...tail];
    hidden += all.length - keepHead - 1;
    head = all.slice(0, keepHead);
    tail = all.slice(-1);
  }
  let shown: Cell[] = hidden > 0 ? [...head, { text: `… ${fmt(hidden)} more`, kind: "more" }, ...tail] : [...head, ...tail];
  if (!shown.length) shown = [{ text: "empty", kind: "more" }];
  if (n.high !== undefined) shown.push({ text: cut(String(n.high)), full: String(n.high), kind: "high", key: n.high });
  return shown;
}

function layout(v: BTreeView, collapse: number, pageCollapse: number) {
  const root = v.nodes[v.root];
  if (!root) return { boxes: [] as Box[], W: 0, H: 0, levels: 0 };
  const levels = root.level + 1;
  // nodes per level, in key order (walk kids)
  const rows: (string | { gap: number })[][] = Array.from({ length: levels }, () => []);
  const walk = (id: string) => {
    const n = v.nodes[id];
    if (!n) return;
    rows[levels - 1 - n.level].push(id);
    n.kids?.forEach(walk);
  };
  walk(v.root);
  // fold long levels: first few, a gap marker, the last one (keep anything on the search path)
  const keep = new Set(v.path ?? []);
  const folded = rows.map((r) => {
    if (r.length <= pageCollapse + 1) return r;
    const out: (string | { gap: number })[] = [];
    let hidden = 0;
    r.forEach((id, i) => {
      const show = i < pageCollapse - 1 || i === r.length - 1 || keep.has(id as string);
      if (show) {
        if (hidden) out.push({ gap: hidden });
        hidden = 0;
        out.push(id);
      } else hidden++;
    });
    if (hidden) out.push({ gap: hidden });
    return out;
  });
  const boxes: Box[] = [];
  const byId = new Map<string, Box>();
  const sizeOf = (id: string): Omit<Box, "x" | "y"> => {
    const n = v.nodes[id];
    let x = 0;
    const cells = cellsOf(n, collapse).map((c) => {
      const w = Math.max(c.kind === "more" ? 64 : 26, c.text.length * CH + 12);
      const out = { ...c, x, w };
      x += w;
      return out;
    });
    return { id, n, w: x, cells };
  };
  // leaves first, left to right
  const H = levels * (CELL_H + LEVEL_GAP) - LEVEL_GAP + 8;
  for (let li = levels - 1; li >= 0; li--) {
    const y = 4 + li * (CELL_H + LEVEL_GAP);
    let cursor = GUTTER;
    for (const item of folded[li]) {
      if (typeof item !== "string") {
        const text = `… ${fmt(item.gap)} more pages`;
        const w = Math.ceil(text.length * 6.5) + 22; // room on both sides, so a sibling arrow never touches the words
        const b: Box = { id: `gap-${li}-${cursor}`, n: null, x: cursor, y, w, cells: [{ text, kind: "more", x: 0, w }], gap: item.gap };
        boxes.push(b);
        cursor += w + NODE_GAP;
        continue;
      }
      const s = sizeOf(item);
      let x = cursor;
      const kids = s.n?.kids?.map((k) => byId.get(k)).filter(Boolean) as Box[] | undefined;
      if (kids?.length) {
        const mid = (kids[0].x + kids[kids.length - 1].x + kids[kids.length - 1].w) / 2;
        x = Math.max(cursor, mid - s.w / 2);
      }
      const b: Box = { ...s, x, y };
      boxes.push(b);
      byId.set(item, b);
      cursor = x + s.w + NODE_GAP;
    }
  }
  const W = Math.max(...boxes.map((b) => b.x + b.w)) + 2;
  return { boxes, byId, W, H, levels };
}

export function BTreeDiagram({ view, collapse = 6, pageCollapse = 4, heap, maxScale = 1 }: { view: BTreeView; collapse?: number; pageCollapse?: number; heap?: boolean; maxScale?: number }) {
  const id = useSvgId();
  const [wrap, cw] = useWidth<HTMLDivElement>(640);
  // fold harder until the tree fits at a readable scale: fewer keys per page first, then fewer pages
  const L = useMemo(() => {
    let best = layout(view, collapse, pageCollapse);
    for (let p = pageCollapse; p >= 2; p--)
      for (let c = collapse; c >= 2; c--) {
        if (best.W * 0.62 <= cw) return best;
        best = layout(view, c, p);
      }
    return best;
  }, [view, collapse, pageCollapse, cw]);
  const path = new Set(view.path ?? []);
  // the path is a walk: root down to a leaf, then (for a range) right along sibling links. an
  // arrow is hot only between consecutive steps, so a range scan doesn't light parent → every leaf
  const step = new Set((view.path ?? []).slice(1).map((to, i) => `${view.path![i]}>${to}`));
  const hit = view.hit !== undefined ? String(view.hit) : undefined;
  // composite and text keys compare column by column (cmpKey), so (a, b) ranges and text ranges work
  const inRange = (k: string | number | undefined) => !!view.range && k !== undefined && cmpKey(k, view.range[0]) >= 0 && cmpKey(k, view.range[1]) <= 0;
  // heap strip: distinct blocks among the shown leaf tids
  const leafBoxes = L.boxes.filter((b) => b.n && b.n.level === 0);
  const tids: { from: number; block: number }[] = [];
  if (heap)
    for (const b of leafBoxes)
      b.cells.forEach((c) => {
        if (c.kind !== "key" || c.i === undefined) return;
        const t = b.n!.tids?.[c.i];
        const first = (Array.isArray(t?.[0]) ? (t as Tid[])[0] : (t as Tid | null)) as Tid | null;
        if (first) tids.push({ from: b.x + c.x + c.w / 2, block: first[0] });
      });
  const blocks = [...new Set(tids.map((t) => t.block))].sort((a, b) => a - b);
  const HEAP_Y = L.H + 40;
  const H = heap && blocks.length ? HEAP_Y + 30 : L.H;
  const natural = L.W;
  const scale = Math.min(maxScale, cw / Math.max(1, natural));
  const minScale = 0.62;
  const s = Math.max(scale, minScale);
  const span = natural - GUTTER - 4;
  const bw = Math.min(70, span / Math.max(1, blocks.length) - 8);
  const bx = (i: number) => GUTTER + i * (span / Math.max(1, blocks.length)) + (span / Math.max(1, blocks.length) - bw) / 2;

  return (
    <div ref={wrap} className="min-w-0 overflow-x-auto">
      <svg width={natural * s} height={H * s} viewBox={`0 0 ${natural} ${H}`} className="mx-auto block" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={describeBTree(view)}>
        <Heads id={id} tones={["ref", "hot"]} />
        {/* child pointers, from the gaps between separators */}
        {L.boxes.map((b) => {
          if (!b.n?.kids) return null;
          const keyCells = b.cells.filter((c) => c.kind !== "high");
          const lastKey = keyCells[keyCells.length - 1];
          const out: ReactNode[] = [];
          let hidden = false;
          b.n.kids.forEach((kid, j) => {
            const k = L.byId?.get(kid);
            if (!k) {
              hidden = true;
              return;
            }
            // gap j sits just before key j; gap 0 is the left edge, the last gap the right edge
            const c = keyCells.find((x) => x.i === j);
            // a separator folded into "… n more": the pointer leaves from that cell instead, so a
            // visible child (one on the search path, most often) never loses its arrow
            const folded = keyCells.find((x) => x.kind === "more");
            const gx = j === 0 ? b.x + 5 : c ? b.x + c.x : j >= b.n!.keys.length ? b.x + lastKey.x + lastKey.w - 5 : folded ? b.x + folded.x + folded.w / 2 : NaN;
            if (Number.isNaN(gx)) return;
            const onPath = step.has(`${b.id}>${kid}`);
            const tx = k.x + k.w / 2;
            const y1 = b.y + CELL_H;
            const y2 = k.y - 2;
            out.push(
              <path
                key={`${b.id}-${j}`}
                d={`M${gx} ${y1} C${gx} ${y1 + LEVEL_GAP * 0.5}, ${tx} ${y2 - LEVEL_GAP * 0.5}, ${tx} ${y2}`}
                fill="none"
                stroke={onPath ? "var(--hot)" : "var(--ref)"}
                strokeWidth={onPath ? 1.75 : 1}
                opacity={onPath ? 1 : 0.55}
                markerEnd={`url(#${headId(id, onPath ? "hot" : "ref")})`}
              />,
            );
          });
          // pointers into a folded run of pages: one dashed line from the folded keys
          const gapBox = hidden ? L.boxes.find((g) => g.gap && Math.abs(g.y - (b.y + CELL_H + LEVEL_GAP)) < 2) : undefined;
          const more = keyCells.find((c) => c.kind === "more");
          if (gapBox) {
            const gx = b.x + (more ? more.x + more.w / 2 : b.w / 2);
            const tx = gapBox.x + gapBox.w / 2;
            const y1 = b.y + CELL_H;
            const y2 = gapBox.y - 2;
            out.push(<path key={`${b.id}-gap`} d={`M${gx} ${y1} C${gx} ${y1 + LEVEL_GAP * 0.5}, ${tx} ${y2 - LEVEL_GAP * 0.5}, ${tx} ${y2}`} fill="none" stroke="var(--ref)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />);
          }
          return out;
        })}
        {/* right-sibling links */}
        {L.boxes.map((b) => {
          const r = b.n?.right ? L.byId?.get(b.n.right) : undefined;
          // a folded run of pages still links on to the next drawn page
          if (!b.n?.right && !(b.gap && L.boxes.some((g) => g.y === b.y && g.x > b.x))) return null;
          const next = r ?? L.boxes.find((g) => g.y === b.y && g.x > b.x);
          if (!next) return null;
          const y = b.y + CELL_H / 2;
          const walked = !!r && step.has(`${b.id}>${r.id}`);
          return <path key={`r-${b.id}`} d={`M${b.x + b.w + 1} ${y} L${next.x - 3} ${y}`} stroke={walked ? "var(--hot)" : "var(--ref)"} strokeWidth={walked ? 1.75 : 0.9} opacity={walked ? 1 : 0.6} markerEnd={`url(#${headId(id, walked ? "hot" : "ref")})`} />;
        })}
        {/* pages */}
        {L.boxes.map((b) => {
          const on = path.has(b.id);
          const split = view.split === b.id;
          return (
            <g key={b.id} transform={`translate(${b.x} ${b.y})`} style={{ transition: "transform 240ms var(--ease)" }}>
              <rect
                x={0.5}
                y={0.5}
                width={b.w - 1}
                height={CELL_H - 1}
                rx={4}
                fill={b.gap ? "none" : "var(--bg)"}
                stroke={on || split ? "var(--hot)" : b.gap ? "var(--line-2)" : "var(--line-2)"}
                strokeWidth={on || split ? 1.5 : 1}
                strokeDasharray={b.gap ? "3 3" : split ? "4 2" : undefined}
              />
              {b.cells.map((c, i) => {
                const isHit = c.kind === "key" && hit !== undefined && String(c.key) === hit;
                const rng = c.kind === "key" && inRange(c.key) && b.n?.level === 0;
                const dead = c.kind === "key" && c.i !== undefined && b.n?.dead?.[c.i];
                const fill: string | undefined = isHit ? tint("hot", 20) : rng ? tint("live", 16) : undefined;
                const color: Ink | "faint" = isHit ? "hot" : c.kind === "high" ? "meta" : c.kind === "more" ? "faint" : dead ? "dead" : rng ? "live" : "ink";
                return (
                  <g key={i}>
                    {fill && <rect x={c.x + 1.5} y={1.5} width={c.w - 3} height={CELL_H - 3} rx={2.5} fill={fill} />}
                    {i > 0 && <line x1={c.x} y1={c.kind === "high" ? 2 : 6} x2={c.x} y2={c.kind === "high" ? CELL_H - 2 : CELL_H - 6} stroke={c.kind === "high" ? "var(--meta)" : "var(--line-2)"} strokeWidth={c.kind === "high" ? 1 : 0.8} />}
                    <text
                      x={c.x + c.w / 2}
                      y={CELL_H / 2 + 4}
                      textAnchor="middle"
                      fontSize={c.kind === "more" ? 10.5 : 12}
                      fill={tv(color)}
                      fontStyle={c.kind === "high" ? "italic" : undefined}
                      textDecoration={dead ? "line-through" : undefined}
                    >
                      {c.full && c.full !== c.text ? <title>{c.full}</title> : null}
                      {c.text}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* level labels */}
        {Array.from({ length: L.levels }, (_, li) => (
          <text key={li} x={0} y={4 + li * (CELL_H + LEVEL_GAP) + CELL_H / 2 + 3.5} fontSize={9.5} fill="var(--faint)">
            {li === 0 ? (
              L.levels > 1 ? (
                "root"
              ) : (
                // a lone root is also the only leaf: two short lines fit the gutter
                <>
                  <tspan x={0} dy={-5}>
                    root,
                  </tspan>
                  <tspan x={0} dy={11}>
                    a leaf
                  </tspan>
                </>
              )
            ) : li === L.levels - 1 ? (
              "leaves"
            ) : (
              `level ${L.levels - 1 - li}`
            )}
          </text>
        ))}
        {/* heap */}
        {heap && blocks.length > 0 && (
          <g>
            {tids.map((t, i) => {
              const bi = blocks.indexOf(t.block);
              const x2 = bx(bi) + bw / 2;
              return <path key={i} d={`M${t.from} ${L.H - 4} C${t.from} ${L.H + 16}, ${x2} ${HEAP_Y - 18}, ${x2} ${HEAP_Y - 2}`} fill="none" stroke="var(--ref)" strokeWidth={0.8} opacity={0.35} />;
            })}
            {blocks.map((blk, i) => (
              <g key={blk} transform={`translate(${bx(i)} ${HEAP_Y})`}>
                <rect x={0.5} y={0.5} width={bw - 1} height={22} rx={3} fill="var(--well-2)" stroke="var(--line-2)" />
                <text x={bw / 2} y={15} textAnchor="middle" fontSize={10.5} fill="var(--ink)">
                  heap {blk}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

const DEFAULT_PRESETS = [
  { label: "1 to 14, in order", keys: Array.from({ length: 14 }, (_, i) => i + 1) },
  { label: "the same 14, shuffled", keys: [8, 3, 11, 1, 14, 6, 9, 2, 13, 5, 10, 7, 4, 12] },
];

type LabOp = { op: "insert" | "search"; k: number } | { op: "range"; lo: number; hi: number };

function Lab({ order, rules: rules0, presets = DEFAULT_PRESETS, ops: allowed = ["insert", "search", "range"] }: NonNullable<BTreeProps["lab"]>) {
  const [rules, setRules] = useState<BTreeRules>(rules0 ?? "textbook");
  const [ops, setOps] = useState<LabOp[]>(() => presets[0].keys.map((k) => ({ op: "insert" as const, k })));
  const [text, setText] = useState("");
  const steps = useMemo(() => btreeSteps(ops, { order, rules }), [ops, order, rules]);
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 1300, start: 0 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  const v = cur.view;
  const leaves = Object.values(v.nodes).filter((n) => n.level === 0);
  const keys = leaves.reduce((a, n) => a + n.keys.length, 0);
  const height = (v.nodes[v.root]?.level ?? 0) + 1;
  const end = steps[steps.length - 1].view;
  const finalLevels = (end.nodes[end.root]?.level ?? 0) + 1;

  const apply = (next: LabOp[]) => {
    const before = steps.length;
    setOps(next);
    // jump to the first step of what was just added
    requestAnimationFrame(() => s.go(before));
  };
  const parse = () => text.trim().match(/^(-?\d+)\s*(?:\.\.|-|to)\s*(-?\d+)$/);
  const run = (op: "insert" | "search" | "range") => {
    const r = parse();
    if (op === "range") {
      if (!r) return;
      apply([...ops, { op: "range", lo: Number(r[1]), hi: Number(r[2]) }]);
    } else {
      const k = parseInt(text, 10);
      if (Number.isNaN(k)) return;
      apply([...ops, { op, k: Math.max(-999, Math.min(9999, k)) }]);
    }
    setText("");
  };
  return (
    <div {...s.keys} className="grid min-w-0 gap-4 outline-none grid-cols-[minmax(0,1fr)]" aria-label="b-tree lab">
      <div>
        <Row k="rules =" w="9ch">
          <Words label="split rules" options={[{ v: "textbook", label: "textbook" }, { v: "nbtree", label: "postgres nbtree" }]} value={rules} onChange={(r) => (setRules(r), s.go(0))} />
        </Row>
        <Row k="keys =" w="9ch">
          {presets.map((p) => (
            <button key={p.label} type="button" className="word" aria-pressed={ops.length === p.keys.length && ops.every((o, i) => o.op === "insert" && o.k === p.keys[i])} onClick={() => (setOps(p.keys.map((k) => ({ op: "insert", k }))), s.go(0))}>
              {p.label}
            </button>
          ))}
        </Row>
        <Row k="key =" w="9ch" last>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.\-to ]/g, "").slice(0, 12))}
            onKeyDown={(e) => e.key === "Enter" && run(parse() ? "range" : "insert")}
            className="mr-1 w-[10ch] border-b border-line-2 bg-transparent py-1 text-13 text-hi outline-none focus:border-hi"
            inputMode="numeric"
            aria-label="a key, or a range like 3..9"
            placeholder="17 or 3..9"
          />
          {allowed.includes("insert") && (
            <button type="button" className="act" onClick={() => run("insert")} disabled={!text || !!parse()}>
              insert
            </button>
          )}
          {allowed.includes("search") && (
            <button type="button" className="act" onClick={() => run("search")} disabled={!text || !!parse()}>
              search
            </button>
          )}
          {allowed.includes("range") && (
            <button type="button" className="act" onClick={() => run("range")} disabled={!parse()}>
              scan range
            </button>
          )}
        </Row>
      </div>
      <div style={{ minHeight: finalLevels * 84 }}>
        <BTreeDiagram view={v} collapse={order + 2} pageCollapse={12} />
      </div>
      <div className="text-11 text-mute tabular">
        height <span className="text-hi">{height}</span> <span className="text-faint">·</span> leaves <span className="text-hi">{leaves.length}</span> <span className="text-faint">·</span> keys{" "}
        <span className="text-hi">{keys}</span> <span className="text-faint">·</span> full leaves{" "}
        <span className="text-hi">{leaves.length ? Math.round((keys / (leaves.length * order)) * 100) : 0}%</span>
      </div>
      <Narration minLines={3} tag={cur.label}>
        {cur.note}
      </Narration>
      <StepControls s={s} compact={reduce} />
      <Provenance sim={`model of a B+tree, ${rules === "nbtree" ? "postgres split rules" : "textbook rules"}, ${order} keys a page`} checked={rules === "nbtree"} />
    </div>
  );
}

type BTreeProps = Partial<Source<BTreeView>> & {
  lab?: { order: number; presets?: { label: string; keys: number[] }[]; ops?: ("insert" | "search" | "delete" | "range")[]; rules?: BTreeRules };
  heap?: boolean;
  /** keys per page before folding into "… n more" */
  collapse?: number;
  /** pages per level before folding */
  pageCollapse?: number;
  legend?: boolean;
  caption?: ReactNode;
};

export function BTree(props: BTreeProps) {
  if (props.lab) return <div className="@container min-w-0 text-12">{<Lab {...props.lab} />}</div>;
  return <Captured {...props} />;
}

/** legend entries for what these views actually draw, nothing more */
function legendFor(views: BTreeView[]): LegendItem[] {
  const nodes = views.flatMap((v) => Object.values(v.nodes));
  const kids = nodes.some((n) => n.kids?.length);
  const sibs = nodes.some((n) => n.right);
  const items: LegendItem[] = [];
  if (kids || sibs) items.push(["ref", kids && sibs ? "child and sibling links" : kids ? "child links" : "sibling links", "line"]);
  if (nodes.some((n) => n.high !== undefined)) items.push(["meta", "high key"]);
  if (views.some((v) => v.path?.length)) items.push(["hot", "search path"]);
  if (views.some((v) => v.range)) items.push(["live", "keys in the range"]);
  if (nodes.some((n) => n.dead?.some(Boolean))) items.push(["dead", "dead index entry"]);
  return items;
}

function Captured(props: BTreeProps) {
  const src = props as Source<BTreeView>;
  const trace = "trace" in props ? traceOf(src) : undefined;
  const steps = useMemo(
    () => stepsOf(src, (t, i, sel) => traceBTree(t, i, sel ?? Object.keys(t.rels).find((r) => t.rels[r].am === "btree") ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ["view" in props ? props.view : null, "steps" in props ? props.steps : null, "trace" in props ? props.trace : null, "select" in props ? props.select : null],
  );
  const reduce = useReducedMotion();
  const s = useStepper(Math.max(1, steps.length), { interval: 1600 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  if (!cur) return null;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="b-tree">
      {cur.label && steps.length > 1 ? <StepSql label={cur.label} /> : null}
      <BTreeDiagram view={cur.view} heap={props.heap} collapse={props.collapse ?? 5} pageCollapse={props.pageCollapse ?? 3} />
      {props.legend !== false && legendFor(steps.map((x) => x.view)).length > 0 && <Legend items={legendFor(steps.map((x) => x.view))} />}
      {cur.note ? <Narration minLines={2}>{cur.note}</Narration> : null}
      {steps.length > 1 && <StepControls s={s} compact={reduce} />}
      {trace ? <Provenance trace={trace} /> : null}
    </div>
  );
}
