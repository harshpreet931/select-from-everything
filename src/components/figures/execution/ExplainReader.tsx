import type { Capture } from "@/lib/db/captured";
import { ExplainReaderView, type ReaderNode } from "./ExplainReaderView";
import { fromExplainJson, misestimates, planNodes } from "@/lib/db/fromTrace";
import { planText, prov, tidy, topNode } from "./source";

// server side: one query captured twice in the same trace, as the text EXPLAIN postgres prints
// (`text`, with costs and actuals) and as EXPLAIN (FORMAT JSON) (`json`). the text gives every
// node its lines, the json its numbers. both list nodes in the same order (root first, then
// each child left to right), so node k of one is node k of the other. `notes` are one sentence
// per node, in that same order, for the "read it bottom-up" stepper.
//
//   <ExplainReader trace={trace} text={2} json={3} notes={["the Limit ...", ...]} />

type J = Record<string, unknown> & { Plans?: J[] };

export function ExplainReader({ trace, text, json, notes, start = "estimates" }: { trace: Capture; text: number; json: number; notes: string[]; start?: "estimates" | "actuals" }) {
  const lines = planText(trace, text).split("\n");
  // which text lines start a node: the first line, then every "->" line
  const starts = lines.flatMap((l, i) => (i === 0 || /^\s*->\s/.test(l) ? [i] : []));
  // the plan ends where the unindented summary starts (Planning:, Execution Time:). the figure
  // leaves the summary out: the planner's own buffer counts depend on what the capture ran
  // before (pgtrace creates its inspection extensions), the plan's don't
  const end = lines.findIndex((l, i) => i > 0 && /^\S/.test(l));
  const planEnd = end < 0 ? lines.length : end;
  const flat: J[] = [];
  const depth: number[] = [];
  const parent: number[] = [];
  const walk = (n: J, d: number, p: number) => {
    const k = flat.length;
    flat.push(n);
    depth.push(d);
    parent.push(p);
    for (const c of n.Plans ?? []) walk(c, d + 1, k);
  };
  walk(topNode(trace, json) as J, 0, -1);
  if (flat.length !== starts.length) throw new Error(`ExplainReader: ${flat.length} json nodes but ${starts.length} text nodes in ${trace.scenario}`);
  if (notes.length !== flat.length) throw new Error(`ExplainReader: ${flat.length} nodes but ${notes.length} notes`);
  // real misestimates (10x or more, nodes that ran to completion), by pre-order position
  const pn = planNodes(fromExplainJson(trace.steps[json].explain));
  const mis = misestimates(pn[0]);
  const nodes: ReaderNode[] = flat.map((n, k) => {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : planEnd;
    const head = lines[from].replace(/^\s*->\s+/, "").replace(/\s+\(cost=.*$/, "").replace(/\s+\(actual.*$/, "").trim();
    return {
      k,
      depth: depth[k],
      parent: parent[k],
      head,
      line: from,
      lines: Array.from({ length: to - from }, (_, j) => from + j),
      est: { startup: Number(n["Startup Cost"]), total: Number(n["Total Cost"]), rows: Number(n["Plan Rows"]), width: Number(n["Plan Width"]) },
      actual: n["Actual Rows"] != null ? { rows: Number(n["Actual Rows"]), loops: Number(n["Actual Loops"] ?? 1) } : undefined,
      note: notes[k],
      ...(mis.has(pn[k].id) ? { off: Math.round(mis.get(pn[k].id)!) } : {}),
    };
  });
  // reading order: a node after all of its children, i.e. post-order. children left to right,
  // except that a Hash goes first: a hash join builds its table before it streams the other side
  const order: number[] = [];
  const post = (k: number) => {
    const kids = nodes.filter((x) => x.parent === k);
    kids.sort((a, b) => Number(b.head === "Hash") - Number(a.head === "Hash")).forEach((c) => post(c.k));
    order.push(k);
  };
  post(0);
  return <ExplainReaderView start={start} sql={tidy(trace.steps[json].sql)} text={lines.slice(0, planEnd).join("\n")} nodes={nodes} order={order} source={prov(trace)} />;
}
