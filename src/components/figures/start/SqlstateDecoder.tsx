"use client";

import { useState } from "react";
import { Narration, ring, tint } from "@/components/figures/kit";
import { Source } from "./Source";
import { SQLSTATE_CLASSES, SQLSTATES } from "./sqlstates";

// type or pick a SQLSTATE and take it apart: the class (first two characters), the condition
// (last three), the pl/pgsql condition name, and who defined it. the rules are the ones written
// at the top of postgres's errcodes.txt: classes starting 0-4 or A-H belong to the standard;
// inside those, a subclass starting 0-4 or A-H is the standard's too, one starting with P is
// postgres's own, and anything else (5-9, I-Z) was borrowed (mostly from DB2) or invented.

const PICKS = ["42601", "42P01", "42703", "42883", "42803", "22P02", "22012", "23502", "23503", "23505", "23514", "25P02", "40001", "40P01", "57014", "0A000"];
const std = (ch: string) => /[0-4A-H]/.test(ch);
const KEEP = new Set(["SQL", "XQuery", "PL/pgSQL", "WITH", "CHECK", "OPTION", "(SQL/MED)", "PostgreSQL"]);
const lower = (s: string) =>
  s
    .split(" ")
    .map((w) => (KEEP.has(w) ? w : w.toLowerCase()))
    .join(" ");

function origin(code: string): { who: string; tone: "live" | "meta" | "mute" } {
  if (code.startsWith("F0")) return { who: "postgres (configuration files aren't something the standard covers)", tone: "meta" };
  if (!std(code[0])) return { who: "not the standard: the whole class is implementation-defined", tone: "mute" };
  if (code.slice(2) === "000") return { who: "the SQL standard (the class's catch-all code)", tone: "live" };
  if (code[2] === "P") return { who: "postgres itself (a P subclass inside a standard class)", tone: "meta" };
  if (std(code[2])) return { who: "the SQL standard", tone: "live" };
  return { who: "not the standard: borrowed (often from IBM's DB2) or invented", tone: "mute" };
}

export function SqlstateDecoder() {
  const [code, setCode] = useState("23505");
  const c = code.toUpperCase();
  const cls = SQLSTATE_CLASSES.find(([k]) => k === c.slice(0, 2));
  const hit = SQLSTATES.find(([k]) => k === c);
  const full = c.length === 5;
  const o = full ? origin(c) : null;

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="take a SQLSTATE apart">
      <div className="flex flex-wrap gap-1" role="group" aria-label="common codes">
        {PICKS.map((p) => (
          <button key={p} type="button" className="word tabular" aria-pressed={p === c} onClick={() => setCode(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="grid items-center gap-4 @min-[560px]:grid-cols-[auto_minmax(0,1fr)]">
        <label className="flex items-center gap-3 text-12">
          <span className="text-faint">SQLSTATE =</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 5).toUpperCase())}
            maxLength={5}
            spellCheck={false}
            aria-label="a five-character SQLSTATE"
            className="w-[8ch] rounded-xs bg-bg px-2 py-1 text-center text-20 tracking-[0.12em] text-hi tabular outline-none"
            style={{ boxShadow: ring("line-2") }}
          />
        </label>
        <div className="flex items-stretch gap-1.5 text-center">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-3 py-2" style={{ background: tint("hot", 9), boxShadow: ring("hot", 50) }}>
            <span className="text-18 tracking-[0.12em] text-hot tabular">{c.slice(0, 2).padEnd(2, "·")}</span>
            <span className="text-11 text-mute">class: {cls ? lower(cls[1]) : "not a class postgres knows"}</span>
          </div>
          <div className="flex min-w-0 flex-[1.2] flex-col gap-0.5 rounded-md bg-well px-3 py-2" style={{ boxShadow: ring("line") }}>
            <span className="text-18 tracking-[0.12em] text-hi tabular">{c.slice(2, 5).padEnd(3, "·")}</span>
            <span className="text-11 text-mute">{hit ? hit[1] : full ? "postgres 18.6 doesn't define this one" : "type five characters"}</span>
          </div>
        </div>
      </div>

      <Narration minLines={2}>
        {o ? (
          <>
            who defined it: <span style={{ color: `var(--${o.tone})` }}>{o.who}</span>.
            {hit && (
              <>
                {" "}
                in pl/pgsql you can catch it as <code>{hit[1]}</code>.
              </>
            )}
          </>
        ) : (
          "a SQLSTATE is always five characters: digits and capital letters."
        )}
      </Narration>
      <Source>{`all ${SQLSTATES.length} codes and ${SQLSTATE_CLASSES.length} classes, from postgres 18.6's errcodes.txt`}</Source>
    </div>
  );
}
