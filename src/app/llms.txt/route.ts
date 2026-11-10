import { flat, parts, pad2 } from "@/content/curriculum";
import { availableHrefs } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-static";

// llms.txt (llmstxt.org): a plain map of the book for AI assistants and AI search.
export function GET() {
  const ready = new Set(availableHrefs());
  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.tagline} a free, open-source, visual-first book on sql and databases by ${site.author.name} (${site.author.url}). ${flat.length} chapters in ${parts.length} parts, from the first SELECT through joins, window functions, schema design and indexes, down to query plans, pages, b-trees, MVCC, locking and the write-ahead log. written against ${site.pg.engine}; every runnable query is checked on that same engine, which also runs in the reader's browser.`,
    "",
    "the text is MIT licensed. quote it, link to the chapter, and say it's from select * from everything.",
    "",
    `- [contents](${site.url}/learn): every part and chapter in reading order`,
    `- [full text](${site.url}/llms-full.txt): every chapter's prose and sql as plain markdown, in one file`,
    `- [glossary](${site.url}/glossary): sql and database terms in one line each`,
    `- [playground](${site.url}/play): run sql on a real postgres in the browser`,
    `- [source](${site.repo})`,
    "",
  ];
  for (const p of parts) {
    const written = p.chapters.filter((c) => ready.has(`/learn/${p.slug}/${c.slug}`));
    if (!written.length) continue;
    lines.push(`## part ${pad2(p.n)}: ${p.title}`, "", p.blurb, "");
    for (const c of written) lines.push(`- [${c.title}](${site.url}/learn/${p.slug}/${c.slug}): ${c.blurb}`);
    lines.push("");
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
