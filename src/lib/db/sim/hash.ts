// model of a postgres hash index, simplified: one backend, int4 keys, no locks, no
// squeeze/vacuum. the parts that decide where a key goes are exact ports:
//   hashint4 → hash_bytes_uint32 (src/common/hashfn.c, Bob Jenkins' lookup3 final mix)
//   _hash_hashkey2bucket (hashutil.c), the split trigger in _hash_doinsert / _hash_expandtable
//   and the mask update in _hash_expandtable (hashpage.c)
// checked against real postgres 18.6 in hash.test.ts: hashint4 for k = 1..1000, the
// insert count at every split, and the bucket of every key.

import type { HashBucket, HashView, Stepped } from "../views";

const rot = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/** hash_bytes_uint32(k): what hashint4(k) returns, as an unsigned 32-bit number */
export function hashUint32(k: number): number {
  let a = (0x9e3779b9 + 4 + 3923095) >>> 0;
  let b = a;
  let c = a;
  a = (a + (k >>> 0)) >>> 0;
  // final(a, b, c)
  c = ((c ^ b) >>> 0) - rot(b, 14);
  c >>>= 0;
  a = ((a ^ c) >>> 0) - rot(c, 11);
  a >>>= 0;
  b = ((b ^ a) >>> 0) - rot(a, 25);
  b >>>= 0;
  c = ((c ^ b) >>> 0) - rot(b, 16);
  c >>>= 0;
  a = ((a ^ c) >>> 0) - rot(c, 4);
  a >>>= 0;
  b = ((b ^ a) >>> 0) - rot(a, 14);
  b >>>= 0;
  c = ((c ^ b) >>> 0) - rot(b, 24);
  return c >>> 0;
}

/** hashint4(k) exactly as postgres prints it (an int4, so it can be negative) */
export const hashint4 = (k: number): number => hashUint32(k) | 0;

/** _hash_hashkey2bucket */
export function bucketOf(hash: number, maxbucket: number, highmask: number, lowmask: number): number {
  let b = (hash >>> 0) & highmask;
  if (b > maxbucket) b &= lowmask;
  return b >>> 0;
}

export type HashMeta = HashView["meta"];

/** the split decision in _hash_doinsert: after counting the new tuple */
export const needsSplit = (m: HashMeta) => m.ntuples > m.ffactor * (m.maxbucket + 1);

/** _hash_expandtable's bookkeeping: which bucket splits, and the new masks */
export function expand(m: HashMeta): { meta: HashMeta; old: number; neu: number } {
  const neu = m.maxbucket + 1;
  const old = neu & m.lowmask;
  let { highmask, lowmask } = m;
  if (neu > highmask) {
    // starting a new doubling
    lowmask = highmask;
    highmask = neu | lowmask;
  }
  return { meta: { ...m, maxbucket: neu, highmask, lowmask }, old, neu };
}

/** _hash_init for a tiny index: 2 buckets */
export const initialMeta = (ffactor: number): HashMeta => ({ maxbucket: 1, highmask: 3, lowmask: 1, ffactor, ntuples: 0 });

const hex = (h: number) => `0x${(h >>> 0).toString(16).padStart(8, "0")}`;
const bin = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0").slice(-w);

/**
 * the lab: insert keys one by one, a step per insert and a step per split.
 * pageCap = tuples per bucket page before an overflow page is chained (ffactor is 75% of it by default).
 */
export function hashSteps(keys: number[], o: { ffactor: number; pageCap?: number }): Stepped<HashView>[] {
  const cap = o.pageCap ?? Math.max(o.ffactor + 1, Math.ceil(o.ffactor / 0.75));
  let meta = initialMeta(o.ffactor);
  const buckets = new Map<number, { key: number; hash: number }[]>([
    [0, []],
    [1, []],
  ]);
  const view = (extra: Partial<HashView> = {}): HashView => ({
    meta: { ...meta },
    buckets: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, items]): HashBucket => {
        const pages: HashBucket["pages"] = [];
        for (let i = 0; i < Math.max(1, Math.ceil(items.length / cap)); i++) pages.push({ items: items.slice(i * cap, (i + 1) * cap).map((x) => ({ key: x.key, hash: x.hash })) });
        return { id, pages };
      }),
    ...extra,
  });
  const steps: Stepped<HashView>[] = [
    { view: view(), label: "empty", note: `an empty hash index: a meta page and 2 buckets. a bucket splits once the index holds more than ${o.ffactor} tuples per bucket (ffactor).` },
  ];
  const width = () => Math.max(2, meta.highmask.toString(2).length);
  for (const k of keys) {
    const h = hashUint32(k);
    const b = bucketOf(h, meta.maxbucket, meta.highmask, meta.lowmask);
    buckets.get(b)!.push({ key: k, hash: h });
    meta = { ...meta, ntuples: meta.ntuples + 1 };
    const masked = h & meta.highmask;
    const items = buckets.get(b)!.length;
    steps.push({
      view: view({ hot: k, hotBucket: b }),
      label: `insert ${k}`,
      note: `hashint4(${k}) = ${hex(h)}. the low bits under highmask ${bin(meta.highmask, width())} give ${masked}${
        masked > meta.maxbucket ? `, past maxbucket ${meta.maxbucket}, so it takes lowmask instead: bucket ${b}` : `: bucket ${b}`
      }.${items > cap && (items - 1) % cap === 0 ? " the bucket page is full, so an overflow page gets chained on." : ""}`,
    });
    if (needsSplit(meta)) {
      const e = expand(meta);
      meta = e.meta;
      const moving = buckets.get(e.old)!.filter((x) => bucketOf(x.hash, meta.maxbucket, meta.highmask, meta.lowmask) === e.neu);
      buckets.set(e.old, buckets.get(e.old)!.filter((x) => !moving.includes(x)));
      buckets.set(e.neu, moving);
      steps.push({
        view: view({ splitting: [e.old, e.neu] }),
        label: "split",
        note: `${meta.ntuples} tuples > ${meta.ffactor} × ${meta.maxbucket} buckets: split. bucket ${e.neu} is new and only bucket ${e.old} gets rehashed (${moving.length} of its tuples move). one bucket at a time, never the whole table.`,
      });
    }
  }
  return steps;
}
