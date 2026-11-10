// split a block of sql into statements the way psql does, so each one runs on its own
// (a multi-statement string would be one implicit transaction: VACUUM fails, an error rolls
// back everything before it). a subset of psql's lexer:
//   'strings' with '' escapes, E'strings' with backslash escapes, "identifiers",
//   $tag$ dollar quotes $tag$, -- line comments, nested /* block comments */,
//   parentheses, and CREATE FUNCTION ... BEGIN ATOMIC ... END bodies.
// the worker never parses sql: the page and sql-check split with this file.

const isIdentStart = (c) => /[A-Za-z_\u0080-￿]/.test(c);
const isIdentChar = (c) => /[A-Za-z0-9_$\u0080-￿]/.test(c);

/**
 * walk the text once and call back for every region.
 * kind: "code" | "string" | "ident" | "dollar" | "comment"
 * @param {string} text
 * @param {(kind: string, from: number, to: number) => void} on
 */
function lex(text, on) {
  const n = text.length;
  let i = 0;
  let codeFrom = 0;
  const flush = (to) => {
    if (to > codeFrom) on("code", codeFrom, to);
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "-" && d === "-") {
      flush(i);
      let j = text.indexOf("\n", i);
      if (j < 0) j = n;
      on("comment", i, j);
      i = codeFrom = j;
      continue;
    }
    if (c === "/" && d === "*") {
      flush(i);
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (text[j] === "/" && text[j + 1] === "*") (depth++, (j += 2));
        else if (text[j] === "*" && text[j + 1] === "/") (depth--, (j += 2));
        else j++;
      }
      on("comment", i, j);
      i = codeFrom = j;
      continue;
    }
    if (c === "'") {
      // E'...' (or e'...') takes backslash escapes, when the E is its own token
      const prev = text[i - 1];
      const escaped = (prev === "E" || prev === "e") && !isIdentChar(text[i - 2] ?? " ");
      flush(i);
      let j = i + 1;
      while (j < n) {
        if (escaped && text[j] === "\\") j += 2;
        else if (text[j] === "'" && text[j + 1] === "'") j += 2;
        else if (text[j] === "'") break;
        else j++;
      }
      j = Math.min(n, j + 1);
      on("string", i, j);
      i = codeFrom = j;
      continue;
    }
    if (c === '"') {
      flush(i);
      let j = i + 1;
      while (j < n) {
        if (text[j] === '"' && text[j + 1] === '"') j += 2;
        else if (text[j] === '"') break;
        else j++;
      }
      j = Math.min(n, j + 1);
      on("ident", i, j);
      i = codeFrom = j;
      continue;
    }
    if (c === "$" && !isIdentChar(text[i - 1] ?? " ")) {
      const m = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(text.slice(i, i + 64));
      if (m) {
        flush(i);
        const tag = m[0];
        const close = text.indexOf(tag, i + tag.length);
        const j = close < 0 ? n : close + tag.length;
        on("dollar", i, j);
        i = codeFrom = j;
        continue;
      }
    }
    i++;
  }
  flush(n);
}

/**
 * the same text with string, identifier and dollar-quote contents and all comments blanked
 * to spaces (delimiters kept, newlines kept). offsets stay valid. good for regex lints.
 * @param {string} text
 */
export function maskSql(text) {
  let out = "";
  let at = 0;
  lex(text, (kind, from, to) => {
    out += text.slice(at, from);
    const part = text.slice(from, to);
    if (kind === "code") out += part;
    else if (kind === "comment") out += part.replace(/[^\n]/g, " ");
    else {
      // keep the delimiters so `FROM '` still reads as "a string comes next"
      const open = kind === "dollar" ? /^\$[^$]*\$/.exec(part)?.[0] ?? "$" : part[0];
      const closed = part.length > open.length && part.endsWith(kind === "dollar" ? open : part[0]);
      const tail = closed ? (kind === "dollar" ? open : part[0]) : "";
      out += open + part.slice(open.length, part.length - tail.length).replace(/[^\n]/g, " ") + tail;
    }
    at = to;
  });
  return out + text.slice(at);
}

/**
 * masked text with everything inside parentheses blanked too: what's left is the statement's
 * top level. `SELECT ... FROM (SELECT ... ORDER BY x) s` has no top-level ORDER BY.
 * @param {string} text
 */
