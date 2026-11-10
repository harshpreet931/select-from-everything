"use client";

import { useId, useState, type ReactNode } from "react";
import { NARR, Provenance, Row, fmt, ring, tint, tokStyle, tokenizeSql, tv } from "@/components/figures/kit";

// what postgres parses when user input is glued into sql, next to the same input sent as a bound
// parameter. the glued text is tokenized live with the kit's sql tokenizer (the same colours as the
// code blocks), so the moment a quote in the input closes the string literal, the characters after
// it stop being data and turn into keywords, operators and comments. the outcomes shown for the
// preset inputs are postgres's own (a pgtrace capture on PGlite); other input is only tokenized.

type Outcome = { rows?: number; error?: { sqlstate: string; message: string } };
export type InjectionTry = { input: string; glued: Outcome; bound: Outcome };

export function Injection({
  before,
  after,
  bound,
  tries,
  start = 1,
  trace,
}: {
  /** the app's sql up to the opening quote, ending with ' */
  before: string;
  /** the app's sql from the closing quote on, starting with ' */
  after: string;
  /** the parameterized version, with $1 */
  bound: string;
  tries: InjectionTry[];
  start?: number;
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [input, setInput] = useState(tries[start]?.input ?? "");
  const id = useId();
  const known = tries.find((t) => t.input === input);

  const sql = before + input + after;
  const a = before.length;
  const b = a + input.length;
  const toks = tokenizeSql(sql);
  // the string literal the app opened: the token starting at its opening quote
  const lit = toks.find((t) => t.k === "str" && t.at === a - 1);
  const litEnd = lit ? lit.at + lit.t.length : a;
  // a quote inside the input closed it early: everything from that quote on is the user's code
  const dataEnd = lit && litEnd <= b ? litEnd - 1 : b;
  const injected = b - dataEnd;
  const eatenFrom = toks.find((t) => t.k === "cmt" && t.at < b && t.at + t.t.length > b);
  const eaten = !!eatenFrom;
  const injectedText = input.slice(dataEnd - a);
  const newStatement = /;/.test(injectedText.replace(/--.*$/, ""));

  // render the glued sql: token colours, plus the input's data part underlined live, the part that
  // became code tinted dead, and the app's own text that ended up inside a comment struck out
  const pieces: ReactNode[] = [];
  for (const t of toks) {
    const cuts = [t.at, t.at + t.t.length, a, dataEnd, b].filter((x) => x >= t.at && x <= t.at + t.t.length);
    const pts = [...new Set(cuts)].sort((x, y) => x - y);
    for (let i = 0; i < pts.length - 1; i++) {
      const from = pts[i];
      const to = pts[i + 1];
      if (to <= from) continue;
      const text = sql.slice(from, to);
      const code = from >= dataEnd && to <= b;
      const data = from >= a && to <= dataEnd;
      const lost = from >= b && t.k === "cmt";
      pieces.push(
        <span
          key={`${t.at}-${from}`}
          style={{
            ...tokStyle(t.k),
            ...(code ? { background: tint("dead", 10), boxShadow: `inset 0 -1.5px 0 ${tv("dead")}` } : {}),
            ...(data && input ? { boxShadow: `inset 0 -1.5px 0 color-mix(in srgb, var(--live) 70%, transparent)` } : {}),
            ...(lost ? { textDecoration: "line-through", opacity: 0.55 } : {}),
          }}
        >
          {text}
        </span>,
      );
    }
  }

  const outcome = (o: Outcome | undefined, glued: boolean) => {
    if (!o) return <span className="text-faint">not run: pick one of the tries to see what postgres did</span>;
    if (o.error)
      return (
        <span className="text-dead">
          ERROR {o.error.sqlstate}: {o.error.message}
        </span>
      );
    const n = o.rows ?? 0;
    const bad = glued && injected > 0 && n > 1;
    return (
      <span style={{ color: bad ? "var(--dead)" : "var(--live)" }}>
        {fmt(n)} {n === 1 ? "row" : "rows"}
      </span>
    );
  };

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12">
      <div>
        <Row k="email =" w="8ch">
          <label htmlFor={id} className="sr-only">
            what the user typed into the email box
          </label>
          <input
            id={id}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 60))}
            className="w-full min-w-0 border-b border-line-2 bg-transparent py-1 font-mono text-14 text-hi outline-none focus:border-hi"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
        </Row>
        <Row k="try =" w="8ch" last>
          {tries.map((t) => (
            <button key={t.input} type="button" className="word" aria-pressed={input === t.input} onClick={() => setInput(t.input)}>
              {t.input}
            </button>
          ))}
        </Row>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[680px]:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2.5 rounded-md p-3" style={{ boxShadow: ring(injected ? "dead" : "line-2", injected ? 70 : undefined) }}>
          <div className="text-11 text-faint">glued into the string · what postgres parses</div>
          <pre className="text-12 leading-[1.8] break-words whitespace-pre-wrap" aria-live="polite">
            {pieces}
          </pre>
          <div className="text-11 leading-[1.6]" style={{ color: injected ? "var(--dead)" : "var(--faint)" }}>
            {injected
              ? `the quote closed the string. ${injected} character${injected === 1 ? "" : "s"} you typed ${injected === 1 ? "is" : "are"} SQL now.`
              : input
                ? "harmless this time: no quote, so it all stayed inside the string."
                : "an empty email: still just a string."}
          </div>
          <div className="text-11">
            <span className="text-faint">postgres returned · </span>
            {outcome(known?.glued, true)}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-2.5 rounded-md p-3" style={{ boxShadow: ring("live", 70) }}>
          <div className="text-11 text-faint">bound parameter · what postgres parses</div>
          <pre className="text-12 leading-[1.8] break-words whitespace-pre-wrap">
            {tokenizeSql(bound).map((t, i) => (
              <span key={i} style={{ ...tokStyle(t.k), ...(t.k === "param" ? { boxShadow: ring("ref", 70), borderRadius: 2 } : {}) }}>
                {t.t}
              </span>
            ))}
          </pre>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-12">
            <span className="text-ref">$1</span>
            <span className="text-faint">=</span>
            <span className="min-w-0 rounded-[2px] px-1 break-all" style={{ color: "var(--live)", background: tint("live", 12) }}>
              {input === "" ? <span className="text-faint italic">empty</span> : input}
            </span>
            <span className="text-11 text-faint">one text value</span>
          </div>
          <div className="text-11 leading-[1.6] text-faint">sent in its own message, after the sql was parsed. it can only ever be a value.</div>
          <div className="text-11">
            <span className="text-faint">postgres returned · </span>
            {outcome(known?.bound, false)}
          </div>
        </div>
      </div>

      <p className={NARR} aria-live="polite">
        {!injected ? (
          <>type a quote somewhere in the email and watch the left side.</>
        ) : (
          <>
            {newStatement ? (
              <>the quote ends the string and the semicolon ends the statement, so a second one starts: whatever comes next runs with the app&apos;s permissions. </>
            ) : (
              <>the quote ends the string, and what follows is part of the WHERE clause now. </>
            )}
            {eaten ? (
              <>
                <code>--</code> comments out the app&apos;s own leftovers (struck through), so the query still parses.
              </>
            ) : (
              <>the app&apos;s closing quote is still there, so this one may not even parse.</>
            )}
          </>
        )}
      </p>
      {trace && <Provenance trace={trace} />}
    </div>
  );
}
