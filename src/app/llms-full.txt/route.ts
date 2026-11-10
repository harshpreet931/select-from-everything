import fs from "node:fs";
import path from "node:path";
import { flat, pad2, type FlatChapter } from "@/content/curriculum";
import { site } from "@/lib/site";

export const dynamic = "force-static";

// llms-full.txt: the whole book as one plain markdown file, for AI assistants that read it whole.
// prose, headings, sql and the boxed asides stay; imports, data exports and interactive figures go
// (their captions live in jsx, and the page itself is the place to see them).

const labels: Record<string, (a: Record<string, string>) => string> = {
  InShort: () => "**in short**",
  Gotcha: (a) => `**gotcha${a.title ? `: ${a.title}` : ""}**`,
  Interview: (a) => `**interview question${a.q ? `: ${a.q}` : ""}**`,
  Keylines: () => "**key lines**",
  Deep: (a) => `**deeper${a.title ? `: ${a.title}` : ""}**`,
  Predict: () => "**predict the output**",
  Explain: () => "**answer**",
  Quiz: () => "**quiz**",
};
/** wrappers whose whole body is interactive: dropped with everything inside */
const skip = new Set(["Figure"]);

const balance = (s: string) => {
  let n = 0;
  for (const ch of s) n += ch === "{" || ch === "(" || ch === "[" ? 1 : ch === "}" || ch === ")" || ch === "]" ? -1 : 0;
  return n;
};
const attrs = (tag: string) =>
  Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function plain(src: string): string {
  const lines = src.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
  const out: string[] = [];
  let fence = false;
  let skipping = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*```/.test(line)) {
      fence = !fence;
      if (!skipping) out.push(fence ? line.replace(/^(\s*```\w*).*$/, "$1") : line);
      continue;
    }
    if (fence) {
      if (!skipping) out.push(line);
      continue;
    }
    // jsx comments, possibly multi-line
    if (/^\s*\{\/\*/.test(line)) {
      while (i < lines.length && !lines[i].includes("*/}")) i++;
      continue;
    }
    // import / export statements, possibly multi-line
    if (/^(import|export)\s/.test(line)) {
      let b = balance(line);
      while (b > 0 && i + 1 < lines.length) b += balance(lines[++i]);
      continue;
    }
    // a line that starts with a component tag: read the whole tag, then label it, skip it or drop it
    if (/^\s*<\/?[A-Z]/.test(line)) {
      let tag = line;
      let b = balance(line);
      while ((b > 0 || !/>\s*$/.test(tag)) && i + 1 < lines.length) {
        tag += "\n" + lines[++i];
        b += balance(lines[i]);
      }
      const m = tag.match(/^\s*<(\/?)([A-Z][\w.]*)/)!;
      const closing = m[1] === "/";
      const name = m[2];
      const selfClosing = /\/>\s*$/.test(tag);
      const oneLine = new RegExp(`</${name}>\\s*$`).test(tag) && !closing;
      if (skip.has(name)) {
        if (!closing && !selfClosing && !oneLine) skipping++;
        else if (closing) skipping = Math.max(0, skipping - 1);
        continue;
      }
      if (skipping || closing || selfClosing) continue;
      if (labels[name]) out.push("", labels[name](attrs(tag.split("\n")[0])), "");
      if (oneLine) {
        // <Tag>text</Tag> on one line: keep the text
        const inner = tag.replace(/^\s*<[^>]*>/, "").replace(/<\/[A-Z][\w.]*>\s*$/, "");
        if (inner.trim()) out.push(inner);
      }
      continue;
    }
    if (skipping) continue;
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<\/?[A-Z][\w.]*(\s[^<>]*)?\/?>/g, "")
    .replace(/\]\(\/(learn|glossary|play)/g, `](${site.url}/$1`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chapter(c: FlatChapter) {
  const file = path.join(process.cwd(), "content", c.part.slug, `${c.slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const n = c.part.chapters.findIndex((x) => x.slug === c.slug) + 1;
  return [
    `# ${pad2(c.part.n)}.${pad2(n)} ${c.title}`,
    "",
    `source: ${site.url}${c.href}`,
    `part: ${pad2(c.part.n)}, ${c.part.title}`,
    "",
    `> ${c.blurb}`,
    "",
    plain(fs.readFileSync(file, "utf8")),
  ].join("\n");
}

export function GET() {
  const head = [
    `# ${site.name}: ${site.tagline}`,
    "",
    `> a free, open-source, visual-first book on sql and databases by ${site.author.name} (${site.author.url}), written against ${site.pg.engine}. this is the text of every chapter as plain markdown; the interactive figures are only on the site. MIT licensed. the map of the book is at ${site.url}/llms.txt.`,
  ].join("\n");
  const body = flat.map(chapter).filter(Boolean);
  return new Response([head, ...body].join("\n\n\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
