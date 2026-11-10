// parse a .scenario.sql file. the format (tools/pgtrace/README.md has the long version):
//
//   -- @title two updates and a repeatable read reader
//   -- @sessions T1 T2
//   -- @session T2 deadlock_timeout=10ms       SET for one session, at connect
//   -- @server wal_writer_delay=10s            postgresql.conf, at cluster start
//   -- @engine native | pglite                 default native
//   -- @db shop                                load datasets/shop before @setup
//   -- @ext pg_trgm                            more extensions (the inspection ones are always there)
//   -- @checksums                              initdb --data-checksums
//   -- @each xids heap(accounts)               probes after every step, from here on
//   -- @setup
//   CREATE TABLE …;                            runs in the observer, statement by statement
//   -- @step T1 "note"                         a statement in a session
//   -- @step T2 blocks errors=40001 +wal -heap "note"
//   -- @step obs "note"                        the observer session (VACUUM, CHECKPOINT, …)
//   -- @explain T1 [noanalyze] "note"          EXPLAIN (ANALYZE, BUFFERS, …, FORMAT JSON) of the sql
//   -- @stages T1 "note"                       then -- @stage FROM / -- @stage WHERE … queries
//                                             (-- @stage ORDER BY group=dept: shade runs of dept)
//   -- @probe +btree(accounts_pkey) "note"     no sql, just look
//   -- @crash "note"                           pg_ctl stop -m immediate
//   -- @restart +log "note"                    pg_ctl start, crash recovery runs
//
// a step's sql runs until the next directive. whole-line -- comments inside it are dropped.

import { splitSql } from "./split.mjs";

export const PROBES = ["xids", "locks", "buffers", "wal", "heap", "btree", "hash", "vm", "fsm", "rows", "stats", "log"];

/** "heap(accounts, 0-1)" → { name: "heap", args: ["accounts", "0-1"], key: "heap(accounts,0-1)" } */
export function parseProbe(s) {
  const m = /^([a-z]+)(?:\((.*)\))?$/.exec(s.trim());
  if (!m) throw new Error(`bad probe "${s}"`);
  const name = m[1];
  if (!PROBES.includes(name)) throw new Error(`unknown probe "${name}" (know: ${PROBES.join(", ")})`);
  const args = m[2] ? m[2].split(",").map((a) => a.trim()).filter(Boolean) : [];
  if (["heap", "btree", "hash", "vm", "fsm", "rows"].includes(name) && !args.length) throw new Error(`probe ${name} needs a relation: ${name}(name)`);
  return { name, args, key: `${name}(${args.join(",")})` };
}

