"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Row, Words, useReducedMotion, type LegendItem } from "@/components/figures/kit";
import { hashUint32 } from "@/lib/db/sim/hash";

// nearest neighbours, approximately, on 2-d points you can see. a model, simplified, with
// the shapes of the two pgvector index types:
//   hnsw: each point gets a top layer from a seeded draw (fewer points on each layer up),
//         each layer links every point to its M nearest on that layer. a search starts at the
//         top entry point, walks greedily toward the query, drops a layer, and at the bottom
//         runs a best-first search with a candidate list of ef. (pgvector's defaults:
//         m = 16, ef_construction = 64, hnsw.ef_search = 40.)
//   ivf:  points are assigned to the nearest of `lists` centroids (a few k-means rounds);
//         a search compares the query to the centroids and scans only the `probes` nearest
//         lists. (pgvector: lists ≈ rows / 1000, ivfflat.probes defaults to 1.)
// the real graph and centroids are built from real vectors in many dimensions; this is the
// idea at a size you can follow, and it says "model".

type P = { id: number; x: number; y: number; level: number };
const N = 70;
const M = 3;
const K = 3;
const LISTS = 6;

const unit = (k: number) => hashUint32(k) / 4294967296;
const POINTS: P[] = Array.from({ length: N }, (_, i) => {
  const u = Math.max(1e-9, unit(i * 7 + 3));
  return { id: i, x: 4 + unit(i * 7 + 1) * 92, y: 4 + unit(i * 7 + 2) * 92, level: Math.min(3, Math.floor(-Math.log(u) / Math.log(4))) };
});
const QUERIES = [
  { label: "query A", x: 30, y: 62 },
  { label: "query B", x: 71, y: 28 },
  { label: "query C", x: 52, y: 50 },
];
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const TOP = Math.max(...POINTS.map((p) => p.level));

function layerEdges(L: number): Map<number, number[]> {
  const nodes = POINTS.filter((p) => p.level >= L);
  const adj = new Map<number, Set<number>>(nodes.map((p) => [p.id, new Set<number>()]));
  for (const p of nodes) {
    const near = nodes.filter((q) => q.id !== p.id).sort((a, b) => d2(p, a) - d2(p, b) || a.id - b.id).slice(0, M);
    for (const q of near) {
      adj.get(p.id)!.add(q.id);
      adj.get(q.id)!.add(p.id);
    }
  }
  return new Map([...adj].map(([k, v]) => [k, [...v]]));
}
const LAYERS = Array.from({ length: TOP + 1 }, (_, L) => layerEdges(L));

type HStep = { layer: number; cur: number; visited: number[]; result?: number[]; note: string };

function hnswSearch(q: { x: number; y: number }, ef: number): HStep[] {
  const steps: HStep[] = [];
  let cur = POINTS.filter((p) => p.level === TOP).sort((a, b) => a.id - b.id)[0].id;
  const visited = new Set<number>([cur]);
  steps.push({ layer: TOP, cur, visited: [...visited], note: `start at the entry point, on the top layer (${TOP}). only a few points reach this high, so the links here are long jumps.` });
  for (let L = TOP; L > 0; L--) {
    for (;;) {
      const nb = LAYERS[L].get(cur) ?? [];
      nb.forEach((n) => visited.add(n));
      const best = [...nb].sort((a, b) => d2(POINTS[a], q) - d2(POINTS[b], q))[0];
      if (best === undefined || d2(POINTS[best], q) >= d2(POINTS[cur], q)) break;
      cur = best;
      steps.push({ layer: L, cur, visited: [...visited], note: `layer ${L}: of this point's neighbours, one is closer to the query, so move there. greedy, one hop at a time.` });
    }
    steps.push({ layer: L - 1, cur, visited: [...visited], note: `no neighbour on layer ${L} is closer: drop to layer ${L - 1}, where there are more points and shorter links, and carry on from here.` });
  }
  // layer 0: best-first with a candidate list of ef
  const cand = new Set<number>([cur]);
  const found = new Set<number>([cur]);
  const done = new Set<number>();
  for (;;) {
    const next = [...cand].filter((c) => !done.has(c)).sort((a, b) => d2(POINTS[a], q) - d2(POINTS[b], q))[0];
    if (next === undefined) break;
    const worst = [...found].sort((a, b) => d2(POINTS[b], q) - d2(POINTS[a], q))[0];
    if (found.size >= ef && d2(POINTS[next], q) > d2(POINTS[worst], q)) break;
    done.add(next);
    for (const n of LAYERS[0].get(next) ?? []) {
      visited.add(n);
      if (!found.has(n)) {
        found.add(n);
        cand.add(n);
        if (found.size > ef) {
          const w = [...found].sort((a, b) => d2(POINTS[b], q) - d2(POINTS[a], q))[0];
          found.delete(w);
          cand.delete(w);
        }
      }
    }
    steps.push({ layer: 0, cur: next, visited: [...visited], note: `layer 0: expand the closest unexpanded candidate and add its neighbours to a list that keeps the best ${ef} (ef). ${visited.size} of ${N} points looked at so far.` });
  }
  const result = [...found].sort((a, b) => d2(POINTS[a], q) - d2(POINTS[b], q)).slice(0, K);
  const exact = [...POINTS].sort((a, b) => d2(a, q) - d2(b, q)).slice(0, K).map((p) => p.id);
  const hit = result.filter((r) => exact.includes(r)).length;
  steps.push({
    layer: 0,
    cur: result[0],
    visited: [...visited],
    result,
    note: `nothing left that could beat the list: return the ${K} best. ${hit} of the true ${K} nearest (recall ${hit}/${K}), after looking at ${visited.size} of ${N} points.${hit < K ? " the missed one is ringed: the walk never got near it. a bigger ef would have." : ""}`,
  });
  return steps;
}

