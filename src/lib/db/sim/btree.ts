// model of a B+tree, simplified: unique integer keys, no deletes, one page = `order` keys.
// two rule sets:
//   textbook: split full nodes in half, separators copied up from leaves and moved up from
//             internal nodes, sibling links between leaves only.
//   nbtree:   postgres' rules where they differ: every page has a right-sibling link and
//             (unless rightmost) a high key, and a page split at the rightmost edge while
//             appending keeps the left page fillfactor% full (90 on leaves, 70 above) so a
//             sequential load leaves full pages behind (src/backend/access/nbtree/nbtsplitloc.c).
// checked in btree.test.ts: invariants for both rule sets, and with order = 407 (int4 keys
// per 8 KB leaf) the nbtree rules reproduce the leaf fill postgres 18.6 really leaves after
// sequential and scattered inserts.

import type { BTreeNode, BTreeView, Stepped } from "../views";

export type BTreeRules = "textbook" | "nbtree";
export type BTreeOpts = { order: number; rules?: BTreeRules; fillfactor?: number; record?: boolean };

type N = { id: string; level: number; keys: number[]; kids?: string[]; right?: string; high?: number };

export class BPlusTree {
  nodes = new Map<string, N>();
  root: string;
  steps: Stepped<BTreeView>[] = [];
  private seq = 0;
  readonly order: number;
  readonly rules: BTreeRules;
  readonly ff: number;
  readonly record: boolean;

  constructor(o: BTreeOpts) {
    this.order = Math.max(3, o.order);
    this.rules = o.rules ?? "textbook";
    this.ff = o.fillfactor ?? 90;
    this.record = o.record ?? true;
    this.root = this.make(0, []).id;
  }

  private make(level: number, keys: number[], kids?: string[]): N {
    const n: N = { id: `n${this.seq++}`, level, keys, kids };
    this.nodes.set(n.id, n);
    return n;
  }

  view(extra: Partial<BTreeView> = {}): BTreeView {
    const nodes: Record<string, BTreeNode> = {};
    for (const n of this.nodes.values())
      nodes[n.id] = {
        id: n.id,
        level: n.level,
        keys: [...n.keys],
        ...(n.kids ? { kids: [...n.kids] } : {}),
        ...(n.right ? { right: n.right } : {}),
        ...(n.high !== undefined ? { high: n.high } : {}),
      };
    return { root: this.root, nodes, ...extra };
  }

  private snap(note: string, label: string, extra: Partial<BTreeView> = {}) {
    if (this.record) this.steps.push({ view: this.view(extra), note, label });
  }

  /** which child to follow: keys[i] separates kids[i] (< keys[i]) from kids[i+1] (>= keys[i]) */
  private child(n: N, k: number): number {
    let i = 0;
    while (i < n.keys.length && k >= n.keys[i]) i++;
    return i;
  }

  path(k: number): string[] {
    const p = [this.root];
    let n = this.nodes.get(this.root)!;
    while (n.kids) {
      n = this.nodes.get(n.kids[this.child(n, k)])!;
      p.push(n.id);
    }
    return p;
  }

  private walkNote(k: number, p: string[]): string {
    if (p.length === 1) return `the tree is a single leaf.`;
    const hops = p.slice(0, -1).map((id) => {
      const n = this.nodes.get(id)!;
      const i = this.child(n, k);
      const lo = n.keys[i - 1];
      const hi = n.keys[i];
      return lo === undefined ? `${k} < ${hi}, go left` : hi === undefined ? `${k} ≥ ${lo}, go right` : `${lo} ≤ ${k} < ${hi}`;
    });
    return hops.join("; then ") + ".";
  }

  insert(k: number): boolean {
    const p = this.path(k);
    const leaf = this.nodes.get(p[p.length - 1])!;
    if (leaf.keys.includes(k)) {
      this.snap(`${k} is already in the index. a unique index stops here with a duplicate key error.`, `insert ${k}`, { path: p, hit: k });
      return false;
    }
    this.snap(`find the leaf for ${k}: ${this.walkNote(k, p)}`, `insert ${k}`, { path: p, hit: k });
    let at = 0;
    while (at < leaf.keys.length && leaf.keys[at] < k) at++;
    leaf.keys.splice(at, 0, k);
    const over = leaf.keys.length > this.order;
    this.snap(
      over
        ? `${k} goes in at position ${at + 1}, and now the leaf holds ${leaf.keys.length} keys. only ${this.order} fit on a page: it has to split.`
        : `${k} goes in at position ${at + 1}. the leaf has room (${leaf.keys.length} of ${this.order}), nothing else changes.`,
      over ? "overflow" : "insert",
      { path: p, hit: k },
    );
    let level = p.length - 1;
    let node = leaf;
    while (node.keys.length > this.order) {
      const parent = level > 0 ? this.nodes.get(p[level - 1])! : null;
      node = this.split(node, parent, k);
      level--;
      if (!parent) break;
    }
    return true;
  }

