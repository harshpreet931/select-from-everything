"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Words, fmt, tint, useWidth } from "@/components/figures/kit";

// the free space map's trick, drawn small: one leaf per heap page holding its free space (the
// real pg_freespace values from the capture), and above them a binary tree where every node
// holds the max of its two children. "a page with 232 bytes free?" is answered at the root,
// then by walking down toward a child that has enough. a real fsm page holds about 4,000
// leaves this way, and a fixed 3 levels of such pages cover a whole table. the real search
// also starts from a rotating slot so concurrent inserts spread out; this model doesn't.

export type FsmLeaf = { blkno: number; avail: number };

function build(leaves: FsmLeaf[]) {
  let n = 1;
  while (n < leaves.length) n *= 2;
  const levels: number[][] = [];
  let cur = Array.from({ length: n }, (_, i) => leaves[i]?.avail ?? 0);
  levels.unshift(cur);
  while (cur.length > 1) {
    const up: number[] = [];
    for (let i = 0; i < cur.length; i += 2) up.push(Math.max(cur[i], cur[i + 1]));
    levels.unshift(up);
    cur = up;
  }
  return levels; // levels[0] = [root]
}

function search(levels: number[][], need: number): { path: [number, number][]; found: number | null } {
  if (levels[0][0] < need) return { path: [[0, 0]], found: null };
  const path: [number, number][] = [[0, 0]];
  let i = 0;
  for (let d = 1; d < levels.length; d++) {
    const l = 2 * i;
    i = levels[d][l] >= need ? l : l + 1;
    path.push([d, i]);
  }
  return { path, found: i };
}

export function FsmTree({ leaves, needs, source }: { leaves: FsmLeaf[]; needs: number[]; source: { engine: { version: string; build?: string }; scenario: string } }) {
  const [need, setNeed] = useState(needs[0]);
  const [wrap, w] = useWidth<HTMLDivElement>(640);
  const levels = build(leaves);
  const { path, found } = search(levels, need);
  const onPath = new Set(path.map(([d, i]) => `${d}:${i}`));
  const W = Math.max(300, w);
  const depth = levels.length;
  const rowH = 46;
  const H = depth * rowH + 18;
  const nodeW = Math.min(64, (W / levels[depth - 1].length) * 0.86);
  // narrow screens: 8,160 becomes 8.2k so a leaf's number fits its box
  const label = (v: number) => (nodeW < 40 && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v));
  const x = (d: number, i: number) => ((i + 0.5) / levels[d].length) * W;
  const y = (d: number) => d * rowH + 14;
  const leaf = found != null ? leaves[found] : undefined;
  return (
    <div ref={wrap} className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <Row k="need =" w="7ch" last>
        <Words label="bytes the new row needs" options={needs.map((n) => ({ v: n, label: `${fmt(n)} B` }))} value={need} onChange={setNeed} />
      </Row>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block overflow-visible" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={`free space map tree; a ${need} byte request ${found != null ? `lands on page ${leaves[found]?.blkno}` : "finds no page"}`}>
        {levels.map((lv, d) =>
          d === 0
            ? null
            : lv.map((_, i) => (
                <line key={`e${d}-${i}`} x1={x(d - 1, i >> 1)} y1={y(d - 1) + 11} x2={x(d, i)} y2={y(d) - 11} stroke={onPath.has(`${d}:${i}`) && onPath.has(`${d - 1}:${i >> 1}`) ? "var(--hot)" : "var(--line-2)"} strokeWidth={onPath.has(`${d}:${i}`) ? 1.5 : 1} />
              )),
        )}
        {levels.map((lv, d) =>
          lv.map((v, i) => {
            const isLeaf = d === depth - 1;
            const real = isLeaf ? leaves[i] : undefined;
            const hit = isLeaf && found === i;
            const lit = onPath.has(`${d}:${i}`);
            if (isLeaf && !real) return null;
            return (
              <g key={`${d}-${i}`}>
                <rect
                  x={x(d, i) - nodeW / 2}
                  y={y(d) - 11}
                  width={nodeW}
                  height={22}
                  rx={4}
                  fill={hit ? tint("live", 18) : isLeaf ? "var(--bg)" : tint("meta", 8)}
                  stroke={hit ? "var(--live)" : lit ? "var(--hot)" : isLeaf ? "var(--line-2)" : "var(--meta)"}
                  strokeOpacity={lit || hit ? 1 : 0.6}
                  strokeWidth={lit || hit ? 1.5 : 1}
                />
                <text x={x(d, i)} y={y(d) + 4} textAnchor="middle" fontSize={nodeW < 44 ? 9 : 11} fill={v >= need ? "var(--hi)" : "var(--faint)"}>
                  {label(v)}
                </text>
                {isLeaf && (
                  <text x={x(d, i)} y={y(d) + 24} textAnchor="middle" fontSize={9.5} fill="var(--faint)">
                    p{real!.blkno}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <Narration minLines={2}>
        {found == null
          ? `the root says the best page has ${fmt(levels[0][0])} bytes free, less than ${fmt(need)}. one look and the answer is no: the table grows a new page instead.`
          : `the root says some page has ${fmt(levels[0][0])} bytes free, enough for ${fmt(need)}. at each level the walk takes a child that still has enough, and ends at page ${leaf?.blkno}: ${fmt(leaf?.avail ?? 0)} bytes. ${depth - 1} steps down, no page read.`}
      </Narration>
      <Legend
        items={[
          ["meta", "inner node: max of its two children"],
          ["hot", "the walk down"],
          ["live", "the page it picks"],
        ]}
      />
      <Provenance trace={source} />
      <div className="-mt-2 text-right text-[10px] text-faint">the tree is a model of one fsm page; the leaf values are pg_freespace()</div>
    </div>
  );
}

