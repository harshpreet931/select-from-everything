"use client";

import { useEffect, useRef, useState } from "react";

/**
 * the opener: a b+tree turning slowly in the air, in wireframe. a lookup drops in at the root,
 * follows the search path down to a leaf, follows the leaf's ctid to a heap page, and the row it
 * finds rises back out the top. then the next key. sql, all the way down.
 *
 * colours keep their one meaning: ref = the tree's links and pages, hot = the lookup in flight,
 * live = the row that comes back. pure svg, recomputed per frame; one still frame when reduced
 * motion is on.
 */

const W = 420;
const H = 320;
const CX = W / 2;
const FLAT = 0.24; // how much the rings are squashed: the camera looks down a little
const SPIN_MS = 52000; // one full turn
const LOOP_MS = 5600; // one lookup

const ROOT_Y = 22;
const INNER_Y = 84;
const LEAF_Y = 146;
const HEAP_Y = 250;
const INNER_R = 92;
const LEAF_R = 166;
const HEAP_R = 186;
const PAGES = 12;

type Node = { id: string; level: 0 | 1 | 2; ang: number; r: number; y: number; w: number; keys: number; parent?: string };

const NODES: Node[] = (() => {
  const out: Node[] = [{ id: "r", level: 0, ang: 0, r: 0, y: ROOT_Y, w: 68, keys: 2 }];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    out.push({ id: `i${i}`, level: 1, ang: a, r: INNER_R, y: INNER_Y, w: 50, keys: 2, parent: "r" });
    for (let j = 0; j < 3; j++) {
      out.push({ id: `l${i}${j}`, level: 2, ang: a + ((j - 1) * Math.PI * 2) / 9, r: LEAF_R, y: LEAF_Y, w: 36, keys: 3, parent: `i${i}` });
    }
  }
  return out;
})();
const BY_ID = new Map(NODES.map((n) => [n.id, n]));
const LEAVES = NODES.filter((n) => n.level === 2); // in key order: l00 l01 l02 l10 ... l22
const ORDER = [4, 0, 7, 2, 5, 8, 1, 6, 3]; // which leaf each lookup lands on, so it wanders
const pageOf = (leaf: number) => (leaf * 5 + 2) % PAGES; // a ctid can point anywhere in the heap

type Pt = { x: number; y: number; depth: number; sc: number };

function proj(r: number, ang: number, y: number, spin: number): Pt {
  const a = ang + spin;
  const z = Math.sin(a) * r; // > 0 is the near side
  const depth = r === 0 ? 0 : z / HEAP_R; // -1 far .. 1 near
  return { x: CX + Math.cos(a) * r, y: y + z * FLAT, depth, sc: 1 + depth * 0.12 };
}

const fade = (d: number) => 0.32 + 0.68 * ((d + 1) / 2); // far things are fainter
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (v: number) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
const lerp = (a: number, b: number, v: number) => a + (b - a) * v;

const NODE_H = 14;

function ellipse(r: number, y: number) {
  const ry = r * FLAT;
  return `M ${CX - r} ${y} a ${r} ${ry} 0 1 0 ${r * 2} 0 a ${r} ${ry} 0 1 0 ${-r * 2} 0`;
}

