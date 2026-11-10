// what the db primitives draw. a primitive draws a View, and a View comes from one of
// three places:
//   (a) hand-written in an mdx `export const` (only for textbook / "the standard allows")
//   (b) a simulator in sim/*.ts (labs that take reader input)
//   (c) a pgtrace capture through fromTrace.ts (required for every "postgres does" claim)
// pure types, no react at runtime (ReactNode is a type-only import for notes).

import type { ReactNode } from "react";
import type { PgTrace } from "./pgtrace";

export type Xid = number;
export type Lsn = number;
export type Tid = readonly [block: number, off: number];
export type XactStatus = "committed" | "aborted" | "in progress";
export type Snap = { xmin: Xid; xmax: Xid; xip: Xid[] };

/* ---- heap pages ---------------------------------------------------------------- */

export type LpFlags = "normal" | "redirect" | "dead" | "unused";

export type Tuple = {
  /** line pointer number, 1-based */
  lp: number;
  lpFlags: LpFlags;
  /** lp_off: byte offset of the tuple in the page */
  off?: number;
  /** lp_len */
  len?: number;
  /** for LP_REDIRECT: the lp it points at */
  redirect?: number;
  xmin?: Xid;
  xmax?: Xid;
  ctid?: Tid;
  infomask?: number;
  infomask2?: number;
  hoff?: number;
  /** t_bits as postgres prints it ("110"), one char per column, 1 = not null */
  nullBits?: string;
  /** decoded infomask flags, e.g. HEAP_XMIN_COMMITTED */
  flags?: string[];
  data?: Record<string, string | null>;
};

export type Page = {
  rel: string;
  block: number;
  size: number;
  lower: number;
  upper: number;
  special: number;
  lsn?: Lsn;
  pruneXid?: Xid;
  tuples: Tuple[];
};

/** one step of a stepped figure. hot = ids the figure should mark as "just changed". */
export type Stepped<V> = { view: V; note?: ReactNode; label?: string; hot?: string[] };

/** where a primitive's data comes from. select narrows a trace (a rel, an index, a row filter). */
export type Source<V> = { view: V } | { steps: Stepped<V>[] } | { trace: PgTrace; select?: string };

/* ---- version chains ------------------------------------------------------------ */

export type ChainView = {
  rel?: string;
  versions: (Tuple & { block: number })[];
  xact: Record<number, XactStatus>;
  /** oldest xmin any snapshot still needs. a version deleted by a committed xid below this is removable */
  horizon?: Xid;
  index?: { key: string; tid: Tid; dead?: boolean }[];
};

/** a snapshot plus whose it is. me = the xid of the transaction looking (its own changes are visible). */
export type Viewer = Snap & { me?: Xid | null };

/* ---- b-trees ------------------------------------------------------------------- */

export type BTreeNode = {
  id: string;
  /** 0 = leaf */
  level: number;
  keys: (string | number)[];
  /** upper bound of the page (nbtree), drawn meta italic */
  high?: string | number;
  /** child ids, keys.length + 1 of them on internal nodes */
  kids?: string[];
  /** heap pointers on leaves, one per key (or a posting list) */
  tids?: (Tid | Tid[] | null)[];
  /** right sibling */
  right?: string;
  /** per-key LP_DEAD hint */
  dead?: boolean[];
  /** per-key posting list size (deduplicated entries) */
  posting?: number[];
  /** keys not drawn (a captured page trimmed for size): "… n more" */
  more?: number;
  /** where in keys the undrawn run sits (default: before the last key) */
  moreAt?: number;
};

export type BTreeView = {
  root: string;
  nodes: Record<string, BTreeNode>;
  /** node ids in the order visited: root down to a leaf, then (a range scan) right along the
   *  sibling links. BTree lights the arrow between each consecutive pair */
  path?: string[];
  /** a key to mark hot wherever it appears (just inserted, or found) */
  hit?: string | number;
  /** a key range [lo, hi] being scanned */
  range?: [string | number, string | number];
  /** the node that just split */
  split?: string;
};

/* ---- plans --------------------------------------------------------------------- */

export type PlanNode = {
  id: string;
  op: string;
  detail?: string[];
  est?: { rows: number; startup: number; total: number; width?: number };
  actual?: { rows: number; loops: number };
  buffers?: { hit: number; read: number; dirtied?: number; written?: number };
  removed?: number;
  /** EXPLAIN's Join Type: Inner, Left, Semi, Anti, ... */
  join?: string;
  /** EXPLAIN's Parent Relationship: Outer, Inner, SubPlan, InitPlan, ... */
  parent?: string;
  /** EXPLAIN's Subplan Name: "SubPlan 1", "InitPlan 2", "CTE recent" */
  subplan?: string;
  /** postgres 18's "Disabled: true": the planner chose a node an enable_* setting turned off (nothing better was possible) */
  disabled?: boolean;
  kids: PlanNode[];
  /** for the volcano simulator (sim/volcano.ts). captured plans leave this out */
  sim?: VolcanoSpec;
};

export type Pred = [col: string, op: "=" | "<>" | "<" | "<=" | ">" | ">=" | "is null" | "is not null" | "true" | "false", value?: string | number | boolean | null];

