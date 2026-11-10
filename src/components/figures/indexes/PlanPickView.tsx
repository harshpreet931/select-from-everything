"use client";

import { useMemo, useState } from "react";
import { Narration, Provenance, Row, Words, fmt } from "@/components/figures/kit";
import { Sql } from "@/components/figures/kit/SqlPanel";
import { PlanDiagram } from "@/components/db/PlanTree";
import type { PlanNode } from "@/lib/db/views";

// pick an option, see the captured plan for it. with pages, a row of bars compares the buffer
// counts of every option at a glance (the picked one hot), so the reader sees the cost of the
// choice before reading the tree.

export type PickPlan = { label: string; group?: string; sql: string; note?: string; plan: PlanNode; pages?: number; tone?: "live" | "dead" };
type Facet = "est" | "actual" | "buffers" | "cost";

export function PlanPickView({
  items,
  keyLabel,
  groupLabel = "case",
  show,
  source,
}: {
  items: PickPlan[];
  keyLabel: string;
  groupLabel?: string;
  show: Facet[];
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  // with groups: a first row picks the group, a second the variant inside it (by position, so
  // "as written | fixed" stays picked when the group changes)
  const groups = [...new Set(items.map((x) => x.group).filter((g): g is string => !!g))];
  const [group, setGroup] = useState(groups[0]);
  const inGroup = groups.length ? items.filter((x) => x.group === group) : items;
  const [pos, setPos] = useState(0);
  const it = inGroup[Math.min(pos, inGroup.length - 1)];
  const setPick = (label: string) => setPos(Math.max(0, inGroup.findIndex((x) => x.label === label)));
  const facets = useMemo(() => new Set(show), [show]);
  const withPages = inGroup.every((x) => x.pages !== undefined);
  const top = withPages ? Math.max(...inGroup.map((x) => x.pages!)) : 1;
  const w = `${Math.max(keyLabel.length + 2, groups.length ? groupLabel.length + 2 : 0, 6)}ch`;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="pick a variant and see its real plan">
      <div>
        {groups.length > 0 && (
          <Row k={`${groupLabel} =`} w={w}>
            <Words label={groupLabel} options={groups} value={group!} onChange={setGroup} />
          </Row>
        )}
        <Row k={`${keyLabel} =`} w={w} last>
          <Words label={keyLabel} options={inGroup.map((x) => x.label)} value={it.label} onChange={setPick} />
        </Row>
      </div>
      <div className="min-w-0">
        <Sql code={it.sql} className="text-12 break-words" />
      </div>
      {withPages && (
        <div className="grid gap-1.5">
        <div className="text-11 text-faint">pages read by the whole query (Buffers: shared hit + read)</div>
        <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
          {inGroup.map((x) => {
            const on = x.label === it.label;
            return (
              <div key={x.label} className="contents">
                <button type="button" className="truncate text-left text-11" style={{ color: on ? "var(--hot)" : "var(--mute)" }} onClick={() => setPick(x.label)}>
                  {x.label}
                </button>
                <span className="relative h-[10px] rounded-[2px] bg-well-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[2px] transition-[width,opacity] duration-300 ease-sfe"
                    style={{ width: `${Math.max(0.8, (x.pages! / top) * 100)}%`, background: on ? "var(--hot)" : "var(--ink)", opacity: on ? 0.9 : 0.35 }}
                  />
                </span>
                <span className="text-right text-11 tabular" style={{ color: on ? "var(--hi)" : "var(--mute)" }}>
                  {fmt(x.pages!)} <span className="text-faint">pages</span>
                </span>
              </div>
            );
          })}
        </div>
        </div>
      )}
      <div className="min-w-0 rounded-md bg-well px-2 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
        <PlanDiagram key={`${it.group}|${it.label}`} plan={it.plan} show={facets} />
      </div>
      <Narration minLines={2}>
        {it.tone ? <span style={{ color: `var(--${it.tone})` }}>{it.tone === "live" ? "uses the index. " : "no index. "}</span> : null}
        {it.note}
      </Narration>
      <Provenance trace={source} />
    </div>
  );
}