export function IndexTree({ className }: { className?: string }) {
  const [clock, setClock] = useState<{ spin: number; t: number; n: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setClock({ spin: 0.5, t: 0.7, n: 0 });
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const ms = Math.max(0, now - start); // a rAF timestamp can be a hair earlier than `start`
      setClock({ spin: ((ms / SPIN_MS) % 1) * Math.PI * 2, t: (ms % LOOP_MS) / LOOP_MS, n: Math.floor(ms / LOOP_MS) });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // first paint (server and before the effect): a still frame, so nothing jumps
  const { spin, t, n } = clock ?? { spin: 0.5, t: 0.7, n: 0 };

  const pos = new Map(NODES.map((nd) => [nd.id, proj(nd.r, nd.ang, nd.y, spin)]));
  const pages = Array.from({ length: PAGES }, (_, k) => proj(HEAP_R, (k / PAGES) * Math.PI * 2 + 0.26, HEAP_Y, spin));

  // the lookup: root → inner → leaf → heap page, then the row rises
  const leafIdx = ORDER[n % ORDER.length];
  const leaf = LEAVES[leafIdx];
  const inner = BY_ID.get(leaf.parent!)!;
  const page = pageOf(leafIdx);
  const P = { r: pos.get("r")!, i: pos.get(inner.id)!, l: pos.get(leaf.id)!, p: pages[page] };
  const bottom = (p: Pt) => ({ x: p.x, y: p.y + (NODE_H / 2) * p.sc });
  const top = (p: Pt) => ({ x: p.x, y: p.y - (NODE_H / 2) * p.sc });

  const s0 = ease(seg(t, 0.0, 0.1)); // drop in above the root
  const s1 = ease(seg(t, 0.1, 0.3)); // root → inner
  const s2 = ease(seg(t, 0.3, 0.48)); // inner → leaf
  const s3 = ease(seg(t, 0.48, 0.64)); // leaf → heap page, along the ctid
  const s5 = ease(seg(t, 0.74, 1)); // the row rises
  const settle = 1 - seg(t, 0.9, 1); // highlights let go at the end

  let dot: { x: number; y: number } | null = null;
  if (t < 0.1) dot = { x: P.r.x, y: lerp(ROOT_Y - 30, top(P.r).y, s0) };
  else if (t < 0.3) dot = { x: lerp(bottom(P.r).x, top(P.i).x, s1), y: lerp(bottom(P.r).y, top(P.i).y, s1) };
  else if (t < 0.48) dot = { x: lerp(bottom(P.i).x, top(P.l).x, s2), y: lerp(bottom(P.i).y, top(P.l).y, s2) };
  else if (t < 0.64) dot = { x: lerp(bottom(P.l).x, P.p.x, s3), y: lerp(bottom(P.l).y, P.p.y - 10 * P.p.sc, s3) };

  const hotNode = (id: string) =>
    settle * (id === "r" ? (t >= 0.1 ? 1 : 0) : id === inner.id ? (t >= 0.3 ? 1 : 0) : id === leaf.id ? (t >= 0.48 ? 1 : 0) : 0);
  const pageHot = settle * (t >= 0.64 ? 1 : 0);
  const ptr = t >= 0.48 ? (t < 0.64 ? s3 : 1) * settle : 0;

  // the row that comes back: from the page, up past the root, fading out
  const row =
    t >= 0.74
      ? { x: lerp(P.p.x, CX, s5), y: lerp(P.p.y - 6, ROOT_Y - 26, s5), a: Math.sin(Math.PI * Math.min(1, s5 * 1.15)) }
      : null;

  // draw order: rings, edges and links, then nodes and pages far to near, then the lookup on top
  const edges = NODES.filter((nd) => nd.parent).map((nd) => {
    const a = bottom(pos.get(nd.parent!)!);
    const p = pos.get(nd.id)!;
    const b = top(p);
    const onPath = nd.id === inner.id || nd.id === leaf.id;
    return { key: nd.id, a, b, depth: p.depth, onPath };
  });
  const links = LEAVES.slice(0, -1).map((lf, k) => ({ key: lf.id, a: pos.get(lf.id)!, b: pos.get(LEAVES[k + 1].id)! }));

  type Item = { depth: number; el: React.ReactNode };
  const items: Item[] = [
    ...NODES.map((nd) => {
      const p = pos.get(nd.id)!;
      const w = nd.w * p.sc;
      const h = NODE_H * p.sc;
      const heat = hotNode(nd.id);
      return {
        depth: p.depth,
        el: (
          <g key={nd.id} opacity={fade(p.depth)}>
            <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={2} fill="var(--bg)" stroke={heat > 0.01 ? "var(--hot)" : "var(--ref)"} strokeWidth={heat > 0.01 ? 1.2 : 0.9} />
            {Array.from({ length: nd.keys - 1 }, (_, k) => {
              const x = p.x - w / 2 + (w * (k + 1)) / nd.keys;
              return <path key={k} d={`M ${x} ${p.y - h / 2 + 2.5} V ${p.y + h / 2 - 2.5}`} strokeWidth={0.7} />;
            })}
          </g>
        ),
      };
    }),
    ...pages.map((p, k) => {
      const w = 15 * p.sc;
      const h = 20 * p.sc;
      const lit = k === page ? pageHot : 0;
      return {
        depth: p.depth,
        el: (
          <g key={`p${k}`} opacity={fade(p.depth)}>
            <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={1.5} fill="var(--bg)" stroke={lit > 0.01 ? "var(--hot)" : "var(--ref)"} strokeWidth={lit > 0.01 ? 1.2 : 0.8} />
            {[0, 1, 2].map((r) => (
              <path key={r} d={`M ${p.x - w / 2 + 3} ${p.y - h / 2 + 4 + r * 3.2 * p.sc} h ${w * 0.38}`} strokeWidth={0.6} />
            ))}
            <rect
              x={p.x - w / 2 + 3}
              y={p.y + h / 2 - 7 * p.sc}
              width={w - 6}
              height={4 * p.sc}
              strokeWidth={0.6}
              stroke={lit > 0.01 ? "var(--hot)" : "var(--ref)"}
              fill={lit > 0.01 ? "var(--hot)" : "none"}
              fillOpacity={0.25 * lit}
            />
          </g>
        ),
      };
    }),
  ].sort((a, b) => a.depth - b.depth);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="a wireframe b-tree turning slowly. a lookup follows the search path from the root to a leaf, then the leaf's pointer to a heap page, and the row it finds rises back out"
      fill="none"
      stroke="var(--ref)"
      strokeWidth={0.8}
    >
      {/* the levels, as faint orbits */}
      <path d={ellipse(INNER_R, INNER_Y)} opacity={0.12} />
      <path d={ellipse(LEAF_R, LEAF_Y)} opacity={0.12} strokeDasharray="2 4" />
      <path d={ellipse(HEAP_R + 14, HEAP_Y)} opacity={0.16} />
      <path d={ellipse(HEAP_R - 14, HEAP_Y)} opacity={0.1} />

      {edges.map((e) => (
        <path
          key={e.key}
          d={`M ${e.a.x} ${e.a.y} L ${e.b.x} ${e.b.y}`}
          opacity={fade(e.depth) * 0.7}
          stroke={e.onPath && settle > 0.01 && ((e.key === inner.id && t >= 0.1) || (e.key === leaf.id && t >= 0.3)) ? "var(--hot)" : "var(--ref)"}
        />
      ))}
      {links.map((l) => (
        <path key={l.key} d={`M ${l.a.x} ${l.a.y} L ${l.b.x} ${l.b.y}`} opacity={fade((l.a.depth + l.b.depth) / 2) * 0.45} strokeDasharray="1.5 2.5" />
      ))}

      {items.map((it) => it.el)}

      {/* the lookup: the leaf's ctid to the page, the search in flight, the row coming back */}
      {ptr > 0 && (
        <path
          d={`M ${bottom(P.l).x} ${bottom(P.l).y} L ${lerp(bottom(P.l).x, P.p.x, ptr)} ${lerp(bottom(P.l).y, P.p.y - 10 * P.p.sc, ptr)}`}
          stroke="var(--hot)"
          strokeDasharray="3 2.5"
          strokeWidth={1}
        />
      )}
      {dot && <circle cx={dot.x} cy={dot.y} r={3} fill="var(--hot)" stroke="none" opacity={t < 0.1 ? s0 : 1} />}
      {row && (
        <g opacity={row.a} stroke="var(--live)" strokeWidth={0.9}>
          <rect x={row.x - 21} y={row.y - 5} width={42} height={10} rx={1.5} fill="var(--bg)" />
          <path d={`M ${row.x - 7} ${row.y - 5} V ${row.y + 5} M ${row.x + 7} ${row.y - 5} V ${row.y + 5}`} />
        </g>
      )}
    </svg>
  );
}
