import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { flat, getChapter, pad2 } from "@/content/curriculum";
import { availableHrefs, isAvailable } from "@/lib/content";
import { chapterDates, chapterJsonLd, pageMeta, seoDescription, seoTitle } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { Toc } from "@/components/learn/Toc";
import { ChapterFooter } from "@/components/learn/ChapterFooter";
import { Since } from "@/components/mdx/blocks";
import { Glyph } from "@/components/home/Glyph";
import { GoldenProvider } from "@/lib/sql/golden";
import type { GoldenFile } from "@/lib/sql/types";
import { site } from "@/lib/site";

type Params = { part: string; chapter: string };

export const dynamicParams = false;

// the runner's test pages (content/_test/*.mdx) are served only by `next dev`, at /learn/_test/<name>.
// they're not in the curriculum, so a production build never generates them.
const FIXTURES = "_test";
const dev = process.env.NODE_ENV === "development";
function fixtures(): string[] {
  if (!dev) return [];
  try {
    return fs
      .readdirSync(path.join(process.cwd(), "content", FIXTURES))
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}
const isFixture = (part: string, chapter: string) => dev && part === FIXTURES && fixtures().includes(chapter);

// every chapter in the curriculum gets a page. ones without an mdx file yet render as "soon".
export function generateStaticParams(): Params[] {
  return [
    ...flat.map((c) => ({ part: c.part.slug, chapter: c.slug })),
    ...fixtures().map((chapter) => ({ part: FIXTURES, chapter })),
  ];
}

async function load(part: string, chapter: string) {
  // no file yet: the chapter renders as "soon". a file that exists but fails to compile or to
  // evaluate (an export reading a step the capture doesn't have) throws, so dev shows the error
  // overlay and the build fails, instead of the page quietly saying "still being drawn"
  if (!fs.existsSync(path.join(process.cwd(), "content", part, `${chapter}.mdx`))) return null;
  // relative on purpose: webpack (dev:poll) can't resolve a tsconfig alias inside a dynamic import context
  return await import(`../../../../../content/${part}/${chapter}.mdx`);
}

/** the recorded output of the chapter's sql blocks (pnpm sql-check --update writes it) */
async function loadGolden(part: string, chapter: string): Promise<GoldenFile["blocks"] | null> {
  try {
    const mod = await import(`../../../../../content/${part}/${chapter}.golden.json`);
    return ((mod.default ?? mod) as GoldenFile).blocks ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { part, chapter } = await params;
  if (isFixture(part, chapter)) return { title: `${chapter} (runner test page)`, robots: { index: false, follow: false } };
  const c = getChapter(part, chapter);
  if (!c) return {};
  const written = isAvailable(part, chapter);
  const { modified, published } = chapterDates(c);
  return pageMeta({
    path: c.href,
    title: seoTitle(c.title, c.part.n),
    description: seoDescription(c.blurb),
    type: "article",
    // the image comes from this segment's opengraph-image file
    image: false,
    article: { section: c.part.title, modified, published },
    // unwritten chapters are a placeholder: keep them out of the index until they exist
    robots: written ? undefined : { index: false, follow: true },
  });
}

export default async function ChapterPage({ params }: { params: Promise<Params> }) {
  const { part, chapter } = await params;
  if (isFixture(part, chapter)) return <Fixture part={part} chapter={chapter} />;
  const c = getChapter(part, chapter);
  if (!c) notFound();

  const mod = await load(part, chapter);
  const Body = mod?.default ?? null;
  const golden = Body ? await loadGolden(part, chapter) : null;
  const toc = (mod?.toc ?? []) as { depth: 2 | 3; id: string; text: string }[];
  const stats = (mod?.stats ?? { words: 0, figures: 0 }) as { words: number; figures: number };
  const minutes = Math.max(3, Math.round(stats.words / 190 + stats.figures * 0.6));

  const ready = new Set(availableHrefs());
  const list = flat.filter((x) => ready.has(x.href));
  const at = list.findIndex((x) => x.href === c.href);
  const num = (x: (typeof flat)[number]) => `${pad2(x.part.n)}.${pad2(x.part.chapters.findIndex((y) => y.slug === x.slug) + 1)}`;
  const nb = (x?: (typeof flat)[number]) => (x ? { href: x.href, title: x.title, num: num(x) } : null);

  const [, partSeg, chapterSeg] = c.address.split(".");

  return (
    <div className="flex gap-14 px-[var(--gutter)] pt-10 pb-28 lg:pt-14 xl:pl-16">
      {Body && <JsonLd data={chapterJsonLd(c, { words: stats.words, minutes })} />}
      <main id="main" className="mx-auto min-w-0 max-w-[880px] flex-1">
      <article data-pagefind-body={Body ? "" : undefined}>
        <header className="mx-auto mb-16 max-w-[40rem] text-center">
          <Glyph name={c.part.glyph} className="lineart-glyph mx-auto mb-8 size-[76px] text-ref" />
          <div className="font-mono text-12 text-faint [overflow-wrap:anywhere]" data-pagefind-ignore>
            <Link href="/learn" className="hover:text-hi">
              everything
            </Link>
            <span className="text-accent-2">.</span>
            <Link href={`/learn/${c.part.slug}`} className="hover:text-hi">
              {partSeg}
            </Link>
            <span className="text-accent-2">.</span>
            <span className="text-mute">{chapterSeg}</span>
          </div>
          <h1
            className="mt-5 font-display text-[clamp(2.3rem,1.6rem+2.4vw,3.2rem)] leading-[1.08] font-light tracking-[0.005em] text-hi"
            data-pagefind-meta="title"
          >
            {c.title}
          </h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-18 leading-[1.6] text-mute italic">{c.blurb}</p>
          <dl
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-14 text-faint"
            data-pagefind-ignore
          >
            <div className="flex gap-1.5">
              <dt className="sr-only">part</dt>
              <dd>
                <Link href={`/learn/${c.part.slug}`} className="hover:text-hi">
                  part {pad2(c.part.n)}, {c.part.title}
                </Link>
              </dd>
            </div>
            <span aria-hidden className="text-accent-2">·</span>
            <div className="flex gap-1.5">
              <dt className="sr-only">chapter</dt>
              <dd className="tabular">chapter {num(c)}</dd>
            </div>
            {Body && (
              <>
                <span aria-hidden className="text-accent-2">·</span>
                <div className="flex gap-1.5">
                  <dt className="sr-only">reading time</dt>
                  <dd className="tabular">{minutes} min read</dd>
                </div>
              </>
            )}
            {(c.since || c.preview) && (
              <dd>
                <Since v={c.preview ? site.pg.major + 1 : c.since} preview={c.preview} />
              </dd>
            )}
          </dl>
          <span className="ornament mt-10" aria-hidden />
        </header>

        {Body ? (
          <div className="prose">
            <GoldenProvider value={golden}>
              <Body />
            </GoldenProvider>
          </div>
        ) : (
          <div className="ticks max-w-[68ch] px-7 py-8 text-14 leading-[1.7] text-mute" data-pagefind-ignore>
            <p className="text-hi">this chapter is still being drawn.</p>
            <p className="mt-3">
              it&apos;s on the map, it just isn&apos;t written yet. if you want to help, every chapter is one mdx file in{" "}
              <code className="text-ink">content/{c.part.slug}/{c.slug}.mdx</code>. see CONTRIBUTING.md.
            </p>
          </div>
        )}

        <div data-pagefind-ignore>
          <ChapterFooter href={c.href} prev={nb(list[at - 1])} next={nb(list[at + 1])} />
        </div>
      </article>
      </main>

      <aside className="hidden w-[210px] shrink-0 xl:block" data-pagefind-ignore>
        <div className="sticky top-[calc(var(--bar-h)+48px)] max-h-[calc(100dvh-var(--bar-h)-80px)] overflow-y-auto">
          <Toc toc={toc} />
        </div>
      </aside>
    </div>
  );
}

/** a runner test page from content/_test (dev only): the mdx with its goldens, no curriculum chrome */
async function Fixture({ part, chapter }: Params) {
  const mod = await load(part, chapter);
  const Body = mod?.default ?? null;
  if (!Body) notFound();
  const golden = await loadGolden(part, chapter);
  return (
    <div className="px-[var(--gutter)] pt-10 pb-28 lg:pt-14 xl:pl-16">
      <main id="main" className="mx-auto min-w-0 max-w-[880px]">
      <article>
        <header className="mx-auto mb-16 max-w-[40rem] text-center">
          <div className="font-mono text-12 text-faint">
            everything<span className="text-accent-2">.</span>
            {part}
            <span className="text-accent-2">.</span>
            <span className="text-mute">{chapter}</span>
          </div>
          <h1 className="mt-5 font-display text-[clamp(2.3rem,1.6rem+2.4vw,3.2rem)] leading-[1.08] font-light text-hi">runner test page</h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-18 leading-[1.6] text-mute italic">
            content/{part}/{chapter}.mdx. only next dev serves this page; the build never sees it.
          </p>
          <span className="ornament mt-10" aria-hidden />
        </header>
        <div className="prose">
          <GoldenProvider value={golden}>
            <Body />
          </GoldenProvider>
        </div>
      </article>
      </main>
    </div>
  );
}
