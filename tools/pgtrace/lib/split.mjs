// split sql text into statements the way psql does: on top-level semicolons, skipping
// '…' (with ''), E'…' (with \'), "…", $tag$…$tag$, -- comments, nested /* */ and
// BEGIN ATOMIC … END bodies. returns { sql, offset } with the trailing semicolon dropped.

/** @returns {{ sql: string, offset: number }[]} */
export function splitSql(text) {
  const out = [];
  let start = 0;
  let i = 0;
  let depth = 0;
  let atomic = 0;
  let cases = 0;
  const n = text.length;
  const push = (end) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const sql = raw.trim();
    if (sql && !/^(--[^\n]*\n?\s*)+$/.test(sql + "\n")) out.push({ sql, offset: start + lead });
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "-" && d === "-") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      let lvl = 1;
      i += 2;
      while (i < n && lvl) {
        if (text[i] === "/" && text[i + 1] === "*") (lvl++, (i += 2));
        else if (text[i] === "*" && text[i + 1] === "/") (lvl--, (i += 2));
        else i++;
      }
      continue;
    }
    if (c === "'") {
      const escaped = i > 0 && /[eE]/.test(text[i - 1]) && (i < 2 || !/[\w$]/.test(text[i - 2]));
      i++;
      while (i < n) {
        if (escaped && text[i] === "\\") i += 2;
        else if (text[i] === "'" && text[i + 1] === "'") i += 2;
        else if (text[i] === "'") break;
        else i++;
      }
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < n) {
        if (text[i] === '"' && text[i + 1] === '"') i += 2;
        else if (text[i] === '"') break;
        else i++;
      }
      i++;
      continue;
    }
    if (c === "$" && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const m = /^\$([A-Za-z_][\w]*)?\$/.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
        continue;
      }
    }
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (/[A-Za-z_]/.test(c) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const m = /^[A-Za-z_][\w$]*/.exec(text.slice(i, i + 64));
      const w = m[0].toUpperCase();
      if (w === "ATOMIC" && /\bBEGIN\s*$/i.test(text.slice(Math.max(0, i - 16), i))) atomic++;
      else if (w === "CASE" && atomic > 0 && !/\bEND\s*$/i.test(text.slice(Math.max(0, i - 8), i))) cases++;
      else if (w === "END" && atomic > 0) {
        // END of BEGIN ATOMIC, unless it closes a CASE, or is END IF / END LOOP / END CASE
        const after = text.slice(i + 3, i + 12);
        if (/^\s*(IF|LOOP|CASE)\b/i.test(after)) {
          if (/^\s*CASE\b/i.test(after)) cases = Math.max(0, cases - 1);
        } else if (cases > 0) cases--;
        else atomic--;
      }
      i += m[0].length;
      continue;
    } else if (c === ";" && depth === 0 && atomic === 0) {
      push(i);
      start = i + 1;
    }
    i++;
  }
  push(n);
  return out;
}
