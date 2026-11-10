"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSqlRunner, phaseText, runSummary } from "@/components/code/useSqlRunner";
import { ResultGrid, typeLabel } from "@/components/code/ResultGrid";
import { sqlCantRun, sqlCaveat } from "@/components/code/sqlSupport";
import { datasetNames, datasets, resetSql, sqlManifest, sqlSchema, sqlWarm, type SchemaTable } from "@/lib/sql";
import { goldenToView } from "@/lib/sql/golden";
import { canonicalStatement, digest, MASKS } from "@/lib/sql/shared/format.mjs";
import { splitSql, statementAt } from "@/lib/sql/shared/split.mjs";
import type { GoldenBlock } from "@/lib/sql/types";
import { track } from "@/lib/analytics";
import { site } from "@/lib/site";
import examplesFile from "./examples.gen.json";

const SqlEditor = dynamic(() => import("@/components/code/SqlEditor").then((m) => m.SqlEditor), {
  ssr: false,
  loading: () => <div className="min-h-[360px] px-5 py-4 font-mono text-12 text-faint">loading the editor…</div>,
});

type Example = { id: string; label: string; db: string; sql: string; golden: GoldenBlock | null };
const examples = examplesFile.examples as unknown as Example[];

const SAVE = "sfe-play-v1";
const KEY = "play";
const TIMEOUT_S = 30;
const DDL = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i;

