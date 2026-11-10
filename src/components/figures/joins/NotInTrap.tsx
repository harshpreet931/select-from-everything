"use client";

import { useState } from "react";
import { Narration, Provenance, Row, Words, ring, tint } from "@/components/figures/kit";

// the NOT IN trap, one instructor at a time. `x NOT IN (list)` is `x <> a AND x <> b AND ...`,
// and one NULL in the list makes one of those terms unknown for every x. the reader picks the
// form of the query and an instructor; the list, every `x <> v` and every verdict are captured
// results (postgres's own answers), looked up here, never computed.

type Col = { name: string; type?: string };
type Res = { columns: Col[]; rows: (string | null)[][] };
type V = string | null; // "t" | "f" | null

function Verdict({ v }: { v: V }) {
  if (v === "t")
    return (
      <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px]" style={{ color: "var(--live)", background: tint("live", 10), boxShadow: ring("live", 55) }}>
        true
      </span>
    );
  if (v === "f") return <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px] text-mute shadow-[inset_0_0_0_1px_var(--line-2)]">false</span>;
  return (
    <span className="inline-flex rounded-xs px-1.5 text-11 leading-[20px] text-mute italic" style={{ outline: "1px dashed var(--faint)", outlineOffset: -1 }}>
      unknown
    </span>
  );
}

const MODES = [
  { v: "in", label: "NOT IN (all the ids)", col: "not_in" },
  { v: "nn", label: "NOT IN (ids that aren't NULL)", col: "not_in_no_nulls" },
  { v: "ex", label: "NOT EXISTS", col: "not_exists" },
] as const;

export function NotInTrap({
  people,
  list,
  pairs,
  verdicts,
  start = 7,
  trace,
}: {
  /** instructors: id, name */
  people: Res;
  /** courses: code, instructor_id (the subquery's rows) */
  list: Res;
  /** every instructor against every course: id, code, instructor_id, ne (id <> instructor_id) */
  pairs: Res;
  /** id, name, not_in, not_in_no_nulls, not_exists */
  verdicts: Res;
  /** which instructor (row index) to expand first */
  start?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [mode, setMode] = useState<(typeof MODES)[number]["v"]>("in");
  const [pick, setPick] = useState(start);
  const m = MODES.find((x) => x.v === mode)!;
  const vc = verdicts.columns.findIndex((c) => c.name === m.col);
  const who = people.rows[pick];
  const id = who[0];
  // the distinct values in the list, NULL last, and this instructor's captured `id <> v` for each
  const terms = new Map<string, V>();
  for (const r of pairs.rows) if (r[0] === id && (mode !== "nn" || r[2] !== null)) terms.set(r[2] ?? "NULL", r[3]);
  const ordered = [...terms.entries()].sort((a, b) => (a[0] === "NULL" ? 1 : b[0] === "NULL" ? -1 : Number(a[0]) - Number(b[0])));
  const verdict = verdicts.rows[pick][vc];
  const kept = verdicts.rows.filter((r) => r[vc] === "t").length;
  const matches = list.rows.filter((r) => r[1] === id).map((r) => r[0]);

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="NOT IN against a list with a NULL in it, row by row">
      <Row k="query =" w="8ch" last align="baseline">
        <Words label="form of the query" options={MODES.map((x) => ({ v: x.v, label: x.label }))} value={mode} onChange={setMode} />
      </Row>

      <div className="grid min-w-0 gap-1.5">
        <div className="text-11 text-faint">{mode === "ex" ? "courses, searched once per instructor" : "the list: SELECT instructor_id FROM courses"}</div>
        <div className="flex flex-wrap gap-1.5">
          {list.rows.map((r, i) => {
            const isNull = r[1] === null;
            const gone = isNull && mode === "nn";
            const hit = mode === "ex" && r[1] === id;
            return (
              <span
                key={i}
                className="inline-flex items-baseline gap-1 rounded-xs px-1.5 text-11 leading-[20px] tabular transition-[box-shadow,opacity] duration-200 ease-sfe"
                style={{
                  boxShadow: isNull && !gone ? ring("hot", undefined, 1.5) : hit ? ring("live") : ring("line-2"),
                  background: isNull && !gone ? tint("hot", 8) : hit ? tint("live", 10) : undefined,
                  opacity: gone ? 0.4 : 1,
                  textDecoration: gone ? "line-through" : undefined,
                }}
              >
                <span className={isNull ? "text-faint italic" : "text-hi"}>{r[1] ?? "null"}</span>
                <span className="text-[10px] text-faint">{r[0]}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-3 @min-[620px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <ul className="grid content-start gap-1" aria-label="instructors and their verdicts">
          {people.rows.map((r, i) => {
            const v = verdicts.rows[i][vc];
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setPick(i)}
                  aria-pressed={i === pick}
                  className="flex w-full items-center justify-between gap-2 rounded-xs px-2 py-0.5 text-left text-12 transition-[box-shadow,background-color] duration-200 ease-sfe"
                  style={{ boxShadow: i === pick ? ring("hot") : undefined, background: v === "t" ? tint("live", 10) : undefined }}
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-1.5 text-faint tabular">{r[0]}</span>
                    <span className={v === "t" ? "text-hi" : "text-mute"}>{r[1]}</span>
                  </span>
                  <Verdict v={v} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="grid min-w-0 content-start gap-2 rounded-md bg-well px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="text-11 text-faint">
            {who[1]}, id {id}:
          </div>
          {mode === "ex" ? (
            <div className="text-12 leading-[1.9]">
              courses where instructor_id = {id}: {matches.length ? matches.map((c) => <span key={c} className="mr-1.5 text-hi">{c}</span>) : <span className="text-faint italic">none</span>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-12 leading-[1.9]">
              {ordered.map(([v, t], i) => (
                <span key={v} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-faint">AND</span>}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span className={v === "NULL" ? "text-hot" : "text-ink"}>
                      {id} &lt;&gt; {v}
                    </span>
                    <Verdict v={t} />
                  </span>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-line pt-2 text-12">
            <span className="text-faint">{mode === "ex" ? "NOT EXISTS is" : "so NOT IN is"}</span>
            <Verdict v={verdict} />
            <span className={verdict === "t" ? "text-live" : "text-mute"}>{verdict === "t" ? "kept" : "dropped"}</span>
          </div>
        </div>
      </div>

      <Narration minLines={3}>
        {kept === 0
          ? `0 rows. ${who[1]} is ${verdict === "f" ? "in the list, so false" : "unknown"}${verdict === null ? ": every term but the last is true, and true AND unknown is unknown" : ""}. the NULL from CS499 makes the last term unknown for every instructor, so nobody can come out true, and WHERE keeps only true.`
          : mode === "nn"
            ? `${kept} row${kept === 1 ? "" : "s"}. with the NULL filtered out of the list, every term for an instructor who teaches nothing is true, so the AND is true. same list, minus one NULL, opposite answer.`
            : `${kept} row${kept === 1 ? "" : "s"}. EXISTS asks "is there a course row where instructor_id = ${id} is true?" CS499's NULL makes that comparison unknown, and unknown just isn't a match. it never poisons anything.`}
      </Narration>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