  /** split an overfull node; returns the parent (which may now be overfull itself) */
  private split(n: N, parent: N | null, k: number): N {
    const leaf = !n.kids;
    const total = n.keys.length;
    const rightmost = !n.right && (this.rules === "nbtree" ? true : leaf);
    const appending = k >= n.keys[total - 1] || (!leaf && this.child(n, k) >= n.keys.length);
    let left: number;
    let policy: string;
    if (this.rules === "nbtree" && rightmost && appending) {
      const ff = leaf ? this.ff : 70;
      left = Math.min(total - 1, Math.max(1, Math.round((this.order * ff) / 100)));
      policy = `this is the rightmost ${leaf ? "leaf" : "page on its level"} and the new key went on the end, so nbtree assumes an ascending load: the left page keeps ${ff}% (${left} keys), the new page gets the rest.`;
    } else {
      left = leaf ? Math.ceil(total / 2) : Math.floor(total / 2);
      policy = `split in the middle: ${left} keys stay, ${total - left - (leaf ? 0 : 1)} move to a new page.`;
    }
    let sep: number;
    let r: N;
    if (leaf) {
      r = this.make(0, n.keys.slice(left));
      n.keys = n.keys.slice(0, left);
      sep = r.keys[0];
    } else {
      sep = n.keys[left];
      r = this.make(n.level, n.keys.slice(left + 1), n.kids!.slice(left + 1));
      n.keys = n.keys.slice(0, left);
      n.kids = n.kids!.slice(0, left + 1);
    }
    // sibling links: leaves always, every level under nbtree
    if (leaf || this.rules === "nbtree") {
      r.right = n.right;
      n.right = r.id;
    }
    if (this.rules === "nbtree") {
      r.high = n.high;
      n.high = sep;
    }
    const what = leaf ? `copy ${sep} up as the separator (it stays in the right leaf too)` : `move ${sep} up (it leaves this level)`;
    if (!parent) {
      const root = this.make(n.level + 1, [sep], [n.id, r.id]);
      this.root = root.id;
      this.snap(`${policy} the split page was the root, so a new root appears above with one separator, ${sep}. the tree grew a level, at the top: every leaf is still the same distance from the root.`, "root split", {
        split: n.id,
        hit: k,
      });
      return root;
    }
    const i = parent.kids!.indexOf(n.id);
    parent.keys.splice(i, 0, sep);
    parent.kids!.splice(i + 1, 0, r.id);
    this.snap(
      `${policy} then ${what} into the parent${parent.keys.length > this.order ? `, which now overflows too` : ""}.${this.rules === "nbtree" ? ` the left page's high key becomes ${sep}.` : ""}`,
      leaf ? "leaf split" : "split",
      { split: n.id, hit: k },
    );
    return parent;
  }

  search(k: number): boolean {
    const p = this.path(k);
    const leaf = this.nodes.get(p[p.length - 1])!;
    const found = leaf.keys.includes(k);
    this.snap(
      `${this.walkNote(k, p)} ${p.length} page${p.length > 1 ? "s" : ""} read. ${found ? `${k} is in the leaf: found.` : `${k} isn't in the leaf, so it isn't in the index.`}`,
      `search ${k}`,
      { path: p, hit: found ? k : undefined },
    );
    return found;
  }

  range(lo: number, hi: number): number[] {
    const p = this.path(lo);
    const out: number[] = [];
    let n: N | undefined = this.nodes.get(p[p.length - 1]);
    const visited: string[] = [];
    while (n) {
      visited.push(n.id);
      for (const x of n.keys) if (x >= lo && x <= hi) out.push(x);
      if (n.keys.length && n.keys[n.keys.length - 1] > hi) break;
      n = n.right ? this.nodes.get(n.right) : undefined;
    }
    this.snap(
      `descend once to the leaf where ${lo} would be, then walk right along the sibling links until a key passes ${hi}: ${visited.length} leaf page${visited.length > 1 ? "s" : ""}, ${out.length} key${out.length === 1 ? "" : "s"}. no going back up the tree.`,
      `range ${lo}..${hi}`,
      { path: [...p, ...visited.slice(1)], range: [lo, hi] },
    );
    return out;
  }

  /** leaves left to right */
  leaves(): N[] {
    let n = this.nodes.get(this.root)!;
    while (n.kids) n = this.nodes.get(n.kids[0])!;
    const out: N[] = [];
    // textbook leaves link right; walk the tree instead so both rule sets work the same
    const walk = (id: string) => {
      const x = this.nodes.get(id)!;
      if (!x.kids) out.push(x);
      else x.kids.forEach(walk);
    };
    walk(this.root);
    return out;
  }

  height(): number {
    return this.nodes.get(this.root)!.level + 1;
  }
}

/** a whole lab run: start empty, apply ops, return the steps */
export function btreeSteps(ops: ({ op: "insert" | "search"; k: number } | { op: "range"; lo: number; hi: number })[], o: BTreeOpts): Stepped<BTreeView>[] {
  const t = new BPlusTree({ ...o, record: true });
  t.steps.push({ view: t.view(), label: "empty", note: `an empty index is one leaf page with room for ${t.order} keys.` });
  for (const x of ops) {
    if (x.op === "range") t.range(x.lo, x.hi);
    else if (x.op === "insert") t.insert(x.k);
    else t.search(x.k);
  }
  return t.steps;
}