// share links carry the sql in the url hash, deflate-compressed and base64url-encoded
async function pack(code: string) {
  const stream = new Blob([code]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function unpack(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const splitForView = (sql: string) => splitSql(sql).map((s) => ({ sql: s.sql, offset: s.offset }));
const fmt = (n: number) => n.toLocaleString("en-US");

export function Playground() {
  const [db, setDb] = useState(examples[0]?.db ?? "empty");
  const [code, setCode] = useState(examples[0]?.sql ?? "");
  const [exampleId, setExampleId] = useState<string | null>(examples[0]?.id ?? null);
  const [keep, setKeep] = useState(true);
  const [ranCode, setRanCode] = useState("");
  const [shared, setShared] = useState(false);
  const [liveTables, setLiveTables] = useState<SchemaTable[] | null>(null);
  const runner = useSqlRunner();
  const loaded = useRef(false);

  // restore: a shared link wins, then your last visit, then the first example
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const params = new URLSearchParams(location.hash.slice(1));
    const sharedSql = params.get("sql");
    const sharedDb = params.get("db");
    if (sharedSql) {
      unpack(sharedSql)
        .then((s) => {
          setCode(s);
          setExampleId(null);
          if (sharedDb && datasets[sharedDb]) setDb(sharedDb);
        })
        .catch(() => {});
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE) ?? "null") as { db?: string; sql?: string } | null;
      if (saved?.sql) {
        setCode(saved.sql);
        if (saved.db && datasets[saved.db]) setDb(saved.db);
        setExampleId(examples.find((e) => e.sql === saved.sql && e.db === saved.db)?.id ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE, JSON.stringify({ db, sql: code }));
    } catch {}
  }, [db, code]);

  // the engine and this dataset start loading as soon as the page is open
  useEffect(() => {
    runner.warm(db);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const example = examples.find((e) => e.id === exampleId);
  const pristine = !!example && example.sql === code && example.db === db;
  const blocked = useMemo(() => sqlCantRun(code), [code]);
  const info = datasets[db];
  const tables: SchemaTable[] = liveTables ?? (info?.tables as SchemaTable[] | undefined) ?? [];
  const schema = useMemo(() => Object.fromEntries(tables.map((t) => [t.name, t.columns.map((c) => c.name)])), [tables]);

  const execute = useCallback(
    async (sql: string, how: "all" | "statement" | "peek" = "all") => {
      setRanCode(sql);
      const r = await runner.run({ sql, db, keep: keep ? KEY : undefined }, { timeoutMs: TIMEOUT_S * 1000 });
      // an unedited example or not, never the sql itself
      track("playground_run", { ...runSummary(r), how, example: examples.some((e) => e.sql === sql && e.db === db), keep });
      if (keep && r.ok && DDL.test(sql)) {
        const t = await sqlSchema(KEY);
        if (t) setLiveTables(t);
      }
    },
    [runner, db, keep],
  );

  const runAll = useCallback(() => {
    if (!runner.running && !blocked) void execute(code);
  }, [runner.running, blocked, execute, code]);

  const runStatement = useCallback(
    (at: number) => {
      const s = statementAt(splitSql(code), at);
      if (s && !runner.running && !sqlCantRun(s.sql)) void execute(s.sql, "statement");
    },
    [code, runner.running, execute],
  );

  const freshDatabase = useCallback(async () => {
    await resetSql(KEY);
    setLiveTables(null);
    runner.clear();
  }, [runner]);

  const pickDb = (name: string) => {
    if (name === db) return;
    setDb(name);
    setExampleId(null);
    void freshDatabase();
  };

  const pickExample = (e: Example) => {
    setCode(e.sql);
    setExampleId(e.id);
    if (e.db !== db) setDb(e.db);
    void freshDatabase();
    history.replaceState(null, "", location.pathname);
  };

  const peek = (table: string) => {
    const q = `SELECT * FROM ${/^[a-z_][a-z0-9_]*$/.test(table) ? table : `"${table.replace(/"/g, '""')}"`} ORDER BY 1 LIMIT 10;`;
    setCode((c) => (c.trim() ? `${c.replace(/\s+$/, "")}\n\n${q}` : q));
    setExampleId(null);
    if (!runner.running) void execute(q, "peek");
  };

  const share = async () => {
    const h = await pack(code);
    const hash = `db=${encodeURIComponent(db)}&sql=${h}`;
    history.replaceState(null, "", `#${hash}`);
    try {
      await navigator.clipboard.writeText(`${location.origin}/play#${hash}`);
    } catch {}
    setShared(true);
    track("playground_shared", { db });
    setTimeout(() => setShared(false), 1800);
  };

  const { result, running, partial, supported } = runner;
  const live = result ?? (running ? { statements: partial } : null);
  const goldenView = useMemo(() => (pristine && example?.golden ? goldenToView(example.golden, splitForView) : null), [pristine, example]);
  const verdict = useMemo(() => {
    if (!result || !pristine || !example?.golden || ranCode !== code || result.fatal || result.timedOut || result.aborted) return null;
    if (result.sessionLost) return null;
    const g = example.golden;
    const same =
      result.statements.length === g.statements.length &&
      (result.txn ?? "I") === g.txn &&
      result.statements.every((s, i) => digest(canonicalStatement(s, {}, MASKS.timing)) === g.statements[i].digest);
    return same ? "same" : "differs";
  }, [result, pristine, example, ranCode, code]);
  const stopped = !!(result?.timedOut || result?.aborted);
  const caveat = result ? sqlCaveat(ranCode) : null;
  const txn = result?.txn;

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-center justify-center gap-1" role="tablist" aria-label="examples">
        {examples.map((e) => (
          <button key={e.id} role="tab" aria-selected={exampleId === e.id} className="word" onClick={() => pickExample(e)}>
            {e.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-12">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="dataset">
          <span className="mr-1 text-faint">db =</span>
          {datasetNames.map((n) => (
            <button key={n} className="word" aria-pressed={db === n} onClick={() => pickDb(n)} title={datasets[n].blurb}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-mute select-none">
            <input
              type="checkbox"
              className="accent-[var(--hi)]"
              checked={keep}
              onChange={(e) => {
                setKeep(e.target.checked);
                void freshDatabase();
              }}
            />
            keep changes between runs
          </label>
          {keep && (
            <button className="word" onClick={() => void freshDatabase()} title={`throw away your changes and start from a fresh ${db} database`}>
              reset database
            </button>
          )}
        </div>
      </div>
      {info && <p className="mt-2 text-15 text-mute italic">{info.blurb}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* editor */}
          <div className="overflow-hidden rounded-lg bg-well shadow-[inset_0_0_0_1px_var(--line)]">
            <div className="flex h-11 items-center justify-between gap-3 border-b border-line pr-2 pl-4">
              <span className="truncate font-mono text-12 text-ink">
                query.sql <span className="text-faint">· {db}</span>
              </span>
              <div className="flex items-center gap-1">
                <button className="word" onClick={share}>
                  {shared ? "link copied" : "share"}
                </button>
                {example && !pristine && (
                  <button className="word" onClick={() => pickExample(example)}>
                    reset
                  </button>
                )}
                <button
                  className="act solid !min-h-8 !px-3.5"
                  onClick={running ? runner.stop : runAll}
                  disabled={!supported || (!running && !!blocked)}
                  title={sqlWarm() ? "run everything · ⌘↵ (⇧⌘↵ runs the statement under the cursor)" : `the first run downloads ≈ ${(sqlManifest.download / 1e6).toFixed(1)} MB`}
                >
                  {running ? "stop" : "run"} <span className="opacity-60">⌘↵</span>
                </button>
              </div>
            </div>
            <SqlEditor key={db} value={code} onChange={setCode} onRun={runAll} onRunStatement={runStatement} schema={schema} minHeight={360} label="sql editor" />
          </div>

          {/* schema */}
          <div className="rounded-lg bg-well px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-display text-[1.05rem] text-accent italic">tables in {db}</span>
              <span className="font-mono text-11 text-faint">click one to look inside</span>
            </div>
            {tables.length ? (
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {tables.map((t) => (
                  <li key={t.name} className="min-w-0 font-mono text-12">
                    <button className="text-hi hover:text-link" onClick={() => peek(t.name)}>
                      {t.name}
                    </button>
                    {t.kind !== "table" && <span className="ml-1.5 text-faint">{t.kind}</span>}
                    {t.rows !== null && t.rows !== undefined && t.rows >= 0 && !liveTables && (
                      <span className="ml-1.5 text-faint tabular">{fmt(t.rows)} rows</span>
                    )}
                    <ul className="mt-1 space-y-0.5 border-l border-line pl-3">
                      {t.columns.map((c) => (
                        <li key={c.name} className="truncate text-11 leading-[1.6]">
                          <span className={c.pk ? "text-hi" : "text-ink"}>{c.name}</span> <span className="text-faint">{typeLabel(c.type)}</span>
                          {c.pk && <span className="ml-1 text-mute">pk</span>}
                          {c.fk && <span className="ml-1 text-ref">→ {c.fk}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-14 text-faint italic">no tables yet. CREATE TABLE something.</p>
            )}
          </div>
        </div>

        {/* output */}
        <div
          className="flex min-h-[300px] min-w-0 flex-col self-start overflow-hidden rounded-lg bg-well shadow-[inset_0_0_0_1px_var(--line)] lg:sticky lg:top-[calc(var(--bar-h)+16px)] lg:max-h-[calc(100dvh-var(--bar-h)-32px)]"
          aria-live="polite"
        >
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <span className="font-display text-[1.05rem] text-accent italic">
              {running ? phaseText(runner.phase, runner.status, db) : live ? "output" : goldenView ? `output, from postgres ${site.pg.version}` : "output"}
            </span>
            <span className="flex items-center gap-2 font-mono text-11 text-faint tabular">
              {result && !result.fatal && !stopped && <span>{Math.max(1, Math.round(result.execMs))} ms</span>}
              {keep && txn === "T" && <span className="rounded-xs px-1.5 py-0.5 text-hot shadow-[inset_0_0_0_1px_var(--line-2)]">in a transaction</span>}
              {keep && txn === "E" && <span className="rounded-xs px-1.5 py-0.5 text-dead shadow-[inset_0_0_0_1px_var(--line-2)]">transaction aborted</span>}
              {!result && runner.status === "ready" && !running && <span>postgres {site.pg.version} ready</span>}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3.5">
            {!supported ? (
              <p className="text-15 text-mute italic">this browser can&apos;t run the database: it needs web workers, webassembly and compression streams.</p>
            ) : blocked && !running ? (
              <p className="text-15 text-mute italic">
                this needs a real server ({blocked}). copy it into psql to try it.
              </p>
            ) : live ? (
              <ResultGrid
                view={live}
                code={ranCode}
                rows={50}
                stoppedAt={stopped ? (result?.running ?? live.statements.length) : undefined}
                stopReason={
                  result?.timedOut
                    ? `stopped after ${TIMEOUT_S} seconds. postgres was restarted${keep ? ", and your changes went with it" : ""}.`
                    : `stopped. postgres was restarted${keep ? ", and your changes went with it" : ""}.`
                }
              />
            ) : goldenView ? (
              <ResultGrid view={goldenView} code={code} rows={50} />
            ) : (
              <p className="text-15 text-faint italic">press run, or ⌘↵ in the editor.</p>
            )}
          </div>
          {result && (result.fatal || result.sessionLost || result.fingerprintMismatch || caveat || verdict) && (
            <div className="shrink-0 space-y-1 border-t border-line px-4 py-2.5 text-14 italic">
              {result.fatal && <p className="text-dead">{result.fatal}</p>}
              {result.sessionLost && (
                <p className="text-hot">the last run was stopped, so this one started from a fresh {db} database.</p>
              )}
              {verdict === "same" && <p className="text-live">same as postgres {site.pg.version} printed for this example.</p>}
              {verdict === "differs" && (
                <p className="text-hot">different from what postgres {site.pg.version} printed for this example (did an earlier run change the data?).</p>
              )}
              {result.fingerprintMismatch && (
                <p className="text-hot">your browser built a different {db} database than the book&apos;s, so results can differ.</p>
              )}
              {caveat && <p className="text-mute">{caveat}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
