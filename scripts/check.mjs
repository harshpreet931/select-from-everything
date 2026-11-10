#!/usr/bin/env node
// pnpm check [part...]      validates chapters without a full build:
//   1. every chapter in the curriculum for those parts has an mdx file (warn if missing)
//   2. each mdx compiles with the real remark/rehype pipeline
//   3. every <Component> used is either global (mdx-components, viz, db) or imported
//   4. relative/alias imports resolve to files that exist (json imports over 60 KB warn)
//   5. voice lint: no em dashes, no banned words (AUTHORING.md)
//   6. sql blocks: fence flags are valid, every run / native block has a golden
//      (content/<part>/<chapter>.golden.json, from pnpm sql-check --update), no orphan goldens,
//      goldens parse and stay under 100 KB. sql-check runs them; this only checks they're there.
//   7. slugs: every part and chapter slug, with - as _, is an unquoted sql identifier that
//      isn't a reserved word (the address everything.<part>.<chapter> is a real three-part name)
//
// with no arguments it also checks the runner's test pages in content/_test (not in the curriculum).
// exit code 1 if anything is an error.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, createProcessor } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import remarkToc from "../src/mdx/remark-toc.mjs";
import rehypeCode from "../src/mdx/rehype-code.mjs";
import { sqlBlocksOf } from "./lib/mdx-sql.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(root, "content");

// the curriculum is typescript; pull slugs out with a regex instead of compiling it
const curriculumSrc = fs.readFileSync(path.join(root, "src/content/curriculum.ts"), "utf8");
const partsInOrder = [...curriculumSrc.matchAll(/slug: "([^"]+)",\n\s+n: \d+/g)].map((m) => m[1]);

// globals from mdx-components.tsx + viz/index.ts + db/index.ts (`export const <name> = { A, B }`)
const mdxComponentsSrc = fs.readFileSync(path.join(root, "src/mdx-components.tsx"), "utf8");
const spread = (file, name) => {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return [];
  const body = fs.readFileSync(p, "utf8").match(new RegExp(`export const ${name} = \\{([^}]+)\\}`))?.[1] ?? "";
  // "A, B: Other" and "...rest" both name a global by their key
  return [...body.matchAll(/(?:^|[,{\s])([A-Z][A-Za-z0-9]*)\s*(?=[,:}]|$)/gm)].map((m) => m[1]);
};
const globals = new Set([
  ...[...mdxComponentsSrc.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*),?$/gm)].map((m) => m[1]),
  ...spread("src/components/viz/index.ts", "viz"),
  ...spread("src/components/db/index.ts", "db"),
]);

// sql blocks: the datasets and their setups, so db= and setup= can be checked
const datasetNames = fs
  .readdirSync(path.join(root, "datasets"))
  .filter((d) => fs.existsSync(path.join(root, "datasets", d, "dataset.json")));
const setups = Object.fromEntries(
  datasetNames.map((d) => [d, JSON.parse(fs.readFileSync(path.join(root, "datasets", d, "dataset.json"), "utf8")).setups ?? []]),
);

// reserved key words (catcode R and T in pg_get_keywords(), postgres 18): a slug can't be one
const RESERVED = new Set(
  ("all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column " +
    "concurrently constraint create cross current_catalog current_date current_role current_schema current_time current_timestamp " +
    "current_user default deferrable desc distinct do else end except false fetch for foreign freeze from full grant group having " +
    "ilike in initially inner intersect into is isnull join lateral leading left like limit localtime localtimestamp natural not " +
    "notnull null offset on only or order outer overlaps placing primary references returning right select session_user similar " +
    "some symmetric system_user table tablesample then to trailing true union unique user using variadic verbose when where window with"
  ).split(" "),
);
const FIXTURES = "_test";

const banned = [
  "comprehensive",
  "ultimate",
  "masterclass",
  "zero to hero",
  "seamless",
  "seamlessly",
  "robust",
  "leverage",
  "delve",
  "testament",
  "paradigm",
  "in today's world",
  "let's dive",
  "dive in",
  "buckle up",
  "it's important to note",
  "in conclusion",
];

const args = process.argv.slice(2);
const parts = args.length ? args : partsInOrder;
let errors = 0;
let warnings = 0;
const err = (f, m) => {
  errors++;
  console.log(`  ✗ ${f}: ${m}`);
};
const warn = (f, m) => {
  warnings++;
  console.log(`  ! ${f}: ${m}`);
};

