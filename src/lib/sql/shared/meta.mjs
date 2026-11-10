// fence meta for sql blocks, shared by rehype-code (hast), check.mjs and sql-check (mdast).
// both walk the document in order and call collectSqlBlocks with the same items, so a block
// gets the same id everywhere.
//
//   ```sql run db=shop                      runnable, on a fresh copy of the shop dataset
//   ```sql run db=shop session=orders       blocks in one session run in page order, as a chain
//   ```sql hidden session=orders            setup inside the chain, not rendered
//   ```sql run db=lab ext=pageinspect setup=bloat
//   ```sql run db=shop unordered            rows compared as a multiset ("row order not guaranteed")
//   ```sql run expect=error                 must end in an error
//   ```sql run errors=continue              keep going after an error, like psql without ON_ERROR_STOP
//   ```sql run volatile                     values change every run: compare the shape only
//   ```sql native db=shop                   checked on a real postgres server only, no run button
//   ```sql run nocheck                      runs in the browser but sql-check skips it (runner tests)
//   ```sql run rows=10 title="orders.sql" nolines {2} /amount/

import { fnv64 } from "./hash.mjs";
import { EXTENSIONS } from "./support.mjs";

const BARE = new Set(["run", "hidden", "native", "nocheck", "unordered", "volatile", "nolines", "showLineNumbers"]);
const KEYED = new Set(["db", "session", "ext", "setup", "expect", "errors", "rows", "title", "caption", "sqldata", "output"]);

/** shiki notation comments: -- [!code highlight] and friends. removed before running and hashing. */
export function stripNotation(code) {
  return code
    .split("\n")
    .map((l) => l.replace(/\s*(?:--|\/\*)\s*\[!code [^\]]+\](?:\s*\*\/)?\s*$/, ""))
    .join("\n");
}

/**
 * tokens of a fence meta string: key="quoted", key=value, {1,3-4}, /word/, "word", bare.
 * @param {string} meta
 */
export function tokenizeMeta(meta) {
  /** @type {{ key: string; value?: string; raw: string }[]} */
  const out = [];
  const re = /([A-Za-z][\w-]*)="((?:[^"\\]|\\.)*)"|([A-Za-z][\w-]*)=(\S+)|(\{[^}]*\})|(\/(?:[^/\\]|\\.)*\/)|("(?:[^"\\]|\\.)*")|(\S+)/g;
  for (const m of meta.matchAll(re)) {
    if (m[1]) out.push({ key: m[1], value: m[2], raw: m[0] });
    else if (m[3]) out.push({ key: m[3], value: m[4], raw: m[0] });
    else if (m[5] || m[6] || m[7]) out.push({ key: "", raw: m[0] }); // shiki highlights, not ours
    else out.push({ key: m[8], raw: m[0] });
  }
  return out;
}

/**
 * @typedef {{ id: string; sql: string; errors: "stop" | "continue" }} PreludeEntry
 * @typedef {{
 *   unordered?: true; expect?: "error"; errors?: "continue"; volatile?: true; rows?: number
 * }} SqlFlags
 * @typedef {{
 *   index: number; id: string; line: number; sql: string;
 *   run: boolean; hidden: boolean; native: boolean; nocheck: boolean;
 *   db: string; session?: string; ext: string[]; setup: string[];
 *   prelude: PreludeEntry[]; flags: SqlFlags; issues: string[]
 * }} SqlBlock
 */

/**
 * @param {{ lang?: string | null; meta?: string | null; value: string; line: number }[]} items every code block, in document order
 * @param {{ datasets?: string[]; setups?: Record<string, string[]> }} [opts] known datasets and their setups, when the caller can check them
 * @returns {SqlBlock[]} one block per sql item (lang "sql"); `index` points back into items
 */