/** split a directive's tail into words, keeping "quoted notes" (with \" escapes) and (parenthesised, args) whole */
function words(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i] === '"') {
      let j = i + 1;
      let v = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length) j++;
        v += s[j++];
      }
      out.push({ note: v });
      i = j + 1;
      continue;
    }
    let j = i;
    let depth = 0;
    while (j < s.length && (depth > 0 || !/\s/.test(s[j]))) {
      if (s[j] === "(") depth++;
      if (s[j] === ")") depth--;
      j++;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

function kv(list, line) {
  const out = {};
  for (const w of list) {
    if (typeof w !== "string") continue;
    const m = /^([A-Za-z_.][\w.]*)=(.*)$/.exec(w);
    if (!m) throw new Error(`line ${line}: expected key=value, got "${w}"`);
    out[m[1]] = m[2].replace(/^'(.*)'$/, "$1");
  }
  return out;
}

const stripComments = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim()
    .replace(/;\s*$/, "");

/**
 * @param {string} text the scenario file
 * @param {string} file its path, for messages
 */
export function parseScenario(text, file = "scenario") {
  const sc = {
    file,
    title: "",
    sessions: ["T1"],
    sessionSettings: {},
    server: {},
    engine: null,
    db: null,
    ext: [],
    checksums: false,
    setup: "",
    steps: [],
  };
  let sessionsDeclared = false;
  let each = null; // probes in force for following steps
  let cur = null; // { kind, lines, ... }
  const lines = text.split("\n");
  const fail = (n, msg) => {
    throw new Error(`${file}:${n}: ${msg}`);
  };

  const close = () => {
    if (!cur) return;
    const body = cur.lines.join("\n");
    if (cur.kind === "setup") sc.setup += (sc.setup ? "\n" : "") + body.trim();
    else if (cur.kind === "stage") {
      const sql = stripComments(body);
      if (!sql) fail(cur.line, "@stage needs a query");
      cur.parent.stages.push({ clause: cur.clause, note: cur.note, sql, ...(cur.group ? { group: cur.group } : {}) });
    } else if (cur.kind === "step") {
      const st = cur.step;
      const sql = stripComments(body);
      if (st.kind === "stages") {
        st.sql = sql; // optional: the full query, before the first @stage
      } else if (st.kind === "sql" || st.kind === "explain") {
        if (!sql) fail(st.line, `@${st.kind === "sql" ? "step" : st.kind} has no sql`);
        st.sql = sql;
      } else if (sql) fail(st.line, `@${st.kind} takes no sql`);
    }
    cur = null;
  };

  for (let n = 1; n <= lines.length; n++) {
    const line = lines[n - 1];
    const m = /^\s*--\s*@([a-z]+)\b(.*)$/.exec(line);
    if (!m) {
      if (cur) cur.lines.push(line);
      else if (line.trim() && !/^\s*--/.test(line)) fail(n, "sql outside a @setup or @step block");
      continue;
    }
    const [, dir, rest] = m;
    const w = words(rest);
    const note = w.find((x) => typeof x === "object")?.note;
    const plain = w.filter((x) => typeof x === "string");

    if (dir === "stage") {
      // belongs to the open @stages step; does not close it
      const parent = cur?.kind === "step" && cur.step.kind === "stages" ? cur.step : cur?.kind === "stage" ? cur.parent : null;
      if (!parent) fail(n, "@stage outside a @stages block");
      if (cur.kind === "stage") close();
      else {
        parent.sql = stripComments(cur.lines.join("\n"));
        cur = null;
      }
      // group=col: the column whose runs of equal values the stepper shades (GROUP BY buckets, DISTINCT ON keys)
      const groupWord = plain.find((x) => /^group=/.test(x));
      const clauseWords = plain.filter((x) => x !== groupWord);
      if (!clauseWords.length) fail(n, "@stage needs a clause name, like -- @stage WHERE");
      cur = { kind: "stage", parent, clause: clauseWords.join(" "), note, line: n, lines: [], ...(groupWord ? { group: groupWord.slice(6) } : {}) };
      continue;
    }

    close();
    switch (dir) {
      case "title":
        sc.title = rest.trim();
        break;
      case "sessions":
        if (!plain.length) fail(n, "@sessions needs names");
        for (const s of plain) if (!/^[A-Za-z][\w]*$/.test(s) || s === "obs" || s === "server") fail(n, `bad session name "${s}"`);
        sc.sessions = plain;
        sessionsDeclared = true;
        break;
      case "session": {
        const [name, ...settings] = plain;
        if (!sc.sessions.includes(name)) fail(n, `@session ${name}: declare it in @sessions first`);
        sc.sessionSettings[name] = { ...sc.sessionSettings[name], ...kv(settings, n) };
        break;
      }
      case "server":
        Object.assign(sc.server, kv(plain, n));
        break;
      case "engine":
        if (!["native", "pglite"].includes(plain[0])) fail(n, "@engine is native or pglite");
        sc.engine = plain[0];
        break;
      case "db":
        if (!/^[a-z][\w-]*$/.test(plain[0] ?? "")) fail(n, "@db needs a dataset name");
        sc.db = plain[0];
        break;
      case "ext":
        sc.ext.push(...plain);
        break;
      case "checksums":
        sc.checksums = true;
        break;
      case "each":
        each = plain.map((p) => {
          try {
            return parseProbe(p);
          } catch (e) {
            fail(n, e.message);
          }
        });
        break;
      case "setup":
        if (sc.steps.length) fail(n, "@setup must come before the first step");
        cur = { kind: "setup", line: n, lines: [] };
        break;
      case "step":
      case "explain":
      case "stages":
      case "probe":
      case "crash":
      case "restart": {
        const st = {
          line: n,
          kind: dir === "step" ? "sql" : dir,
          session: null,
          note,
          blocks: false,
          errors: null,
          add: [],
          remove: [],
          analyze: true,
          log: false,
          stages: [],
          probes: null,
          sql: "",
        };
        let args = plain;
        if (["step", "explain", "stages"].includes(dir)) {
          const s = args[0];
          if (!s) fail(n, `@${dir} needs a session`);
          if (s !== "obs" && !sc.sessions.includes(s)) fail(n, `unknown session "${s}"${sessionsDeclared ? "" : " (declare it with @sessions)"}`);
          st.session = s;
          args = args.slice(1);
        } else st.session = dir === "probe" ? "obs" : "server";
        for (const a of args) {
          if (a === "blocks") st.blocks = true;
          else if (a === "errors") st.errors = "*";
          else if (/^errors=[0-9A-Z]{5}$/.test(a)) st.errors = a.slice(7);
          else if (a === "noanalyze") st.analyze = false;
          else if (a === "+log" && dir === "restart") st.log = true;
          else if (a.startsWith("+")) {
            try {
              st.add.push(parseProbe(a.slice(1)));
            } catch (e) {
              fail(n, e.message);
            }
          } else if (a.startsWith("-")) st.remove.push(a.slice(1));
          else fail(n, `unknown flag "${a}" on @${dir}`);
        }
        if (st.blocks && st.session === "obs") fail(n, "the observer can't block");
        st.each = each;
        sc.steps.push(st);
        if (["step", "explain", "stages"].includes(dir)) cur = { kind: "step", step: st, line: n, lines: [] };
        break;
      }
      default:
        fail(n, `unknown directive @${dir}`);
    }
  }
  close();

  for (const st of sc.steps) {
    if (st.kind === "stages") {
      if (!st.stages.length && !st.sql) fail(st.line, "@stages needs a query or -- @stage blocks");
      if (!st.sql) st.sql = st.stages[st.stages.length - 1].sql;
    }
    // resolve probes: @each in force, then +add, then -remove (by name or exact key)
    const base = st.each ?? defaultProbes(sc);
    let list = [...base];
    for (const p of st.add) if (!list.some((q) => q.key === p.key)) list.push(p);
    for (const r of st.remove) list = list.filter((q) => q.name !== r && q.key !== r && q.key !== `${r}()`);
    if (st.kind === "crash") {
      for (const name of ["wal", "buffers"]) if (!list.some((q) => q.name === name)) list.push(parseProbe(name));
    }
    if (st.kind === "restart" && st.log && !list.some((q) => q.name === "log")) list.push(parseProbe("log"));
    st.probes = list;
    delete st.each;
    delete st.add;
    delete st.remove;
  }
  if (!sc.title) sc.title = file.replace(/^.*\//, "").replace(/\.scenario\.sql$/, "");
  sc.setupStatements = splitSql(sc.setup);
  return sc;
}

function defaultProbes(sc) {
  return sc.sessions.length > 1 ? [parseProbe("xids"), parseProbe("locks")] : [parseProbe("xids")];
}