const chapterSlugs = (part) => {
  const block = curriculumSrc.split(/\n  \{\n    slug: /).find((b) => b.startsWith(`"${part}"`));
  if (!block) return [];
  return [...block.matchAll(/\{ slug: "([^"]+)", title:/g)].map((m) => m[1]);
};

// walk the mdx syntax tree instead of regexing the source: code, inline code and esm blocks
// (export const traces full of java) are skipped exactly, however they're written.
const mdxParser = createProcessor();
function analyze(src) {
  const tree = mdxParser.parse(src);
  const components = new Set();
  const prose = [];
  const headings = [];
  let h1 = false;
  const text = (n) => (n.type === "text" ? n.value : (n.children ?? []).map(text).join(""));
  const walk = (n) => {
    if (n.type === "code" || n.type === "inlineCode" || n.type === "mdxjsEsm") return;
    if (n.type === "heading") {
      if (n.depth === 1) h1 = true;
      if (n.depth === 2 || n.depth === 3) headings.push(text(n));
    }
    if ((n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") && n.name && /^[A-Z]/.test(n.name) && !n.name.includes(".")) {
      components.add(n.name);
      // attribute text (captions, questions, options) is prose too
      for (const a of n.attributes ?? []) {
        if (typeof a.value === "string") prose.push(a.value);
        else if (a.value?.value) prose.push(a.value.value);
      }
    }
    if (n.type === "text") prose.push(n.value);
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return { components, prose: prose.join("\n"), headings, h1 };
}

// 7. slugs, for every part asked about
const slugProblem = (slug) => {
  const id = slug.replace(/-/g, "_");
  if (!/^[a-z][a-z0-9_]*$/.test(id)) return `"${slug}" isn't an unquoted sql identifier (lowercase letters, digits, - or _, starting with a letter)`;
  if (RESERVED.has(id)) return `"${slug}" is a reserved word in sql, so everything.…${id} would need quotes. pick another slug`;
  return null;
};

const fixtureFiles = () => {
  const dir = path.join(contentDir, FIXTURES);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).map((f) => f.slice(0, -4)) : [];
};
const runFixtures = args.length === 0 || args.includes(FIXTURES);

const jobs = [
  ...parts.filter((p) => p !== FIXTURES),
  ...(runFixtures ? [FIXTURES] : []),
];

for (const part of jobs) {
  const dir = path.join(contentDir, part);
  const fixture = part === FIXTURES;
  const slugs = fixture ? fixtureFiles() : chapterSlugs(part);
  if (!slugs.length) {
    if (!fixture) err(part, "not a part in src/content/curriculum.ts");
    continue;
  }
  console.log(`\n${part}${fixture ? " (runner test pages, never shipped)" : ""}`);
  if (!fixture) {
    const p = slugProblem(part);
    if (p) err(`part ${part}`, p);
    for (const slug of slugs) {
      const q = slugProblem(slug);
      if (q) err(`${part}/${slug}`, q);
    }
  }
  for (const slug of slugs) {
    const file = path.join(dir, `${slug}.mdx`);
    const rel = path.relative(root, file);
    if (!fs.existsSync(file)) {
      warn(rel, "missing (shows as 'soon')");
      continue;
    }
    const src = fs.readFileSync(file, "utf8");

    // 2. compile
    try {
      await compile(
        { path: file, value: src },
        {
          remarkPlugins: [remarkGfm, remarkFrontmatter, [remarkMdxFrontmatter, { name: "frontmatter" }], remarkToc],
          rehypePlugins: [rehypeCode],
        },
      );
    } catch (e) {
      err(rel, `compile failed: ${String(e.message ?? e).split("\n")[0]}${e.line ? ` (line ${e.line})` : ""}`);
      continue;
    }

    // 3 + 4. components and imports
    const imported = new Set();
    for (const m of src.matchAll(/^import\s+(?:\{([^}]+)\}|([A-Za-z0-9_]+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+["']([^"']+)["'];?$/gm)) {
      const names = [m[1], m[3]]
        .filter(Boolean)
        .flatMap((s) => s.split(","))
        .map((s) => s.trim().split(/\s+as\s+/).pop())
        .filter(Boolean);
      if (m[2]) names.push(m[2]);
      names.forEach((n) => imported.add(n));
      const spec = m[4];
      let target;
      if (spec.startsWith("@/")) target = path.join(root, "src", spec.slice(2));
      else if (spec.startsWith("@content/")) target = path.join(root, "content", spec.slice(9));
      else if (spec.startsWith(".")) target = path.resolve(dir, spec);
      if (target) {
        const hit = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx"].map((ext) => target + ext).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
        if (!hit) err(rel, `import not found: ${spec}`);
        else if (hit.endsWith(".json") && fs.statSync(hit).size > 60_000) {
          warn(rel, `${spec} is ${Math.round(fs.statSync(hit).size / 1000)} KB; json imported into a page ships in its html. trim it or keep it under 60 KB`);
        }
      }
    }
    const facts = analyze(src);
    for (const name of facts.components) {
      if (!globals.has(name) && !imported.has(name)) err(rel, `<${name}> is not global and not imported`);
    }

    // 5. voice
    const prose = facts.prose;
    if (prose.includes("—")) {
      const line = src.split("\n").findIndex((l) => l.includes("—") && !l.trim().startsWith("//"));
      err(rel, `em dash found (line ${line + 1}). use a comma, colon, period or parentheses.`);
    }
    const lower = prose.toLowerCase();
    for (const b of banned) if (new RegExp(`\\b${b}\\b`).test(lower)) warn(rel, `banned phrase: "${b}"`);
    if (!fixture && !facts.components.has("InShort")) warn(rel, "no <InShort> at the top");
    if (!fixture && !facts.components.has("Keylines")) warn(rel, "no <Keylines> at the end");
    // title case = two or more words starting with a capital (class names like "Semaphore: ..." are fine)
    for (const h of facts.headings) {
      const caps = h.split(/\s+/).filter((w) => /^[A-Z][a-z]/.test(w) && !/[A-Z]/.test(w.slice(1)));
      if (caps.length >= 2) warn(rel, `heading should be lowercase: "${h}"`);
    }
    if (facts.h1) err(rel, "don't use a level-1 heading; the page renders the title");

    // 6. sql blocks and their goldens
    checkSql(rel, file, src, fixture);
  }
}

function checkSql(rel, file, src, fixture) {
  let blocks;
  try {
    blocks = sqlBlocksOf(src, { datasets: datasetNames, setups });
  } catch (e) {
    err(rel, `couldn't read the sql blocks: ${e.message}`);
    return;
  }
  const at = (b) => `${rel}:${b.line}`;
  for (const b of blocks) for (const issue of b.issues) err(at(b), issue);
  const goldenFile = file.replace(/\.mdx$/, ".golden.json");
  const goldenRel = path.relative(root, goldenFile);
  let golden = null;
  if (fs.existsSync(goldenFile)) {
    const size = fs.statSync(goldenFile).size;
    if (size > 100_000) warn(goldenRel, `${Math.round(size / 1000)} KB; goldens ship in the page. fewer or smaller result sets (LIMIT, rows=)`);
    try {
      golden = JSON.parse(fs.readFileSync(goldenFile, "utf8"));
      if (golden?.v !== 1 || typeof golden.blocks !== "object") throw new Error("not a v1 golden file");
    } catch (e) {
      err(goldenRel, `can't be read (${e.message}). delete it and run pnpm sql-check --update ${rel}`);
      golden = null;
    }
  }
  const needs = blocks.filter((b) => (b.run || b.native) && !b.nocheck && !b.issues.length);
  for (const b of needs) {
    if (!golden?.blocks?.[b.id]) {
      err(at(b), b.native ? `missing golden: pnpm sql-check --engine=native --update ${rel}` : `missing golden: pnpm sql-check --update ${rel}`);
    }
  }
  if (!fixture) for (const b of blocks.filter((x) => x.nocheck)) warn(at(b), "nocheck: sql-check never runs this block, so nothing checks what it prints");
  if (golden) {
    const ids = new Set(needs.map((b) => b.id));
    const orphans = Object.keys(golden.blocks).filter((id) => !ids.has(id));
    if (orphans.length) warn(goldenRel, `${orphans.length} golden(s) for blocks that no longer exist: pnpm sql-check --update ${rel}`);
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