export function collectSqlBlocks(items, opts = {}) {
  /** @type {SqlBlock[]} */
  const blocks = [];
  /** @type {Map<string, SqlBlock[]>} */
  const sessions = new Map();

  items.forEach((item, index) => {
    if (item.lang !== "sql") return;
    const issues = [];
    const tokens = tokenizeMeta(item.meta ?? "");
    const has = (k) => tokens.some((t) => t.key === k && t.value === undefined);
    const val = (k) => tokens.find((t) => t.key === k && t.value !== undefined)?.value;
    for (const t of tokens) {
      if (!t.key) continue;
      if (t.value === undefined ? !BARE.has(t.key) : !KEYED.has(t.key)) issues.push(`unknown flag "${t.raw}"`);
    }
    const run = has("run");
    const hidden = has("hidden");
    const native = has("native");
    const nocheck = has("nocheck");
    const session = val("session");
    const runner = run || hidden || native;

    /** @type {SqlFlags} */
    const flags = {};
    if (has("unordered")) flags.unordered = true;
    if (has("volatile")) flags.volatile = true;
    const expect = val("expect");
    if (expect !== undefined) {
      if (expect === "error") flags.expect = "error";
      else issues.push(`expect=${expect}: the only value is expect=error`);
    }
    const errors = val("errors");
    if (errors !== undefined) {
      if (errors === "continue") flags.errors = "continue";
      else if (errors !== "stop") issues.push(`errors=${errors}: use errors=continue (stop is the default)`);
    }
    const rows = val("rows");
    if (rows !== undefined) {
      if (/^[1-9]\d*$/.test(rows)) flags.rows = Number(rows);
      else issues.push(`rows=${rows}: needs a positive whole number`);
    }

    if (!runner) {
      for (const k of ["db", "session", "ext", "setup", "expect", "errors", "rows"]) {
        if (val(k) !== undefined) issues.push(`${k}= does nothing without run, hidden or native`);
      }
      for (const k of ["unordered", "volatile", "nocheck"]) if (has(k)) issues.push(`${k} does nothing without run`);
    }
    if (hidden && !session) issues.push("hidden needs session=<name>: it only makes sense as setup inside a chain");
    if (native && run) issues.push("native blocks have no run button: drop run");
    if (native && hidden) issues.push("native and hidden don't mix");
    if (nocheck && !run) issues.push("nocheck needs run");
    if (nocheck && session) issues.push("nocheck blocks can't be in a session: later blocks would run them too");
    if (session !== undefined && !/^[a-z][a-z0-9_-]*$/.test(session)) issues.push(`session=${session}: use lowercase letters, digits, - and _`);

    const list = (k) =>
      (val(k) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    let db = val("db");
    let ext = list("ext");
    let setup = list("setup");

    const chain = session ? sessions.get(session) : undefined;
    if (chain) {
      if (val("db") !== undefined || val("ext") !== undefined || val("setup") !== undefined) {
        issues.push(`only the first block of session "${session}" can set db, ext or setup`);
      }
      db = chain[0].db;
      ext = chain[0].ext;
      setup = chain[0].setup;
      if (chain.some((b) => b.native) !== native) issues.push(`session "${session}" mixes native and browser blocks`);
    }
    db ??= "empty";
    if (opts.datasets && !opts.datasets.includes(db)) issues.push(`db=${db}: no such dataset (have: ${opts.datasets.join(", ")})`);
    for (const e of ext) if (!EXTENSIONS.includes(e)) issues.push(`ext=${e}: not shipped to the browser (have: ${EXTENSIONS.join(", ")})`);
    if (opts.setups) for (const s of setup) if (!(opts.setups[db] ?? []).includes(s)) issues.push(`setup=${s}: dataset ${db} has no such setup`);

    const sql = stripNotation(item.value.replace(/\n$/, ""));
    /** @type {PreludeEntry[]} */
    const prelude = (chain ?? []).map((b) => ({ id: b.id, sql: b.sql, errors: b.flags.errors ?? "stop" }));
    const id = fnv64(
      JSON.stringify({ db, ext, setup, errors: flags.errors ?? "stop", prelude: prelude.map((p) => p.id), sql }),
    );
    /** @type {SqlBlock} */
    const block = { index, id, line: item.line, sql, run, hidden, native, nocheck, db, ext, setup, prelude, flags, issues };
    if (session) block.session = session;
    if (runner && session) {
      if (chain) chain.push(block);
      else sessions.set(session, [block]);
    }
    blocks.push(block);
  });

  // two blocks with the same id would share one golden. only possible with identical sql + context.
  const seen = new Map();
  for (const b of blocks) {
    if (!(b.run || b.native)) continue;
    const first = seen.get(b.id);
    if (first) b.issues.push(`same sql and context as the block on line ${first.line}: they'd share one golden. change one, or merge them`);
    else seen.set(b.id, b);
  }
  return blocks;
}

/** the part of a SqlBlock the page needs (rendered into data-sql) */
export function blockData(b) {
  const { index: _i, issues: _x, line: _l, ...rest } = b;
  return rest;
}