function ivf(q: { x: number; y: number }, probes: number) {
  let cents = POINTS.filter((_, i) => i % Math.floor(N / LISTS) === 0).slice(0, LISTS).map((p) => ({ x: p.x, y: p.y }));
  let assign: number[] = [];
  for (let r = 0; r < 6; r++) {
    assign = POINTS.map((p) => cents.map((c, i) => [d2(p, c), i]).sort((a, b) => a[0] - b[0])[0][1]);
    cents = cents.map((c, i) => {
      const mine = POINTS.filter((_, j) => assign[j] === i);
      return mine.length ? { x: mine.reduce((s, p) => s + p.x, 0) / mine.length, y: mine.reduce((s, p) => s + p.y, 0) / mine.length } : c;
    });
  }
  const order = cents.map((c, i) => [d2(c, q), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const probed = new Set(order.slice(0, probes));
  const scanned = POINTS.filter((_, j) => probed.has(assign[j]));
  const result = [...scanned].sort((a, b) => d2(a, q) - d2(b, q)).slice(0, K).map((p) => p.id);
  const exact = [...POINTS].sort((a, b) => d2(a, q) - d2(b, q)).slice(0, K).map((p) => p.id);
  return { cents, assign, probed, scanned: scanned.length, result, exact };
}

const S = 3.4;
const W = 100 * S;

export function VectorModel() {
  const [mode, setMode] = useState<"hnsw" | "ivf">("hnsw");
  const [qi, setQi] = useState(0);
  const [ef, setEf] = useState(2);
  const [probes, setProbes] = useState(1);
  const q = QUERIES[qi];
  const steps = useMemo(() => hnswSearch(q, ef), [q, ef]);
  const st = useStepper(steps.length, { interval: 1300 });
  const reduce = useReducedMotion();
  const h = steps[Math.min(st.i, steps.length - 1)];
  const iv = useMemo(() => ivf(q, probes), [q, probes]);
  const exact = useMemo(() => [...POINTS].sort((a, b) => d2(a, q) - d2(b, q)).slice(0, K).map((p) => p.id), [q]);
  const X = (v: number) => v * S;
  const Y = (v: number) => (100 - v) * S;
  const layer = mode === "hnsw" ? h.layer : 0;
  const visited = new Set(mode === "hnsw" ? h.visited : []);
  const result = mode === "hnsw" ? h.result : iv.result;
  const hitIvf = iv.result.filter((r) => iv.exact.includes(r)).length;
  return (
    <div {...st.keys} className="grid min-w-0 gap-3 text-12 outline-none" aria-label="approximate nearest neighbour search, a model">
      <div>
        <Row k="index =" w="9ch">
          <Words label="index type" options={[{ v: "hnsw", label: "HNSW graph" }, { v: "ivf", label: "IVF lists" }]} value={mode} onChange={(m) => (setMode(m), st.go(0))} />
        </Row>
        <Row k="query =" w="9ch">
          <Words label="query point" options={QUERIES.map((x, i) => ({ v: i, label: x.label }))} value={qi} onChange={(i) => (setQi(i), st.go(0))} />
        </Row>
        {mode === "hnsw" ? (
          <Row k="ef =" w="9ch" last>
            <Words label="ef" options={[1, 2, 4, 8].map((v) => ({ v, label: String(v) }))} value={ef} onChange={(v) => (setEf(v), st.go(0))} />
          </Row>
        ) : (
          <Row k="probes =" w="9ch" last>
            <Words label="probes" options={[1, 2, 3].map((v) => ({ v, label: String(v) }))} value={probes} onChange={setProbes} />
          </Row>
        )}
      </div>
      <svg viewBox={`-6 -6 ${W + 12} ${W + 12}`} className="mx-auto block h-auto w-full max-w-[380px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={mode === "hnsw" ? `HNSW model, layer ${layer}, ${visited.size} points visited` : `IVF model, ${LISTS} lists, ${probes} probed, ${iv.scanned} points scanned`}>
        <rect x={-4} y={-4} width={W + 8} height={W + 8} fill="none" stroke="var(--line-2)" rx={4} />
        {mode === "hnsw" &&
          [...(LAYERS[layer] ?? new Map()).entries()].flatMap(([a, ns]) =>
            ns.filter((b: number) => b > a).map((b: number) => <line key={`${a}-${b}`} x1={X(POINTS[a].x)} y1={Y(POINTS[a].y)} x2={X(POINTS[b].x)} y2={Y(POINTS[b].y)} stroke="var(--ref)" strokeWidth={0.8} opacity={0.35} />),
          )}
        {mode === "ivf" &&
          POINTS.map((p, j) => <line key={`a${p.id}`} x1={X(p.x)} y1={Y(p.y)} x2={X(iv.cents[iv.assign[j]].x)} y2={Y(iv.cents[iv.assign[j]].y)} stroke={iv.probed.has(iv.assign[j]) ? "var(--ref)" : "var(--line-2)"} strokeWidth={0.7} opacity={iv.probed.has(iv.assign[j]) ? 0.5 : 0.6} />)}
        {POINTS.map((p, j) => {
          const onLayer = mode === "ivf" || p.level >= layer;
          const isRes = result?.includes(p.id);
          const isCur = mode === "hnsw" && h.cur === p.id && !h.result;
          const seen = mode === "hnsw" ? visited.has(p.id) : iv.probed.has(iv.assign[j]);
          const missed = (mode === "ivf" || h.result) && exact.includes(p.id) && !result?.includes(p.id);
          return (
            <g key={p.id}>
              {missed && <circle cx={X(p.x)} cy={Y(p.y)} r={6.5} fill="none" stroke="var(--dead)" strokeDasharray="2 2" />}
              <circle
                cx={X(p.x)}
                cy={Y(p.y)}
                r={isRes || isCur ? 4.2 : onLayer ? 2.6 : 1.6}
                fill={isRes ? "var(--live)" : isCur ? "var(--hot)" : seen ? "var(--ref)" : "var(--mute)"}
                opacity={onLayer ? 1 : 0.3}
              />
            </g>
          );
        })}
        {mode === "ivf" && iv.cents.map((c, i) => <rect key={`c${i}`} x={X(c.x) - 4} y={Y(c.y) - 4} width={8} height={8} fill={iv.probed.has(i) ? "var(--meta)" : "var(--bg)"} stroke="var(--meta)" transform={`rotate(45 ${X(c.x)} ${Y(c.y)})`} />)}
        <g stroke="var(--hot)" strokeWidth={1.6}>
          <line x1={X(q.x) - 6} x2={X(q.x) + 6} y1={Y(q.y)} y2={Y(q.y)} />
          <line x1={X(q.x)} x2={X(q.x)} y1={Y(q.y) - 6} y2={Y(q.y) + 6} />
        </g>
      </svg>
      {mode === "hnsw" ? (
        <>
          <Narration minLines={3} tag={`layer ${h.layer}`}>
            {h.note}
          </Narration>
          <StepControls s={st} compact={reduce} />
        </>
      ) : (
        <Narration minLines={3} tag={`${probes} of ${LISTS} lists`}>
          {`compare the query with the ${LISTS} centroids (diamonds) and scan only the nearest ${probes === 1 ? "list" : `${probes} lists`}: ${iv.scanned} of ${N} points. ${hitIvf} of the true ${K} nearest found (recall ${hitIvf}/${K}).${hitIvf < K ? " the ringed one sits in a list nobody scanned, just over a border. more probes find it." : ""}`}
        </Narration>
      )}
      <Legend
        items={[
          ["hot", mode === "hnsw" ? "the query, the current point" : "the query"],
          ["ref", mode === "hnsw" ? "links on this layer, points looked at" : "points in probed lists"],
          ["live", "returned"],
          ["dead", "a true neighbour missed", "dashed"],
          ...(mode === "ivf" ? ([["meta", "centroids"]] as LegendItem[]) : []),
        ]}
      />
      <Provenance sim={mode === "hnsw" ? `model of an HNSW graph: ${N} points, ${M} links per point per layer, layers from a seeded draw` : `model of IVF: ${N} points in ${LISTS} lists from a few k-means rounds`} />
    </div>
  );
}