export function topLevelSql(text) {
  const m = maskSql(text);
  let depth = 0;
  let out = "";
  for (const c of m) {
    if (c === "(") {
      depth++;
      out += depth === 1 ? "(" : " ";
    } else if (c === ")") {
      out += depth === 1 ? ")" : " ";
      depth = Math.max(0, depth - 1);
    } else out += depth > 0 && c !== "\n" ? " " : c;
  }
  return out;
}

/**
 * @typedef {{ sql: string; offset: number; end: number; line: number; col: number }} SplitStatement
 * sql: the statement text (from its first token, through its semicolon if it has one)
 * offset/end: utf-16 offsets in the block. line/col: 1-based position of the first token.
 */

/**
 * psql-style statement split. comments and blank lines between statements are skipped.
 * @param {string} text
 * @returns {SplitStatement[]}
 */
export function splitSql(text) {
  /** @type {SplitStatement[]} */
  const out = [];
  let start = -1; // offset of the current statement's first token, -1 when between statements
  let last = 0; // end of the last token that wasn't whitespace or a comment
  let paren = 0;
  let begin = 0;
  let words = []; // first identifiers of the statement, lowercased (CREATE OR REPLACE FUNCTION)
  const routine = () =>
    words[0] === "create" &&
    (words[1] === "function" ||
      words[1] === "procedure" ||
      (words[1] === "or" && words[2] === "replace" && (words[3] === "function" || words[3] === "procedure")));

  const finish = (end) => {
    if (start < 0) return;
    const sql = text.slice(start, Math.min(end, last)).replace(/\s+$/, "");
    if (sql) {
      const before = text.slice(0, start);
      const line = before.split("\n").length;
      const col = start - before.lastIndexOf("\n");
      out.push({ sql, offset: start, end: start + sql.length, line, col });
    }
    start = -1;
    paren = 0;
    begin = 0;
    words = [];
  };

  lex(text, (kind, from, to) => {
    if (kind === "comment") return;
    if (kind !== "code") {
      if (start < 0) start = from;
      last = to;
      return;
    }
    let i = from;
    while (i < to) {
      const c = text[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (start < 0) start = i;
      last = i + 1;
      if (c === "(") paren++;
      else if (c === ")") paren = Math.max(0, paren - 1);
      else if (c === ";" && paren === 0 && begin === 0) {
        finish(i + 1);
        i++;
        continue;
      } else if (isIdentStart(c) && !isIdentChar(text[i - 1] ?? " ")) {
        let j = i + 1;
        while (j < to && isIdentChar(text[j])) j++;
        last = j;
        const w = text.slice(i, j).toLowerCase();
        if (words.length < 4) words.push(w);
        if (paren === 0 && routine()) {
          if (w === "begin") begin++;
          else if (w === "case" && begin > 0) begin++;
          else if (w === "end" && begin > 0) begin--;
        }
        i = j;
        continue;
      }
      i++;
    }
  });
  finish(text.length);
  return out;
}

/**
 * the statement under a cursor (utf-16 offset): the one containing it, else the nearest one
 * before it, else the first.
 * @param {SplitStatement[]} stmts
 * @param {number} at
 */
export function statementAt(stmts, at) {
  let best = null;
  for (const s of stmts) {
    if (s.offset <= at) best = s;
    if (at <= s.end) return best ?? s;
  }
  return best ?? stmts[0] ?? null;
}

/**
 * a postgres error position (1-based, counted in characters of the statement) → utf-16 offset
 * in the block that contained the statement.
 * @param {string} sql statement text
 * @param {number} offset the statement's offset in the block
 * @param {number} position 1-based character position from the server
 */
export function positionToOffset(sql, offset, position) {
  let cp = 0;
  let i = 0;
  while (i < sql.length && cp < position - 1) {
    const code = sql.codePointAt(i) ?? 0;
    i += code > 0xffff ? 2 : 1;
    cp++;
  }
  return offset + i;
}

/** utf-16 offset → 1-based { line, col } (col in characters, tabs count as one) */
export function lineCol(text, at) {
  const before = text.slice(0, at);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line, col: [...text.slice(lineStart, at)].length + 1 };
}
