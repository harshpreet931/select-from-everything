// sql blocks in an mdx file, from the mdast: the same items, in the same order, that
// src/mdx/rehype-code.mjs builds from the hast, through the same collectSqlBlocks. so check.mjs,
// sql-check and the page agree on every block id.
// also: the playground examples (src/components/play/examples/*.sql) as single blocks.

import fs from "node:fs";
import path from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import { collectSqlBlocks } from "../../src/lib/sql/shared/meta.mjs";

const parser = createProcessor();

/** code nodes in document order, as collectSqlBlocks items */
export function codeItems(src) {
  const tree = parser.parse(src);
  const items = [];
  const walk = (n) => {
    if (n.type === "code") items.push({ lang: n.lang ?? null, meta: n.meta ?? "", value: n.value ?? "", line: n.position?.start.line ?? 0 });
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
  return items;
}

/**
 * @param {string} src mdx source
 * @param {{ datasets?: string[]; setups?: Record<string, string[]> }} [opts]
 */
export function sqlBlocksOf(src, opts) {
  return collectSqlBlocks(codeItems(src), opts);
}

/** the golden file next to an mdx file */
export const goldenPathFor = (mdx) => mdx.replace(/\.mdx$/, ".golden.json");

/* ---- playground examples ---------------------------------------------------------------- */

export const examplesDir = "src/components/play/examples";
export const examplesGolden = "src/components/play/examples.gen.json";

/**
 * an example file: `-- @label <text>` and `-- @db <name>` header lines, then the sql.
 * @returns {{ id: string; label: string; db: string; sql: string; flags: Record<string, true> }}
 */
export function readExample(file) {
  const text = fs.readFileSync(file, "utf8");
  const head = {};
  const lines = text.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^--\s*@(\w+)\s*(.*)$/.exec(lines[i]);
    if (!m) break;
    head[m[1]] = m[2].trim();
  }
  const sql = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  const flags = {};
  for (const f of (head.flags ?? "").split(/\s+/).filter(Boolean)) flags[f] = true;
  return { id: path.basename(file, ".sql"), label: head.label ?? path.basename(file, ".sql"), db: head.db ?? "empty", sql, flags };
}

/** examples as SqlBlocks (one run block each), so they go through the same checks */
export function exampleBlocks(files, opts) {
  return files.map((file) => {
    const ex = readExample(file);
    const meta = ["run", `db=${ex.db}`, ...Object.keys(ex.flags)].join(" ");
    const [block] = collectSqlBlocks([{ lang: "sql", meta, value: ex.sql, line: 1 }], opts);
    return { ...block, example: ex, file };
  });
}
