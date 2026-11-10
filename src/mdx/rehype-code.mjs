// code blocks: shiki (via rehype-pretty-code) with our two monochrome themes,
// shiki notation comments, and a few extras for <CodeBlock>:
//   data-raw     the original source (for copy + run)
//   data-title   from title="orders.sql"
//   data-run     the block gets a "run" button
//   data-sql     for sql blocks with run / hidden / native: the block's runner data as json
//                (id, db, session prelude, flags), from src/lib/sql/shared/meta.mjs
//   data-output  expected output shown under the block, from output="..."  (\n allowed)
//   data-nolines hide line numbers
//
// authoring:  ```sql run db=shop title="orders.sql" {3-4} /count/
//   -- [!code highlight]  -- [!code ++]  -- [!code --]  -- [!code focus]  -- [!code error]
// the sql flags are documented in src/lib/sql/shared/meta.mjs. hidden blocks are removed here.
import rehypePrettyCode from "rehype-pretty-code";
import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { visit, SKIP } from "unist-util-visit";
import { darkTheme, lightTheme } from "./themes.mjs";
import { blockData, collectSqlBlocks } from "../lib/sql/shared/meta.mjs";

const meta = {
  name: "sfe-meta",
  pre(node) {
    const raw = this.options.meta?.__raw ?? "";
    node.properties["data-raw"] = this.source.replace(/\n$/, "");
    if (/(^|\s)run(\s|$)/.test(raw)) node.properties["data-run"] = "";
    if (/(^|\s)nolines(\s|$)/.test(raw)) node.properties["data-nolines"] = "";
    const sql = /(?:^|\s)sqldata=b64:([A-Za-z0-9_-]+)/.exec(raw)?.[1];
    if (sql) node.properties["data-sql"] = Buffer.from(sql, "base64url").toString("utf8");
    // output was base64-encoded by hideOutputs() so rehype-pretty-code never reads its quotes as word highlights
    const enc = /output=b64:([A-Za-z0-9_-]+)/.exec(raw)?.[1];
    if (enc) {
      const output = Buffer.from(enc, "base64url").toString("utf8");
      node.properties["data-output"] = output.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  },
};

const v3 = { matchAlgorithm: "v3" };

const prettyOptions = {
  theme: { dark: darkTheme, light: lightTheme },
  keepBackground: false,
  defaultLang: { block: "sql" },
  transformers: [
    transformerNotationHighlight(v3),
    transformerNotationDiff(v3),
    transformerNotationFocus(v3),
    transformerNotationWordHighlight(v3),
    transformerNotationErrorLevel(v3),
    meta,
  ],
};

// rehype-pretty-code wraps titled blocks in <figure><figcaption/><pre/></figure>.
// fold that back into one <pre data-title> so <CodeBlock> owns the whole thing.
function unwrapFigures() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "figure" || !("data-rehype-pretty-code-figure" in node.properties)) return;
      let title;
      let pre;
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (child.tagName === "figcaption") {
          title = child.children.map((c) => (c.type === "text" ? c.value : "")).join("");
        }
        if (child.tagName === "pre") pre = child;
      }
      if (!pre || !parent || index === undefined) return;
      if (title) pre.properties["data-title"] = title;
      parent.children[index] = pre;
      return [SKIP, index];
    });
  };
}

// rehype-pretty-code treats any "quoted text" in the meta as a word to highlight. output="..."
// is full of quotes (exception messages, strings), so encode it before pretty-code looks.
function hideOutputs(tree) {
  visit(tree, "element", (node) => {
    if (node.tagName !== "code" || typeof node.data?.meta !== "string") return;
    // markdown has already unescaped \" to ", so the value can contain bare quotes. it ends at the
    // first quote that's followed by the end of the meta or by another flag.
    node.data.meta = node.data.meta.replace(
      /output="(.*?)"(?=\s*$|\s+(?:(?:title|db|session|setup|ext|rows|expect|errors|sqldata)=|(?:run|nolines|unordered|hidden|volatile|native|nocheck)(?:\s|$)|\{|\/))/,
      (_, v) => `output=b64:${Buffer.from(v, "utf8").toString("base64url")}`,
    );
  });
}

const codeText = (node) => (node.type === "text" ? node.value : (node.children ?? []).map(codeText).join(""));
const codeLang = (node) => {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : String(cls ?? "").split(" ");
  return list.find((c) => String(c).startsWith("language-"))?.slice(9) ?? null;
};

// sql blocks, before pretty-code: give every run / native block its runner data (a base64 meta
// flag that pre() turns into data-sql) and drop hidden ones. check.mjs and sql-check walk the
// mdast with the same collectSqlBlocks, in the same order, so ids match the goldens.
function sqlBlocks(tree) {
  const found = [];
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName !== "pre" || !parent || index === undefined) return;
    const code = node.children.find((c) => c.type === "element" && c.tagName === "code");
    if (!code) return;
    found.push({
      pre: node,
      code,
      parent,
      item: {
        lang: codeLang(code),
        meta: typeof code.data?.meta === "string" ? code.data.meta : "",
        value: codeText(code),
        line: node.position?.start.line ?? code.position?.start.line ?? 0,
      },
    });
  });
  if (!found.some((f) => f.item.lang === "sql")) return;
  const blocks = collectSqlBlocks(found.map((f) => f.item));
  for (const b of blocks) {
    const f = found[b.index];
    if (b.hidden) {
      const at = f.parent.children.indexOf(f.pre);
      if (at >= 0) f.parent.children.splice(at, 1);
      continue;
    }
    if (!b.run && !b.native) continue;
    const data = Buffer.from(JSON.stringify(blockData(b)), "utf8").toString("base64url");
    f.code.data = { ...(f.code.data ?? {}), meta: `${f.item.meta} sqldata=b64:${data}`.trim() };
  }
}

export default function rehypeCode() {
  const pretty = rehypePrettyCode(prettyOptions);
  const unwrap = unwrapFigures();
  return async (tree, file) => {
    sqlBlocks(tree);
    hideOutputs(tree);
    await pretty(tree, file);
    unwrap(tree);
  };
}
