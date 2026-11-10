"use client";

import { useState, type ReactNode } from "react";
import { displayCell, isPlan } from "@/lib/sql/shared/format.mjs";
import { lineCol, positionToOffset } from "@/lib/sql/shared/split.mjs";
import type { SqlError, SqlRunView, StatementResult } from "@/lib/sql/types";

// the result of a run, one panel per statement: a table (or the command tag), notices, errors
// with a caret under the exact character, EXPLAIN plans as text. the same component draws a
// golden before anyone runs the block and the live result after.
// (no <pre> or <code> in here: .code-frame styles those for the source above.)

const fmt = (n: number) => n.toLocaleString("en-US");
const CELL_CHARS = 64;

/** psql's names for a few types whose catalog names read oddly */
const TYPE_LABEL: Record<string, string> = { bpchar: "char", "bpchar[]": "char[]" };
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

export function ResultGrid({
  view,
  code,
  rows = 20,
  stoppedAt,
  stopReason,
  className = "",
}: {
  view: SqlRunView;
  /** the block's source: error positions point into it */
  code: string;
  /** rows shown per statement before "show all" */
  rows?: number;
  /** the statement that was running when the run was stopped */
  stoppedAt?: number;
  stopReason?: ReactNode;
  className?: string;
}) {
  const many = view.statements.length > 1 || stoppedAt !== undefined;
  const lastError = [...view.statements].reverse().find((s) => s.error);
  const stoppedEarly =
    lastError && view.statements[view.statements.length - 1] === lastError && lastError.i < countStatements(code, view) - 1;
  return (
    <div className={`space-y-3 ${className}`} data-pagefind-ignore>
      {view.statements.map((r) => (
        <Statement key={r.i} r={r} code={code} rows={rows} numbered={many} />
      ))}
      {stoppedAt !== undefined && (
        <div className="font-mono text-12 text-hot">
          {many && <span className="text-faint">#{stoppedAt + 1} · </span>}
          {stopReason ?? "stopped"}
        </div>
      )}
      {stoppedEarly && stoppedAt === undefined && (
        <p className="text-14 text-faint italic">the statements after this one didn&apos;t run.</p>
      )}
      {view.txn === "T" && <p className="font-mono text-12 text-hot">still in a transaction (no COMMIT yet)</p>}
      {view.txn === "E" && <p className="font-mono text-12 text-dead">transaction aborted: ROLLBACK to continue</p>}
    </div>
  );
}

/** how many statements the block has (results only list the ones that ran) */
function countStatements(code: string, view: SqlRunView) {
  const last = view.statements[view.statements.length - 1];
  if (!last) return 0;
  // anything after the last statement's text that isn't blank or a comment is another statement
  const rest = code.slice(last.offset + last.sql.length).replace(/--[^\n]*|\/\*[\s\S]*?\*\/|\s|;/g, "");
  return last.i + 1 + (rest ? 1 : 0);
}

function Statement({ r, code, rows, numbered }: { r: StatementResult; code: string; rows: number; numbered: boolean }) {
  const head = (
    <div className="mb-1 font-mono text-11 text-faint tabular">
      {numbered && <>#{r.i + 1} · </>}
      {r.error ? <span className="text-dead">ERROR {r.error.sqlstate}</span> : r.tag || "(empty)"}
      {r.ms > 0 && <> · {r.ms < 10 ? r.ms.toFixed(1) : fmt(Math.round(r.ms))} ms</>}
    </div>
  );
  return (
    <section aria-label={`statement ${r.i + 1}`}>
      {(numbered || r.columns || r.copyOut !== undefined) && head}
      {r.notices.map((n, i) => (
        <div key={i} className="font-mono text-12 leading-[1.6] break-words whitespace-pre-wrap text-mute">
          {n.severity}: {n.message}
          {n.detail && <div className="pl-4">DETAIL: {n.detail}</div>}
          {n.hint && <div className="pl-4">HINT: {n.hint}</div>}
        </div>
      ))}
      {r.error ? (
        <ErrorView e={r.error} r={r} code={code} />
      ) : r.copyOut !== undefined ? (
        <div className="max-h-[22rem] overflow-auto rounded-md bg-bg px-3 py-2 font-mono text-12 leading-[1.6] whitespace-pre text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          {r.copyOut.replace(/\n$/, "") || <span className="text-faint italic">(no data)</span>}
          {r.truncated && <div className="mt-1 text-faint">… stopped reading after 2 MB</div>}
        </div>
      ) : r.columns && isPlan(r) ? (
        <Plan r={r} />
      ) : r.columns ? (
        <Table r={r} rows={rows} />
      ) : (
        !numbered && <div className="font-mono text-13 text-ink">{r.tag || "(empty query)"}</div>
      )}
    </section>
  );
}

function Table({ r, rows }: { r: StatementResult; rows: number }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<[number, number] | null>(null);
  const cols = r.columns ?? [];
  const total = r.truncated?.total ?? r.rowCount ?? r.rows.length;
  const limit = all ? r.rows.length : Math.min(rows, r.rows.length);
  const shown = r.rows.slice(0, limit);
  const cutByEngine = r.truncated && r.truncated.total !== null && r.rows.length < r.truncated.total;
  const opened = open ? r.rows[open[0]]?.[open[1]] : null;
  return (
    <div>
      <div className="max-h-[26rem] w-fit max-w-full overflow-auto rounded-md bg-bg shadow-[inset_0_0_0_1px_var(--line)]">
        {/* inside .prose: every font and size is set here so the prose table styles don't apply */}
        <table className="!w-auto border-collapse font-mono text-12 leading-[1.5]">
          <thead className="sticky top-0 z-[1] bg-bg">
            <tr>
              {cols.map((c, j) => {
                const right = displayCell("0", c.type).align === "right";
                return (
                  <th
                    key={j}
                    scope="col"
                    className={`border-b border-line-2 px-3 pt-2 pb-1.5 font-mono text-12 font-normal whitespace-nowrap ${right ? "text-right" : "text-left"}`}
                  >
                    <span className="text-hi">{c.name}</span>
                    <span className="ml-1.5 text-11 text-faint">{typeLabel(c.type)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => {
                  const d = displayCell(v, cols[j]?.type ?? "text", { maxChars: CELL_CHARS });
                  const long = v !== null && (v.length > CELL_CHARS || v.includes("\n"));
                  const isOpen = open?.[0] === i && open?.[1] === j;
                  return (
                    <td
                      key={j}
                      className={`border-t border-b-0 border-line px-3 py-[5px] font-mono text-12 whitespace-nowrap tabular ${d.align === "right" ? "text-right" : "text-left"}`}
                      style={{
                        color: d.isNull || d.empty ? "var(--faint)" : "var(--ink)",
                        fontStyle: d.isNull ? "italic" : undefined,
                        background: isOpen ? "var(--well-2)" : undefined,
                      }}
                    >
                      {long ? (
                        <button
                          type="button"
                          className="cursor-pointer text-left hover:text-hi"
                          onClick={() => setOpen(isOpen ? null : [i, j])}
                          aria-expanded={isOpen}
                          title="show the whole value"
                        >
                          {d.text}
                        </button>
                      ) : (
                        d.text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {opened !== null && opened !== undefined && open && (
        <div className="mt-2 max-h-64 overflow-auto rounded-md bg-bg px-3 py-2 font-mono text-12 leading-[1.6] break-all whitespace-pre-wrap text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="mb-1 text-11 text-faint">
            {cols[open[1]]?.name}, row {open[0] + 1}, {fmt([...opened].length)} characters ·{" "}
            <button type="button" className="text-link hover:underline" onClick={() => setOpen(null)}>
              close
            </button>
          </div>
          {opened}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-11 text-faint tabular">
        <span>
          ({fmt(total)} row{total === 1 ? "" : "s"})
        </span>
        {cutByEngine && r.truncated!.kept > 50 && <span className="text-hot">the page kept the first {fmt(r.rows.length)}</span>}
        {r.rows.length > limit && (
          <span>
            showing {fmt(limit)} ·{" "}
            <button type="button" className="text-link hover:underline" onClick={() => setAll(true)}>
              show {cutByEngine ? `all ${fmt(r.rows.length)}` : "all"}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function Plan({ r }: { r: StatementResult }) {
  let text = r.rows.map((row) => row[0] ?? "").join("\n");
  // FORMAT JSON comes back as one value: pretty it
  if (r.rows.length === 1 && /^\s*[[{]/.test(text)) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {}
  }
  return (
    <div className="max-h-[26rem] overflow-auto rounded-md bg-bg px-3 py-2 font-mono text-12 leading-[1.6] whitespace-pre text-ink shadow-[inset_0_0_0_1px_var(--line)]">
      {text}
    </div>
  );
}

function ErrorView({ e, r, code }: { e: SqlError; r: StatementResult; code: string }) {
  let caret: ReactNode = null;
  if (e.position) {
    const at = positionToOffset(r.sql, r.offset, e.position);
    const { line, col } = lineCol(code, at);
    const src = code.split("\n")[line - 1] ?? "";
    const gutter = `${line} │ `;
    caret = (
      <div className="mt-1 overflow-x-auto font-mono text-12 leading-[1.5] whitespace-pre">
        <div className="text-ink">
          <span className="text-faint">{gutter}</span>
          {src}
        </div>
        <div className="text-dead" aria-hidden>
          {" ".repeat(gutter.length + Math.max(0, col - 1))}^
        </div>
        <span className="sr-only">
          at line {line}, column {col}
        </span>
      </div>
    );
  }
  let inner: ReactNode = null;
  if (e.internalQuery) {
    const pos = e.internalPosition ?? 0;
    const before = [...e.internalQuery].slice(0, Math.max(0, pos - 1)).join("");
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineNo = before.split("\n").length;
    const line = e.internalQuery.split("\n")[lineNo - 1] ?? "";
    inner = (
      <div className="mt-1 overflow-x-auto font-mono text-12 leading-[1.5] whitespace-pre text-mute">
        <div>QUERY: {line}</div>
        {pos > 0 && <div className="text-dead">{" ".repeat(7 + [...before.slice(lineStart)].length)}^</div>}
      </div>
    );
  }
  return (
    <div role="alert">
      <div className="font-mono text-13 leading-[1.6] break-words whitespace-pre-wrap text-dead">
        {e.severity} {e.sqlstate}: {e.message}
      </div>
      {caret}
      <div className="font-mono text-12 leading-[1.6] break-words whitespace-pre-wrap text-mute">
        {e.detail && <div>DETAIL: {e.detail}</div>}
        {e.hint && <div>HINT: {e.hint}</div>}
      </div>
      {inner}
      {e.where && (
        <div className="font-mono text-12 leading-[1.6] break-words whitespace-pre-wrap text-faint">CONTEXT: {e.where}</div>
      )}
    </div>
  );
}
