"use client";

import { useMemo, useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Narration, Provenance, Row, Words, ring, tint } from "@/components/figures/kit";

// attribute closure, the textbook algorithm: start from the attributes you pick, and keep firing
// any dependency whose left side is already inside, until nothing new arrives. if the closure is
// every attribute, the start set is a superkey; if no smaller subset is, it's a candidate key.
// this is relational theory, not postgres behaviour, so it runs in the page and says so.

export type Fd = { lhs: string[]; rhs: string[] };
export type ClosurePreset = { name: string; attrs: string[]; fds: Fd[]; start: string[] };

function closureSteps(start: string[], fds: Fd[]) {
  const have = new Set(start);
  const steps: { fired: number | null; added: string[]; have: string[] }[] = [{ fired: null, added: [...start], have: [...have] }];
  const used = new Set<number>();
  for (let again = true; again; ) {
    again = false;
    fds.forEach((f, i) => {
      if (used.has(i) || !f.lhs.every((a) => have.has(a))) return;
      used.add(i);
      const added = f.rhs.filter((a) => !have.has(a));
      added.forEach((a) => have.add(a));
      steps.push({ fired: i, added, have: [...have] });
      again = true;
    });
  }
  return steps;
}

const closeOf = (start: string[], fds: Fd[]) => new Set(closureSteps(start, fds).at(-1)!.have);

function candidateKeys(attrs: string[], fds: Fd[]): string[][] {
  const n = attrs.length;
  const keys: string[][] = [];
  const masks = Array.from({ length: 1 << n }, (_, m) => m).sort((a, b) => popcount(a) - popcount(b) || a - b);
  for (const m of masks) {
    if (!m) continue;
    if (keys.some((k) => k.every((a) => m & (1 << attrs.indexOf(a))))) continue;
    const set = attrs.filter((_, i) => m & (1 << i));
    if (closeOf(set, fds).size === n) keys.push(set);
  }
  return keys;
}
function popcount(m: number) {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
}

export function ClosureLab({ presets }: { presets: ClosurePreset[] }) {
  const [pi, setPi] = useState(0);
  const p = presets[pi];
  const [start, setStart] = useState<string[]>(p.start);
  const steps = useMemo(() => closureSteps(start, p.fds), [start, p.fds]);
  const keys = useMemo(() => candidateKeys(p.attrs, p.fds), [p]);
  const s = useStepper(steps.length, { interval: 1400 });
  const cur = steps[Math.min(s.i, steps.length - 1)];
  const done = s.i >= steps.length - 1;
  const all = cur.have.length === p.attrs.length;
  const isKey = keys.some((k) => k.length === start.length && k.every((a) => start.includes(a)));

  const toggle = (a: string) => {
    setStart((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
    s.go(0);
  };
  const fmtSet = (xs: string[]) => `{${xs.join(", ")}}`;

  let verdict;
  if (!start.length) verdict = <>pick one or more attributes to start from.</>;
  else if (!done) verdict = cur.fired === null ? <>start with {fmtSet(start)}. a set always determines itself.</> : <>{fmtSet(p.fds[cur.fired].lhs)} is inside, so {fmtSet(p.fds[cur.fired].rhs)} comes along{cur.added.length ? "" : " (nothing new)"}.</>;
  else if (all)
    verdict = isKey ? (
      <>
        <span className="text-live">{fmtSet(start)} is a candidate key.</span> its closure is every attribute, and no smaller subset&apos;s is.
      </>
    ) : (
      <>
        <span className="text-live">a superkey</span>, but not minimal: a smaller subset already determines everything.
      </>
    );
  else
    verdict = (
      <>
        <span className="text-dead">not a key.</span> nothing fires any more, and {fmtSet(p.attrs.filter((a) => !cur.have.includes(a)))} {p.attrs.length - cur.have.length === 1 ? "is" : "are"} still out of reach.
      </>
    );

  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="compute an attribute closure step by step">
      <div>
        <Row k="table" w="9ch">
          <Words
            label="table"
            options={presets.map((x, i) => ({ v: i, label: x.name }))}
            value={pi}
            onChange={(v) => {
              setPi(v);
              setStart(presets[v].start);
              s.go(0);
            }}
          />
        </Row>
        <Row k="start" w="9ch" last>
          {p.attrs.map((a) => (
            <button key={a} type="button" className="word" aria-pressed={start.includes(a)} onClick={() => toggle(a)}>
              {a}
            </button>
          ))}
        </Row>
      </div>
      <div className="grid min-w-0 gap-1">
        <div className="text-11 text-faint">dependencies</div>
        <ul className="grid gap-1 text-12">
          {p.fds.map((f, i) => {
            const firedAt = steps.findIndex((x) => x.fired === i);
            const fired = firedAt >= 0 && firedAt <= s.i;
            const now = cur.fired === i;
            return (
              <li
                key={i}
                className="w-fit rounded-xs px-2 py-0.5 transition-[background-color,box-shadow] duration-200 ease-sfe"
                style={{ boxShadow: now ? ring("hot") : fired ? ring("line-2") : undefined, background: now ? tint("hot", 10) : undefined, color: fired ? "var(--ink)" : "var(--faint)" }}
              >
                {f.lhs.join(", ")} → {f.rhs.join(", ")}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="text-11 text-faint">
          closure of {fmtSet(start)}, step {Math.min(s.i, steps.length - 1)} of {steps.length - 1}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.attrs.map((a) => {
            const inn = cur.have.includes(a);
            const fresh = cur.added.includes(a) && cur.fired !== null;
            return (
              <Chip key={a} tone={fresh ? "hot" : inn ? (done && all ? "live" : "ink") : "faint"} dashed={!inn}>
                {a}
              </Chip>
            );
          })}
        </div>
      </div>
      <Narration minLines={2}>{verdict}</Narration>
      <div className="text-12 text-mute">
        candidate keys of this table: {keys.map((k) => fmtSet(k)).join(" and ")}
      </div>
      <StepControls s={s} />
      <Provenance sim="the textbook closure algorithm, run in this page" />
    </div>
  );
}
