"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Heads, Narration, Provenance, Row, Toggle, Words, tv, useSvgId } from "@/components/figures/kit";

// the textbook CAP scenario, drawn by hand: one register x, two replicas, a client next to each.
// with the link up, both stay in step. with it cut, a replica that gets a request can either
// answer from what it has (available, maybe stale: AP) or refuse until it can check with the
// other side (consistent, not available: CP). nothing here is postgres output.

type Choice = "CP" | "AP";
type Frame = { a: string; b: string; left?: string; right?: string; leftTone?: "live" | "dead" | "hot"; rightTone?: "live" | "dead" | "hot"; msg?: boolean; note: string };

function frames(cut: boolean, choice: Choice): Frame[] {
  const start: Frame = { a: "x = 1", b: "x = 1", note: "two replicas of one value, x = 1. a client sits next to each." };
  if (!cut)
    return [
      start,
      { a: "x = 2", b: "x = 2", left: "write x = 2 → ok", leftTone: "live", msg: true, note: "the left client writes x = 2. A sends it to B, both have it, then A says ok." },
      { a: "x = 2", b: "x = 2", left: "write x = 2 → ok", right: "read x → 2", rightTone: "live", note: "the right client reads from B and gets 2. consistent and available: with no partition there's no choice to make, only the cost of the message." },
      { a: "x = 2", b: "x = 2", left: "write x = 2 → ok", right: "read x → 2", rightTone: "live", note: "turn the partition on to see the choice CAP is about." },
    ];
  if (choice === "CP")
    return [
      start,
      { a: "x = 1", b: "x = 1", left: "write x = 2 → refused", leftTone: "dead", note: "the link is down. A can't tell B about the write, and won't accept a write it can't make safe. the left client gets an error (or waits): not available." },
      { a: "x = 1", b: "x = 1", left: "write x = 2 → refused", leftTone: "dead", right: "read x → refused", rightTone: "dead", note: "B can't know whether A took writes it hasn't heard of, so it refuses the read too. nobody ever sees a stale value, and nobody gets an answer." },
      { a: "x = 2", b: "x = 2", left: "write x = 2 → ok", leftTone: "live", right: "read x → 2", rightTone: "live", msg: true, note: "the partition heals and both sides serve again. consistent throughout, unavailable while cut off." },
    ];
  return [
    start,
    { a: "x = 2", b: "x = 1", left: "write x = 2 → ok", leftTone: "live", note: "the link is down. A accepts the write anyway and says ok. only A has it." },
    { a: "x = 2", b: "x = 1", left: "write x = 2 → ok", leftTone: "live", right: "read x → 1", rightTone: "dead", note: "the right client reads from B and gets 1, after the write of 2 already succeeded. every request got an answer, and this one is stale: not linearizable." },
    { a: "x = 2", b: "x = 2", left: "write x = 2 → ok", leftTone: "live", right: "read x → 1", rightTone: "dead", msg: true, note: "the partition heals and B catches up. had both sides taken different writes, they'd now have to pick one (last write wins, merge, or ask the app)." },
  ];
}

export function CapLab() {
  const [cut, setCut] = useState(true);
  const [choice, setChoice] = useState<Choice>("AP");
  const fs = frames(cut, choice);
  const s = useStepper(fs.length, { interval: 1800 });
  const f = fs[s.i];
  const id = useSvgId();
  const healed = s.i === fs.length - 1 && cut;
  const linkDown = cut && !healed;
  const box = (x: number, label: string, val: string) => (
    <g>
      <rect x={x} y={52} width={120} height={56} rx={6} fill="var(--well)" stroke="var(--line-2)" />
      <text x={x + 60} y={74} textAnchor="middle" fontSize={12} fill="var(--mute)">replica {label}</text>
      <text x={x + 60} y={96} textAnchor="middle" fontSize={14} fill="var(--hi)">{val}</text>
    </g>
  );
  const ask = (x: number, text: string | undefined, tone?: string) =>
    text ? (
      <text x={x} y={140} textAnchor="middle" fontSize={12} fill={tone ? tv(tone as "live") : "var(--ink)"}>{text}</text>
    ) : null;
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-3 text-12 outline-none grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="network =" w="10ch">
          <Toggle on={cut} onChange={(v) => { setCut(v); s.reset(); }}>partitioned</Toggle>
        </Row>
        <Row k="on a cut =" w="10ch" last>
          <Words label="behaviour during a partition" options={[{ v: "CP", label: "refuse (CP)" }, { v: "AP", label: "answer anyway (AP)" }]} value={choice} onChange={(c) => { setChoice(c); s.reset(); }} />
        </Row>
      </div>
      <svg viewBox="0 0 420 160" className="w-full max-w-[560px] justify-self-center" role="img" aria-label={f.note}>
        <Heads id={id} tones={["ref", "live"]} />
        {box(40, "A", f.a)}
        {box(260, "B", f.b)}
        <line x1={160} y1={80} x2={260} y2={80} stroke={linkDown ? "var(--dead)" : "var(--line-2)"} strokeWidth={1.5} strokeDasharray={linkDown ? "4 4" : undefined} />
        {linkDown && (
          <text x={210} y={72} textAnchor="middle" fontSize={16} fill="var(--dead)">✕</text>
        )}
        {f.msg && <path d="M164 88 L254 88" stroke="var(--live)" strokeWidth={1.5} markerEnd={`url(#${id}-h-live)`} />}
        <text x={100} y={30} textAnchor="middle" fontSize={11} fill="var(--faint)">left client</text>
        <text x={320} y={30} textAnchor="middle" fontSize={11} fill="var(--faint)">right client</text>
        <path d="M100 34 L100 50" stroke="var(--ref)" strokeWidth={1} markerEnd={`url(#${id}-h-ref)`} />
        <path d="M320 34 L320 50" stroke="var(--ref)" strokeWidth={1} markerEnd={`url(#${id}-h-ref)`} />
        {ask(100, f.left, f.leftTone)}
        {ask(320, f.right, f.rightTone)}
      </svg>
      <Narration minLines={3}>{f.note}</Narration>
      <StepControls s={s} />
      <Provenance drawn="the textbook two-replica example, not postgres output" />
    </div>
  );
}
