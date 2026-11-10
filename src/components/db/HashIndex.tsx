"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Legend, Narration, Provenance, Row, fmt, ring, tint, useReducedMotion } from "@/components/figures/kit";
import type { HashView } from "@/lib/db/views";
import { hashSteps } from "@/lib/db/sim/hash";
import { describeHash } from "@/lib/db/describe";

// a postgres hash index: a meta page (maxbucket, highmask, lowmask, ffactor: machinery, so
// meta) and the buckets. a key's bucket is hashint4(key) & highmask, or & lowmask if that
// bucket doesn't exist yet. a full bucket page chains a dashed overflow page. once the index
// holds more than ffactor tuples per bucket, ONE bucket splits: a new bucket appears and
// only the old one's tuples get rehashed (both hot). the hash function and the split rule
// are exact ports, checked against postgres 18.6.
//
//   <HashIndex perBucket={4} keys={[1, 2, 3, ...]} />

const bin = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0").slice(-w);


export function HashBuckets({ view }: { view: HashView }) {
  const w = Math.max(2, view.meta.highmask.toString(2).length);
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md px-3 py-2 text-11 tabular" style={{ boxShadow: ring("meta", 60), background: tint("meta", 6) }} aria-label="meta page">
        <span className="text-meta">meta page</span>
        <span>
          <span className="text-faint">maxbucket</span> <span className="text-hi">{view.meta.maxbucket}</span>
        </span>
        <span>
          <span className="text-faint">highmask</span> <span className="text-hi">{bin(view.meta.highmask, w)}</span>
        </span>
        <span>
          <span className="text-faint">lowmask</span> <span className="text-hi">{bin(view.meta.lowmask, w)}</span>
        </span>
        <span>
          <span className="text-faint">ffactor</span> <span className="text-hi">{view.meta.ffactor}</span>
        </span>
        <span>
          <span className="text-faint">ntuples</span> <span className="text-hi">{fmt(view.meta.ntuples)}</span>
        </span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className="flex min-w-max items-start gap-1.5" role="img" aria-label={describeHash(view)}>
          {view.buckets.map((b) => {
            const split = view.splitting?.includes(b.id);
            const hot = view.hotBucket === b.id;
            return (
              <div key={b.id} className="flex w-[4.4rem] flex-col gap-1">
                <div className="text-center text-[10px] tabular" style={{ color: split || hot ? "var(--hot)" : "var(--faint)" }}>
                  bucket {b.id}
                  <div className="text-[9px] text-faint">{bin(b.id, w)}</div>
                </div>
                {b.pages.map((p, i) => (
                  <div
                    key={i}
                    className="flex min-h-[3.2rem] flex-wrap content-start gap-[3px] rounded-[4px] p-1 transition-[box-shadow,background-color] duration-200 ease-sfe"
                    style={{
                      boxShadow: i === 0 ? (split || hot ? ring("hot", undefined, 1.5) : ring("line-2")) : undefined,
                      outline: i > 0 ? `1px dashed ${split ? "var(--hot)" : "var(--mute)"}` : undefined,
                      outlineOffset: -1,
                      background: split ? tint("hot", 7) : "var(--bg)",
                    }}
                    title={i > 0 ? "overflow page" : "primary bucket page"}
                  >
                    {p.items.map((it, j) => (
                      <span
                        key={j}
                        className="rounded-[2px] px-[3px] text-[10px] leading-[14px] tabular"
                        style={{ color: it.key === view.hot ? "var(--hot)" : "var(--ink)", boxShadow: it.key === view.hot ? ring("hot") : ring("line") }}
                        title={`hash 0x${(it.hash >>> 0).toString(16).padStart(8, "0")}`}
                      >
                        {it.key ?? (it.hash >>> 0).toString(16).slice(-3)}
                      </span>
                    ))}
                    {i > 0 && <span className="w-full text-[9px] text-mute italic">overflow</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HashIndex({ perBucket = 4, keys: keys0, scheme = "postgres" }: { perBucket?: number; keys?: number[]; scheme?: "postgres" }) {
  const [keys, setKeys] = useState<number[]>(keys0 ?? Array.from({ length: 40 }, (_, i) => i + 1));
  const [text, setText] = useState("");
  const steps = useMemo(() => hashSteps(keys, { ffactor: perBucket }), [keys, perBucket]);
  const reduce = useReducedMotion();
  const s = useStepper(steps.length, { interval: 900 });
  const cur = steps[s.i];
  const toSplit = () => {
    for (let i = s.i + 1; i < steps.length; i++) if (steps[i].view.splitting) return s.go(i);
    s.go(steps.length - 1);
  };
  const add = () => {
    const k = parseInt(text, 10);
    if (Number.isNaN(k)) return;
    const before = steps.length;
    setKeys((ks) => [...ks, k]);
    setText("");
    requestAnimationFrame(() => s.go(before));
  };
  void scheme;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="hash index, one insert at a time">
      <Row k="+ key =" w="9ch" last>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9-]/g, "").slice(0, 7))}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="mr-1 w-[8ch] border-b border-line-2 bg-transparent py-1 text-13 text-hi outline-none focus:border-hi"
          inputMode="numeric"
          aria-label="a key to insert"
          placeholder="42"
        />
        <button type="button" className="act" onClick={add} disabled={!text}>
          insert
        </button>
        <button type="button" className="act solid" onClick={toSplit} disabled={s.atEnd}>
          fill until it splits
        </button>
      </Row>
      <HashBuckets view={cur.view} />
      <Narration minLines={3} tag={cur.label}>
        {cur.note}
      </Narration>
      <Legend
        items={[
          ["meta", "meta page"],
          ["hot", "this insert, the split"],
          ["mute", "overflow page", "dashed"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <Provenance sim={`model of a postgres hash index, ffactor ${perBucket}`} checked />
    </div>
  );
}
