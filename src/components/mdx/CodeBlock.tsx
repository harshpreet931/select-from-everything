"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore, type ComponentProps } from "react";
import { useSqlRunner, phaseText } from "@/components/code/useSqlRunner";
import { ResultGrid } from "@/components/code/ResultGrid";
import { sqlCantRun, sqlCaveat } from "@/components/code/sqlSupport";
import { goldenToView, useGolden } from "@/lib/sql/golden";
import { canonicalStatement, digest, MASKS } from "@/lib/sql/shared/format.mjs";
import { splitSql } from "@/lib/sql/shared/split.mjs";
import { sessionText, sessionVersion, setSessionText, subscribeSession } from "@/lib/sql/session";
import { datasets, sqlManifest, sqlWarm, type SqlRunResult } from "@/lib/sql";
import type { GoldenBlock, SqlBlockData } from "@/lib/sql/types";
import { site } from "@/lib/site";

// codemirror only loads when someone presses "edit"
const SqlEditor = dynamic(() => import("@/components/code/SqlEditor").then((m) => m.SqlEditor), {
  ssr: false,
  loading: () => <div className="min-h-32 px-5 py-4 font-mono text-12 text-faint">loading the editor…</div>,
});

type PreProps = ComponentProps<"pre"> & {
  "data-raw"?: string;
  "data-title"?: string;
  "data-run"?: string;
  "data-output"?: string;
  "data-language"?: string;
  "data-nolines"?: string;
  "data-sql"?: string;
};

const LANG_LABEL: Record<string, string> = {
  sql: "sql",
  plpgsql: "pl/pgsql",
  psql: "psql",
  plan: "plan",
  bash: "terminal",
  sh: "terminal",
  shell: "terminal",
  console: "terminal",
  text: "text",
  plaintext: "text",
  txt: "text",
  json: "json",
  diff: "diff",
};

const TIMEOUT_S = 10;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

/** does a live run say the same as the golden? the same check sql-check makes (digests, timing masked) */
function sameAsGolden(r: SqlRunResult, g: GoldenBlock, flags: SqlBlockData["flags"]) {
  const f = { unordered: !!flags.unordered, volatile: !!flags.volatile };
  return (
    r.statements.length === g.statements.length &&
    (r.txn ?? "I") === (g.txn ?? "I") &&
    r.statements.every((s, i) => digest(canonicalStatement(s, f, MASKS.timing)) === g.statements[i].digest)
  );
}

const splitForView = (sql: string) => splitSql(sql).map((s) => ({ sql: s.sql, offset: s.offset }));

