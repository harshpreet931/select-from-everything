"use client";

import { useState } from "react";
import { Narration, Provenance, SqlPanel, ring, tint } from "@/components/figures/kit";

// psql's prompt is a status line. the default is '%/%R%x%# ': the database, then what psql is
// waiting for, then the transaction state, then # (superuser) or > (anyone else). every line
// below is from a real psql 18.6 session against a throwaway postgres 18.6 server.

type P = { prompt: string; parts: [string, string][]; note: string; transcript: string; mark: number };

const PROMPTS: P[] = [
  {
    prompt: "shop=#",
    parts: [["shop", "the database you're connected to"], ["=", "ready for a new statement"], ["#", "you're a superuser"]],
    note: "the resting state. psql is connected to shop, nothing is half-typed, no transaction is open, and you can do anything (you're the superuser, postgres).",
    transcript: "shop=# SELECT name, city FROM customers WHERE id = 42;\n     name     |  city\n--------------+--------\n Ada Lovelace | London\n(1 row)",
    mark: 1,
  },
  {
    prompt: "shop=>",
    parts: [["shop", "the database"], ["=", "ready"], [">", "an ordinary role, not a superuser"]],
    note: "the same, logged in as a role that may only read. > instead of # is the hint that some things will be refused.",
    transcript: "shop=> DELETE FROM customers WHERE id = 42;\nERROR:  permission denied for table customers",
    mark: 2,
  },
  {
    prompt: "shop-#",
    parts: [["shop", "the database"], ["-", "the statement isn't finished: no semicolon yet"], ["#", "superuser"]],
    note: "you pressed enter before the semicolon. psql keeps collecting lines and sends nothing until it sees one.",
    transcript: "shop=# SELECT name, city\nshop-# FROM customers\nshop-# WHERE id = 42\nshop-# ;\n     name     |  city\n--------------+--------\n Ada Lovelace | London\n(1 row)",
    mark: 1,
  },
  {
    prompt: "shop'#",
    parts: [["shop", "the database"], ["'", "you're inside a string: a quote is still open"], ["#", "superuser"]],
    note: "an unclosed single quote. everything you type, enter included, is now part of the string until you close it.",
    transcript: "shop=# SELECT 'it''s\nshop'# fine';\n ?column?\n----------\n it's    +\n fine\n(1 row)",
    mark: 1,
  },
  {
    prompt: "shop(#",
    parts: [["shop", "the database"], ["(", "a parenthesis is still open"], ["#", "superuser"]],
    note: "an open parenthesis, usually a subquery you're halfway through.",
    transcript: "shop=# SELECT count(*) FROM (\nshop(# SELECT 1\nshop(# ) AS t;\n count\n-------\n     1\n(1 row)",
    mark: 1,
  },
  {
    prompt: "shop=*#",
    parts: [["shop", "the database"], ["=", "ready"], ["*", "a transaction is open"], ["#", "superuser"]],
    note: "you said BEGIN and haven't said COMMIT or ROLLBACK. nothing you change is visible to anyone else yet.",
    transcript: "shop=# BEGIN;\nBEGIN\nshop=*# SELECT name FROM customers WHERE id = 42;\n     name\n--------------\n Ada Lovelace\n(1 row)",
    mark: 2,
  },
  {
    prompt: "shop=!#",
    parts: [["shop", "the database"], ["=", "ready"], ["!", "the open transaction failed"], ["#", "superuser"]],
    note: "a statement inside the transaction failed. postgres now refuses everything until you ROLLBACK. the ! is the only warning you get.",
    transcript: "shop=*# SELECT nmae FROM customers;\nERROR:  column \"nmae\" does not exist\nLINE 1: SELECT nmae FROM customers;\n               ^\nHINT:  Perhaps you meant to reference the column \"customers.name\".\nshop=!# SELECT 1;\nERROR:  current transaction is aborted, commands ignored until end of transaction block\nshop=!# ROLLBACK;\nROLLBACK\nshop=#",
    mark: 2,
  },
];

export function PsqlPrompt() {
  const [i, setI] = useState(0);
  const p = PROMPTS[i];
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="what psql's prompt is telling you">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="pick a prompt">
        {PROMPTS.map((x, k) => (
          <button
            key={x.prompt}
            type="button"
            onClick={() => setI(k)}
            aria-pressed={k === i}
            className="rounded-xs px-2.5 py-1 text-13 transition-[background-color,box-shadow,color] duration-200 ease-sfe"
            style={{ boxShadow: k === i ? ring("hot", 60) : ring("line-2"), background: k === i ? tint("hot", 9) : undefined, color: k === i ? "var(--hot)" : "var(--hi)" }}
          >
            {x.prompt}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5" aria-label="the prompt, piece by piece">
        {p.parts.map(([ch, what], k) => (
          <div key={k} className="flex min-w-[5.5rem] flex-1 flex-col gap-1 rounded-md bg-well px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <span className="text-15" style={{ color: k === p.mark ? "var(--hot)" : "var(--hi)" }}>
              {ch}
            </span>
            <span className="text-11 leading-[1.4] text-mute">{what}</span>
          </div>
        ))}
      </div>

      <SqlPanel code={p.transcript} lang="psql" file="psql 18.6" nolines />
      <Narration minLines={2}>{p.note}</Narration>
      <Provenance trace={{ scenario: "a real psql session on a throwaway server" }} />
    </div>
  );
}
