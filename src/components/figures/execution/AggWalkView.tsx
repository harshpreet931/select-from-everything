"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, Row, Words, ring, tint, useReducedMotion } from "@/components/figures/kit";

// GROUP BY kind over a dozen real rows, two ways. HashAggregate reads the rows in any order and
// keeps one counter per kind in a hash table; nothing comes out until the input is used up.
// GroupAggregate needs the rows sorted by kind; it keeps one counter, and hands a group up the
// moment the kind changes. step through either.

type Strategy = "HashAggregate" | "GroupAggregate";
type In = { id: string; key: string };
type State = { mem: [string, number][]; out: [string, number][]; hot?: string; note: string };

function walk(input: In[], s: Strategy): State[] {
  const states: State[] = [];
  if (s === "HashAggregate") {
    const t = new Map<string, number>();
    states.push({ mem: [], out: [], note: "an empty hash table. rows come in whatever order the scan finds them." });
    for (const r of input) {
      const fresh = !t.has(r.key);
      t.set(r.key, (t.get(r.key) ?? 0) + 1);
      states.push({ mem: [...t], out: [], hot: r.key, note: fresh ? `${r.key}: not in the table yet, so it gets a new entry with count 1.` : `${r.key}: hash it, find its entry, add 1. nothing comes out yet: a later row could still be a ${r.key}.` });
    }
    states.push({ mem: [...t], out: [...t], note: `input used up. only now is every count final, so all ${t.size} groups come out at once. that's why HashAggregate is a blocking node.` });
  } else {
    const sorted = [...input].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : Number(a.id) - Number(b.id)));
    const out: [string, number][] = [];
    let cur: [string, number] | null = null;
    states.push({ mem: [], out: [], note: "the rows arrive sorted by kind (from a Sort, or an index). one counter is all the memory it needs." });
    for (const r of sorted) {
      let note: string;
      if (cur && cur[0] !== r.key) {
        out.push(cur);
        note = `${r.key} isn't ${cur[0]}, so the ${cur[0]} group is finished: it goes up right now. start counting ${r.key}.`;
        cur = [r.key, 1];
      } else if (cur) {
        cur = [cur[0], cur[1] + 1];
        note = `another ${r.key}: add 1.`;
      } else {
        cur = [r.key, 1];
        note = `the first row starts the first group: ${r.key}, 1.`;
      }
      states.push({ mem: [cur], out: [...out], hot: r.key, note });
    }
    if (cur) out.push(cur);
    states.push({ mem: [], out: [...out], note: "the input ends, so the last group is finished too. every group went up as soon as it was done: GroupAggregate streams." });
  }
  return states;
}

export function AggWalkView({ input, source }: { input: In[]; source: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const [strategy, setStrategy] = useState<Strategy>("HashAggregate");
  const reduce = useReducedMotion();
  const rows = useMemo(() => (strategy === "GroupAggregate" ? [...input].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : Number(a.id) - Number(b.id))) : input), [input, strategy]);
  const states = useMemo(() => walk(input, strategy), [input, strategy]);
  const s = useStepper(states.length, { interval: 900 });
  const st = states[Math.min(s.i, states.length - 1)];
  const at = s.i - 1; // the row just read
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12 outline-none">
      <Row k="strategy =" w="11ch" last>
        <Words
          label="aggregation strategy"
          options={["HashAggregate", "GroupAggregate"] as Strategy[]}
          value={strategy}
          onChange={(v) => {
            setStrategy(v);
            s.reset();
          }}
        />
      </Row>
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[600px]:grid-cols-3">
        <div className="grid content-start gap-1">
          <div className="text-11 text-faint">input{strategy === "GroupAggregate" ? ", sorted by kind" : ", in table order"}</div>
          {rows.map((r, i) => (
            <div key={`${strategy}${r.id}`} className="flex items-center gap-2 tabular" style={{ color: i === at ? "var(--hi)" : i < at ? "var(--mute)" : "var(--faint)" }}>
              <span className="w-3 text-ref">{i === at ? "▶" : ""}</span>
              <span className="w-[6ch] text-11">{r.id}</span>
              <span>{r.key}</span>
            </div>
          ))}
        </div>
        <div className="grid content-start gap-1.5">
          <div className="text-11 text-faint">{strategy === "HashAggregate" ? "hash table: one counter per kind" : "the current group"}</div>
          {st.mem.length === 0 && <span className="text-faint">·</span>}
          {st.mem.map(([k, n]) => (
            <span key={k} className="inline-flex w-fit items-center gap-2 rounded-xs px-2 py-0.5 transition-[box-shadow,background-color] duration-200 ease-sfe" style={{ boxShadow: k === st.hot ? ring("hot", undefined, 1.5) : ring("line-2"), background: k === st.hot ? tint("hot", 8) : undefined }}>
              <span className="text-hi">{k}</span>
              <span className="text-mute tabular">{n}</span>
            </span>
          ))}
        </div>
        <div className="grid content-start gap-1">
          <div className="text-11 text-faint">handed up to the next node</div>
          {st.out.length === 0 && <span className="text-faint">nothing yet</span>}
          {st.out.map(([k, n], i) => (
            <div key={k} className="flex justify-between gap-3 rounded-xs px-2 tabular" style={{ background: i === st.out.length - 1 ? tint("live", 10) : undefined }}>
              <span className="text-hi">{k}</span>
              <span className="text-ink">{n}</span>
            </div>
          ))}
        </div>
      </div>
      <Narration minLines={2}>{st.note}</Narration>
      <StepControls s={s} label="row" compact={reduce} />
      <Provenance sim="model of the two strategies, on twelve real rows; the counts match postgres's GROUP BY" />
      <Provenance trace={source} className="-mt-3" />
    </div>
  );
}