export type VolcanoSpec = {
  table?: string;
  where?: Pred[];
  /** Sort key, or Aggregate group key */
  key?: string;
  desc?: boolean;
  count?: number;
  on?: [string, string];
  aggs?: { fn: "count" | "sum" | "avg" | "min" | "max"; col?: string; as: string }[];
  /** columns a node passes up (projection) */
  cols?: string[];
};

export type Table = { columns: (string | { name: string; type?: string })[]; rows: (string | number | boolean | null)[][] };

/* ---- buffer pool --------------------------------------------------------------- */

export type PoolFrame = { id: number; page?: { rel: string; block: number }; dirty: boolean; pins: number; usage: number; ring?: boolean };

export type PoolView = {
  frames: PoolFrame[];
  /** the clock hand: index of the next frame the sweep looks at */
  hand: number;
  /** show the page table ((rel, block) → frame) */
  table?: boolean;
  /** the page being asked for right now */
  req?: { rel: string; block: number };
  hit?: boolean;
  /** frame that was just evicted / filled */
  victim?: number;
  /** frames the hand passed over in this step (usage decremented) */
  swept?: number[];
  stats: { hit: number; read: number; evicted: number; written: number };
  /** frames not drawn because they hold other relations (captured) */
  other?: number;
};

/* ---- WAL ----------------------------------------------------------------------- */

export type WalRecord = {
  lsn: Lsn;
  len: number;
  end?: Lsn;
  prev?: Lsn;
  xid?: Xid;
  rmgr: string;
  type: string;
  desc?: string;
  blocks?: { rel: string; block: number; fpi?: boolean }[];
};

export type WalPage = { label: string; lsn: Lsn; dirty?: boolean; disk?: Lsn };

export type WalView = {
  records: WalRecord[];
  insert: Lsn;
  flush: Lsn;
  redo?: Lsn;
  checkpoint?: Lsn;
  base: Lsn;
  pages?: WalPage[];
  crashed?: boolean;
  /** index of the record being replayed */
  applying?: number;
  /** per record index: what recovery did with it */
  replay?: Record<number, "applied" | "skipped" | "lost">;
  /** index of the record just appended (drawn hot) */
  fresh?: number;
};

/* ---- ARIES (textbook) --------------------------------------------------------- */

export type AriesRec = {
  lsn: number;
  txn?: string;
  kind: "update" | "commit" | "abort" | "end" | "begin-ckpt" | "end-ckpt" | "clr";
  page?: string;
  prev?: number;
  undoNext?: number;
  /** for updates: "x: 1 → 2" */
  what?: string;
};

export type AriesView = {
  log: AriesRec[];
  pass: "before" | "crash" | "analysis" | "redo" | "undo" | "done";
  at?: number;
  txns: { txn: string; status: "running" | "committed" | "aborting"; last: number }[];
  dpt: { page: string; recLsn: number }[];
  pages: { page: string; lsn: number }[];
  /** lsn → what the current pass did with it */
  marks?: Record<number, "scan" | "redo" | "skip" | "undo" | "clr">;
  flushed?: number;
};

/* ---- heap files, snapshots, locks, hash ---------------------------------------- */

export type HeapFileView = {
  rel: string;
  pages: { block: number; used: number; dead: number; free: number; allVisible?: boolean; allFrozen?: boolean }[];
  /** bytes per page, default 8192 */
  size?: number;
};

export type SnapView = {
  snap: Snap;
  xact: Record<number, XactStatus>;
  me?: Xid | null;
  /** the xid range to draw */
  range?: [Xid, Xid];
};

export type LockReq = { txn: string; obj: string; mode: string; granted: boolean };

export type WfgView = {
  nodes: { id: string; kind?: "txn" | "lock"; sub?: string }[];
  /** [lock, txn]: the lock is held by txn */
  holds?: [string, string][];
  /** [waiter, what it waits for] */
  waits: [string, string][];
  /** edges that close the cycle, as [from, to] */
  cycle?: [string, string][];
};

export type HashBucket = { id: number; pages: { blk?: number; items: { key?: string | number; hash: number }[] }[] };

export type HashView = {
  meta: { maxbucket: number; highmask: number; lowmask: number; ffactor: number; ntuples: number };
  buckets: HashBucket[];
  /** bucket being split (old) and the new one */
  splitting?: [number, number];
  /** key just inserted / looked up */
  hot?: string | number;
  hotBucket?: number;
};

/* ---- sessions ------------------------------------------------------------------ */

export type SessionOp =
  | string
  | {
      sql: string;
      out?: string;
      tone?: "ref" | "live" | "dead" | "meta" | "hot" | "accent" | "mute";
      /** this statement blocks: "waits for T1: ShareLock on transaction 754" */
      wait?: string | boolean;
      /** a blocked statement finishing */
      woke?: boolean;
      error?: { sqlstate: string; message: string };
    };

export type SessionStep = {
  ops?: (SessionOp | null)[];
  /** a statement the observer ran at this step (pgtrace `obs`: a VACUUM, a pg_locks query), drawn across the lanes */
  obs?: SessionOp;
  /** who the full-width row speaks for: "obs" (the observer, default) or "server" (@crash, @restart) */
  obsWho?: string;
  /** committed state of the database after this step, for the side panel */
  db?: Table | Record<string, string | number | boolean | null>;
  /** per session snapshot after this step */
  snaps?: Record<string, Snap | null>;
  versions?: ChainView;
  locks?: LockReq[];
  note?: ReactNode;
  label?: string;
};