/** every fenced code block lands here. file tab and copy; sql blocks with `run` also run and edit in the browser. */
export function CodeBlock(props: PreProps) {
  const {
    children,
    className,
    style,
    "data-raw": raw = "",
    "data-title": title,
    "data-run": _run,
    "data-output": output,
    "data-language": lang = "text",
    "data-nolines": nolines,
    "data-sql": sqlJson,
    ...rest
  } = props;
  const block = useMemo<SqlBlockData | null>(() => {
    if (!sqlJson) return null;
    try {
      return JSON.parse(sqlJson) as SqlBlockData;
    } catch {
      return null;
    }
  }, [sqlJson]);
  const original = block?.sql ?? raw;
  const golden = useGolden(block?.id);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(original);
  const runner = useSqlRunner();
  useSyncExternalStore(subscribeSession, sessionVersion, () => 0);

  const isSql = lang === "sql" && !!block;
  const blocked = useMemo(() => (isSql ? sqlCantRun(code) : null), [isSql, code]);
  const runnable = isSql && !!block?.run && !blocked;
  const canRun = runnable && runner.supported;
  const edited = code !== original;
  const chainEdited = !!block?.prelude.some((p) => sessionText(p.id) !== undefined);
  const label = title ?? LANG_LABEL[lang] ?? lang;
  const short = raw.split("\n").length <= 1;
  const db = block?.db ?? "empty";
  const tables = datasets[db]?.tables;
  const schema = useMemo(() => (tables ? Object.fromEntries(tables.map((t) => [t.name, t.columns.map((c) => c.name)])) : undefined), [tables]);

  const onEdit = useCallback(
    (v: string) => {
      setCode(v);
      if (block?.session) setSessionText(block.id, v === original ? null : v);
    },
    [block, original],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const doRun = () => {
    if (!block || !canRun) return;
    void runner.run(
      { sql: code, db: block.db, ext: block.ext, setup: block.setup, prelude: block.prelude },
      { errors: block.flags.errors ?? "stop", timeoutMs: TIMEOUT_S * 1000 },
    );
  };
  const warm = () => runner.warm(db);

  const { result, running, partial } = runner;
  const live = result ?? (running ? { statements: partial } : null);
  const goldenView = useMemo(() => (golden ? goldenToView(golden, splitForView) : null), [golden]);
  const verdict =
    result && golden && block && !result.fatal && !result.timedOut && !result.aborted && !result.setupError
      ? block.flags.volatile
        ? "volatile"
        : sameAsGolden(result, golden, block.flags)
          ? "same"
          : edited || chainEdited
            ? "edited"
            : "differs"
      : null;
  const caveat = result && isSql ? sqlCaveat(code) : null;
  const priorBlocks = block?.prelude.length ?? 0;
  const stopped = !!(result?.timedOut || result?.aborted);

  return (
    <div className="code-frame my-9 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line py-1 pr-1.5 pl-4">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          {title ? (
            <span className="truncate font-mono text-12 text-ink">{label}</span>
          ) : (
            <span className="font-display text-[0.95rem] text-accent italic">{label}</span>
          )}
          {isSql && block && (block.run || block.native) && (
            <span className="font-mono text-11 text-faint">
              {db === "empty" ? "empty db" : `db=${db}`}
              {block.ext.length > 0 && <> · ext={block.ext.join(",")}</>}
              {block.setup.length > 0 && <> · setup={block.setup.join(",")}</>}
              {block.session && <> · session {block.session}</>}
            </span>
          )}
          {edited && <span className="font-display text-[0.9rem] text-hot italic">edited</span>}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {canRun && (
            <>
              {editing && edited && (
                <button
                  className="word !min-h-7 !px-2"
                  onClick={() => {
                    onEdit(original);
                    runner.clear();
                  }}
                >
                  reset
                </button>
              )}
              <button className="word !min-h-7 !px-2" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                {editing ? "done" : "edit"}
              </button>
              <button
                className="act solid !min-h-7 !px-2.5 !text-12"
                onClick={running ? runner.stop : doRun}
                onMouseEnter={warm}
                onFocus={warm}
                title={
                  sqlWarm()
                    ? `runs on postgres ${site.pg.version} in your browser · ⌘↵ while editing`
                    : `runs on postgres ${site.pg.version} in your browser. the first run downloads ≈ ${mb(sqlManifest.download)} · ⌘↵ while editing`
                }
              >
                {running ? "stop" : "run"}
              </button>
            </>
          )}
          <button onClick={copy} className="word !min-h-7 !px-2" aria-label="copy code" data-on={copied ? "" : undefined}>
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>

      {block?.session && priorBlocks > 0 && (
        <div className="border-b border-line px-4 py-1.5 font-mono text-11 text-faint">
          continues session <span className="text-mute">{block.session}</span> ({priorBlocks} earlier block{priorBlocks === 1 ? "" : "s"} run
          first)
          {chainEdited && <span className="text-hot"> · an earlier block was edited</span>}
        </div>
      )}

      {editing ? (
        <SqlEditor
          value={code}
          onChange={onEdit}
          onRun={doRun}
          schema={schema}
          autoFocus
          minHeight={Math.min(480, original.split("\n").length * 23 + 32)}
        />
      ) : (
        <pre {...rest} className={className} style={{ ...style, background: "transparent" }} data-language={lang}>
          {nolines !== undefined || short ? <NoLines>{children}</NoLines> : children}
        </pre>
      )}

      {isSql && block && (live || goldenView || blocked || block.native) ? (
        <div className="border-t border-line px-4 py-3" aria-live="polite">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-display text-[0.95rem] text-accent italic">
              {running
                ? phaseText(runner.phase, runner.status, db)
                : live
                  ? "output"
                  : block.native
                    ? `output, from a real postgres ${site.pg.version} server`
                    : goldenView
                      ? `output, from postgres ${site.pg.version}`
                      : ""}
            </span>
            {result && !result.fatal && !stopped && (
              <span className="font-mono text-11 text-faint tabular">
                ran in {Math.max(1, Math.round(result.execMs))} ms · fresh {db} database
              </span>
            )}
          </div>

          {live ? (
            <ResultGrid
              view={live}
              code={code}
              rows={block.flags.rows ?? 20}
              stoppedAt={stopped ? (result?.running ?? live.statements.length) : undefined}
              stopReason={
                result?.timedOut ? `stopped after ${TIMEOUT_S} seconds. postgres was restarted, so the next run starts clean.` : "stopped."
              }
            />
          ) : goldenView ? (
            <ResultGrid view={goldenView} code={original} rows={block.flags.rows ?? 20} />
          ) : null}

          {result?.setupError && (
            <p className="mt-2 font-mono text-12 text-dead">
              the setup for this block failed ({result.setupError.sqlstate}: {result.setupError.message}). that&apos;s a bug in the book,
              not in your code.
            </p>
          )}
          {result?.fatal && <p className="mt-2 text-14 text-dead italic">{result.fatal}</p>}

          {(verdict || result?.fingerprintMismatch || caveat || (block.flags.unordered && result)) && (
            <div className="mt-3 flex flex-col gap-1 text-14 italic">
              {verdict === "same" && <span className="text-live">same as postgres {site.pg.version} output.</span>}
              {verdict === "edited" && <span className="text-mute">different from the book&apos;s output, since you changed the code.</span>}
              {verdict === "volatile" && <span className="text-mute">these values change on every run, so they won&apos;t match the book&apos;s.</span>}
              {verdict === "differs" && (
                <span className="text-hot">the browser engine disagrees with the book here. postgres {site.pg.version} printed:</span>
              )}
              {result?.fingerprintMismatch && (
                <span className="text-hot">your browser built a different {db} database than the book&apos;s, so results can differ.</span>
              )}
              {block.flags.unordered && result && <span className="text-faint">row order isn&apos;t guaranteed here, so yours may differ.</span>}
              {caveat && <span className="text-mute">{caveat}</span>}
            </div>
          )}
          {verdict === "differs" && goldenView && (
            <ResultGrid className="mt-3" view={goldenView} code={original} rows={block.flags.rows ?? 20} />
          )}

          {block.native && (
            <p className="mt-3 text-14 text-faint italic">
              checked on a real postgres {site.pg.version} server. the browser engine can&apos;t run this one{blocked ? ` (${blocked})` : ""}.
            </p>
          )}
          {!block.native && blocked && block.run && (
            <p className="mt-3 text-14 text-faint italic">this one needs a real server ({blocked}), so it doesn&apos;t run in the browser.</p>
          )}
          {!runner.supported && block.run && !blocked && (
            <p className="mt-3 text-14 text-faint italic">
              this browser can&apos;t run the database (it needs web workers and webassembly), so this is the book&apos;s output.
            </p>
          )}
        </div>
      ) : (
        output && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-1 font-display text-[0.95rem] text-accent italic">output</div>
            <div className="overflow-x-auto font-mono text-13 leading-[1.7] whitespace-pre text-hi">{output}</div>
          </div>
        )
      )}
    </div>
  );
}

/** marks the <code> child so line numbers are hidden */
function NoLines({ children }: { children: React.ReactNode }) {
  if (children && typeof children === "object" && "props" in (children as object)) {
    const el = children as React.ReactElement<Record<string, unknown>>;
    return <el.type {...el.props} data-nolines="" />;
  }
  return <>{children}</>;
}
