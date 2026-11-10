"use client";

import { useState } from "react";
import { Narration, Provenance, Words, tint } from "@/components/figures/kit";

// two real errors, as psql 18.6 prints them with \set VERBOSITY verbose (every field the server
// sent), taken apart. recorded against a throwaway postgres 18.6 server with the shop data.

type PartId = "severity" | "sqlstate" | "message" | "position" | "detail" | "hint" | "fields" | "location";
type Seg = { t: string; p?: PartId };

const EXAMPLES: { id: string; label: string; sql: string; lines: Seg[][] }[] = [
  {
    id: "typo",
    label: "a typo",
    sql: "SELECT nmae FROM customers WHERE id = 42;",
    lines: [
      [{ t: "ERROR", p: "severity" }, { t: ":  " }, { t: "42703", p: "sqlstate" }, { t: ": " }, { t: 'column "nmae" does not exist', p: "message" }],
      [{ t: "LINE 1: SELECT nmae FROM customers WHERE id = 42;", p: "position" }],
      [{ t: "               ^", p: "position" }],
      [{ t: 'HINT:  Perhaps you meant to reference the column "customers.name".', p: "hint" }],
      [{ t: "LOCATION:  errorMissingColumn, parse_relation.c:3870", p: "location" }],
    ],
  },
  {
    id: "rule",
    label: "a broken rule",
    sql: "INSERT INTO customers (name, email, country, created_at) VALUES ('Ada Again', 'ada@example.com', 'GB', '2026-10-28');",
    lines: [
      [
        { t: "ERROR", p: "severity" },
        { t: ":  " },
        { t: "23505", p: "sqlstate" },
        { t: ": " },
        { t: 'duplicate key value violates unique constraint "customers_email_key"', p: "message" },
      ],
      [{ t: "DETAIL:  Key (email)=(ada@example.com) already exists.", p: "detail" }],
      [{ t: "SCHEMA NAME:  public", p: "fields" }],
      [{ t: "TABLE NAME:  customers", p: "fields" }],
      [{ t: "CONSTRAINT NAME:  customers_email_key", p: "fields" }],
      [{ t: "LOCATION:  _bt_check_unique, nbtinsert.c:673", p: "location" }],
    ],
  },
];

const NOTES: Record<PartId, string> = {
  severity:
    "ERROR: this statement failed, and nothing it did is kept. a WARNING or NOTICE didn't stop anything. FATAL means your session is gone, PANIC means every session is.",
  sqlstate:
    "five characters that name the problem, the same in every language postgres speaks. the first two are the class (42: you wrote something postgres can't accept, 23: the data broke a rule). code checks these, never the words.",
  message: "the primary message: one short, factual line. postgres's style guide says no capital letter and no full stop, which is why they all look like this.",
  position:
    "where postgres was when it noticed: line 1, under nmae. it's a character position in your statement, and every client can draw this caret from it. this site draws it too.",
  detail: "DETAIL is the facts of this case: which key, which value. no guessing.",
  hint: "HINT is a suggestion. it's often right, but it's allowed to be wrong: it's postgres's best guess at what you meant.",
  fields:
    "the names of the things involved, as separate fields. an app can read constraint = customers_email_key instead of picking it out of the message (which changes with lc_messages).",
  location:
    "the function and the line in postgres's own C source that raised it. parse_relation.c is the part that looks up names; nbtinsert.c is the b-tree index that found the duplicate.",
};

const PARTS: PartId[] = ["severity", "sqlstate", "message", "position", "detail", "hint", "fields", "location"];

export function ErrorAnatomy() {
  const [ex, setEx] = useState("typo");
  const [part, setPart] = useState<PartId>("sqlstate");
  const e = EXAMPLES.find((x) => x.id === ex)!;
  const has = new Set(e.lines.flat().map((s) => s.p).filter(Boolean) as PartId[]);
  const active = has.has(part) ? part : "sqlstate";
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="the parts of a postgres error">
      <div className="grid gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
          <span className="w-[7ch] text-faint">error =</span>
          <Words options={EXAMPLES.map((x) => ({ v: x.id, label: x.label }))} value={ex} onChange={setEx} label="pick an error" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
          <span className="w-[7ch] text-faint">part =</span>
          <Words options={PARTS.filter((p) => has.has(p))} value={active} onChange={setPart} label="part of the error" />
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="border-b border-line px-3 py-2 text-12 whitespace-pre-wrap text-ink">
          <span className="text-faint">shop=# </span>
          {e.sql}
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 text-12 leading-[1.75]">
          {e.lines.map((line, i) => (
            <div key={i} className="whitespace-pre">
              {line.map((s, k) => {
                const on = s.p === active;
                return (
                  <span
                    key={k}
                    className="rounded-[2px] transition-[background-color,color,opacity] duration-200 ease-sfe"
                    style={{
                      color: on ? "var(--hot)" : s.p === "severity" || (s.p === "message" && i === 0) ? "var(--dead)" : s.p ? "var(--mute)" : "var(--faint)",
                      background: on ? tint("hot", 13) : undefined,
                    }}
                  >
                    {s.t}
                  </span>
                );
              })}
            </div>
          ))}
        </pre>
      </div>

      <Narration minLines={3}>
        <span className="mr-2 font-mono text-11 text-hot not-italic">{active}</span>
        {NOTES[active]}
      </Narration>
      <Provenance trace={{ scenario: "psql 18.6, \\set VERBOSITY verbose, on a throwaway server" }} />
    </div>
  );
}
