"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Words, tint, type LegendItem } from "@/components/figures/kit";

// a uuid's 32 hex digits, coloured by what they are. both kinds carry a version digit (13th) and
// variant bits (17th digit); a version 7 starts with 48 bits of unix milliseconds. the version,
// the embedded time and the millisecond count are captured (uuid_extract_version,
// uuid_extract_timestamp, and the first 12 hex digits read as a number by postgres).

export type UuidRow = { uuid: string; version: string; time: string | null; ms: string };
type Field = "time" | "version" | "variant" | "random";

const fieldOf = (i: number, v7: boolean): Field => (v7 && i < 12 ? "time" : i === 12 ? "version" : i === 16 ? "variant" : "random");
const colour: Record<Field, string> = { time: "var(--hot)", version: "var(--meta)", variant: "var(--meta)", random: "var(--ink)" };

export function UuidAnatomy({ rows, notes, trace }: { rows: Record<string, UuidRow>; notes: Record<string, string>; trace?: { engine?: { version?: string; build?: string }; scenario?: string } }) {
  const labels = Object.keys(rows);
  const [pick, setPick] = useState(labels[labels.length - 1]);
  const r = rows[pick];
  const v7 = r.version === "7";
  const hex = r.uuid.replace(/-/g, "");
  const legend: LegendItem[] = [["meta", "version and variant"], ["ink", "random"]];
  if (v7) legend.unshift(["hot", "unix time, milliseconds"]);
  const groups = [8, 4, 4, 4, 12];
  let at = 0;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the parts of a uuid">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line pb-2 text-12 @min-[520px]:grid-cols-[6ch_minmax(0,1fr)]">
        <span className="pt-0.5 text-faint">uuid =</span>
        <Words options={labels} value={pick} onChange={setPick} label="which uuid" />
      </div>
      <div className="flex flex-wrap justify-center gap-x-1 gap-y-2 rounded-md bg-well px-2 py-4 text-[1.05rem] tabular shadow-[inset_0_0_0_1px_var(--line)] @min-[520px]:text-[1.3rem]" role="img" aria-label={r.uuid}>
        {groups.map((n, g) => {
          const from = at;
          at += n;
          return (
            <span key={g} className="inline-flex items-center">
              {g > 0 && <span className="mr-1 text-faint">-</span>}
              {Array.from({ length: n }, (_, j) => {
                const i = from + j;
                const f = fieldOf(i, v7);
                return (
                  <span key={i} className="inline-block w-[1.1ch] text-center transition-colors duration-200 ease-sfe" style={{ color: colour[f], background: f === "time" ? tint("hot", 10) : f === "random" ? undefined : tint("meta", 12) }}>
                    {hex[i]}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 text-12 @min-[560px]:grid-cols-[22ch_minmax(0,1fr)]">
        <dt className="text-faint">uuid_extract_version</dt>
        <dd className="m-0 text-hi">{r.version}</dd>
        <dt className="text-faint">first 12 hex digits</dt>
        <dd className="m-0 tabular">{Number(r.ms).toLocaleString("en-US")}</dd>
        <dt className="text-faint">uuid_extract_timestamp</dt>
        <dd className="m-0 tabular" style={{ color: r.time ? "var(--hot)" : "var(--faint)", fontStyle: r.time ? undefined : "italic" }}>
          {r.time ?? "null"}
        </dd>
      </dl>
      <Narration minLines={3}>{notes[pick]}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend items={legend} />
        {trace && <Provenance trace={trace} />}
      </div>
    </div>
  );
}
