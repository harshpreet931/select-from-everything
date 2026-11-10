import "server-only";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { site } from "@/lib/site";
import { flat, pad2, type FlatChapter, type Part } from "@/content/curriculum";

// search-facing words. the page itself stays lowercase and casual; titles and descriptions
// say what people actually type into a search box ("window frames in SQL", "postgres vacuum").
// google's guides this follows: title links, snippets, article + breadcrumb structured data.

const abs = (p: string) => new URL(p, site.url).toString();
const pg = site.pg.version;

/** the day the book went public (the repo's first commit). only a fallback for datePublished, see chapterDates */
const BOOK_PUBLISHED = "2026-11-10T18:02:54+05:30";

// ---- titles and descriptions --------------------------------------------------

/** "window frames" → "window frames in SQL", anything already naming sql or postgres stays as is */
export function seoTitle(title: string, partN = 1) {
  return /\bsql\b|postgres/i.test(title) ? title : `${title} in ${partN >= 9 ? "postgres" : "SQL"}`;
}

export const partTitle = (p: Part) => seoTitle(p.title, p.n);

export const homeTitle = `learn sql and databases, visually · ${site.name}`;
export const homeDescription = `a free, visual book on sql and postgres: ${flat.length} interactive chapters from your first SELECT to indexes, MVCC and the WAL, with every query running in your browser.`;

/** longest first. a description is the blurb plus the longest of these that keeps it within 160 characters */
const tails = [
  ` explained with interactive diagrams you can step through, and queries that run on a real postgres ${pg} in your browser.`,
  ` explained with interactive diagrams you can step through and queries that run on a real postgres ${pg} in your browser.`,
  ` explained with interactive diagrams and queries that run on a real postgres ${pg}, right in your browser.`,
  ` explained with interactive diagrams and queries you can run on a real postgres ${pg} in your browser.`,
  ` with interactive diagrams and queries you can run on a real postgres ${pg} in your browser.`,
  ` with interactive diagrams and queries that run on a real postgres ${pg} in the page.`,
  ` with diagrams and queries you can run on a real postgres ${pg} in your browser.`,
  ` with diagrams and runnable queries on a real postgres ${pg} in your browser.`,
  ` with diagrams and queries you can run on a real postgres ${pg}.`,
  ` with diagrams and runnable queries on postgres ${pg}.`,
  ` drawn, and run on a real postgres ${pg}.`,
  ` with runnable postgres ${pg} queries.`,
];

const sentence = (s: string) => (/[.?!]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** blurb, then the longest tail that fits: lands at roughly 140 to 160 characters, never cut mid-sentence */
export function seoDescription(blurb: string, max = 160) {
  const b = sentence(blurb);
  for (const t of tails) if (b.length + t.length <= max) return b + t;
  return b;
}

export function partDescription(p: Part) {
  const b = sentence(p.blurb);
  const options = [
    ` part ${p.n} of a free visual sql book: ${p.chapters.length} chapters with interactive diagrams and queries on postgres ${pg}.`,
    ` ${p.chapters.length} free visual chapters with interactive diagrams and queries on a real postgres ${pg}.`,
    ` ${p.chapters.length} free visual chapters with diagrams and runnable queries on postgres ${pg}.`,
    ` ${p.chapters.length} visual chapters with diagrams and runnable queries on postgres ${pg}.`,
    ` ${p.chapters.length} visual chapters with diagrams and queries on a real postgres ${pg}.`,
    ` ${p.chapters.length} visual chapters with diagrams and runnable postgres queries.`,
    ` ${p.chapters.length} visual chapters with runnable queries.`,
  ];
  return b + (options.find((o) => b.length + o.length <= 160) ?? "");
}

// ---- metadata -----------------------------------------------------------------

const ogImage = (alt: string) => ({ url: "/opengraph-image", width: 1200, height: 630, alt, type: "image/png" });

/**
 * full metadata for one page. next merges metadata shallowly, so a page that sets openGraph
 * loses the layout's siteName, type and image: build all of it here, every time.
 * chapters pass image: false, their own opengraph-image file supplies it.
 */
export function pageMeta(o: {
  path: string;
  title: string;
  /** use the title as is, without the "· select * from everything" suffix (the home page) */
  absolute?: boolean;
  description: string;
  type?: "website" | "article";
  image?: boolean;
  imageAlt?: string;
  article?: { section: string; modified?: string; published?: string };
  robots?: Metadata["robots"];
}): Metadata {
  const full = o.absolute ? o.title : `${o.title} · ${site.name}`;
  const images = o.image === false ? undefined : [ogImage(o.imageAlt ?? `${site.name}: ${site.tagline}`)];
  return {
    title: o.absolute ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    ...(o.robots ? { robots: o.robots } : {}),
    openGraph: {
      type: o.type ?? "website",
      url: o.path,
      siteName: site.name,
      locale: "en_US",
      title: full,
      description: o.description,
      ...(images ? { images } : {}),
      ...(o.type === "article" && o.article
        ? {
            section: o.article.section,
            authors: [site.author.url],
            ...(o.article.published ? { publishedTime: o.article.published } : {}),
            ...(o.article.modified ? { modifiedTime: o.article.modified } : {}),
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description: o.description,
      ...(images ? { images } : {}),
    },
  };
}

// ---- dates, from git ----------------------------------------------------------

type Dates = { modified?: string; published?: string };
let bulk: Map<string, Dates> | null = null;
let cut: Set<string> | null = null;
const single = new Map<string, string | undefined>();

const git = (args: string[]) =>
  execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] });

/** commits a shallow clone was cut at: they look like they added every file, so their dates mean nothing */
function shallowCommits(): Set<string> {
  if (cut) return cut;
  try {
    const f = path.resolve(process.cwd(), git(["rev-parse", "--git-path", "shallow"]).trim());
    cut = new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean) : []);
  } catch {
    cut = new Set();
  }
  return cut;
}

/**
 * newest and oldest commit date of every file under content/, in one git call. files git
 * doesn't know (not committed yet) get no date at all: a missing date beats a made-up one.
 */
function gitDates(): Map<string, Dates> {
  if (bulk) return bulk;
  bulk = new Map();
  try {
    const boundaries = shallowCommits();
    const out = git(["log", "--format=%x1e%H %cI", "--name-only", "--no-renames", "--", "content"]);
    for (const block of out.split("\x1e").slice(1)) {
      const [head, ...files] = block.split("\n").filter(Boolean);
      const [hash, date] = head.split(" ");
      const boundary = boundaries.has(hash);
      for (const f of files) {
        const seen = bulk.has(f);
        const d = bulk.get(f) ?? {};
        // log runs newest first: the first sighting is the last change, the last sighting the first
        if (!seen) d.modified = boundary ? undefined : date;
        d.published = boundary ? undefined : date;
        bulk.set(f, d);
      }
    }
  } catch {
    // no git (a tarball build): no dates
  }
  return bulk;
}

/** newest commit date touching any of these paths */
export function gitModified(...paths: string[]): string | undefined {
  const key = paths.join("\0");
  if (single.has(key)) return single.get(key);
  let d: string | undefined;
  try {
    const [hash, date] = git(["log", "-1", "--format=%H %cI", "--", ...paths]).trim().split(" ");
    d = hash && date && !shallowCommits().has(hash) ? date : undefined;
  } catch {
    d = undefined;
  }
  single.set(key, d);
  return d;
}

const rel = (c: FlatChapter) => `content/${c.part.slug}/${c.slug}.mdx`;

export function chapterDates(c: FlatChapter): Dates {
  const known = gitDates().get(rel(c));
  if (!known) return {};
  // a chapter whose first commit a shallow clone cut off was published with the book or later:
  // the launch date is the honest lower bound
  return { modified: known.modified, published: known.published ?? BOOK_PUBLISHED };
}

export const lastModified = (c: FlatChapter) => chapterDates(c).modified;

/** the newest of a set of iso dates */
export function newest(dates: (string | undefined)[]) {
  const ok = dates.filter((d): d is string => !!d);
  return ok.length ? ok.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : undefined;
}

export const partModified = (p: Part) => newest(flat.filter((c) => c.part.slug === p.slug).map(lastModified));

// ---- json-ld ------------------------------------------------------------------
// google reads each page's markup on its own, so every graph carries the full author node.

const personId = `${site.author.url}/#person`;
const websiteId = `${site.url}/#website`;
const bookId = abs("/learn#book");

export const person = {
  "@type": "Person",
  "@id": personId,
  name: site.author.name,
  alternateName: site.author.short,
  url: site.author.url,
  sameAs: [site.author.github],
};
const personRef = { "@id": personId };
const bookRef = { "@type": "Book", "@id": bookId, name: site.name, url: abs("/learn") };

const about = [
  { "@type": "Thing", name: "SQL", sameAs: "https://en.wikipedia.org/wiki/SQL" },
  { "@type": "SoftwareApplication", name: "PostgreSQL", url: "https://www.postgresql.org/", applicationCategory: "Database" },
];

type Crumb = [name: string, path?: string];
function breadcrumbs(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, p], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      // google: the last crumb may leave out `item`, it's the page you're on
      ...(p && i < crumbs.length - 1 ? { item: abs(p) } : {}),
    })),
  };
}

const level = (p: Part) => (p.n <= 4 ? "beginner" : p.n <= 11 ? "intermediate" : "advanced");

/** the home page: the site (google reads the site name from here, and only from the home page) and its author */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: site.name,
        alternateName: [new URL(site.url).host],
        url: abs("/"),
        description: site.description,
        inLanguage: "en",
        author: personRef,
        publisher: personRef,
      },
      person,
    ],
  };
}

/** one chapter: a technical article inside the book, plus breadcrumbs */
export function chapterJsonLd(c: FlatChapter, opts: { words?: number; minutes?: number } = {}) {
  const { modified, published } = chapterDates(c);
  const url = abs(c.href);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["TechArticle", "LearningResource"],
        "@id": `${url}#article`,
        mainEntityOfPage: url,
        url,
        headline: seoTitle(c.title, c.part.n),
        name: c.title,
        description: seoDescription(c.blurb),
        image: [abs(`${c.href}/opengraph-image`)],
        inLanguage: "en",
        author: personRef,
        publisher: personRef,
        ...(published ? { datePublished: published } : {}),
        ...(modified ? { dateModified: modified } : {}),
        isAccessibleForFree: true,
        license: "https://opensource.org/licenses/MIT",
        isPartOf: bookRef,
        articleSection: c.part.title,
        position: c.index + 1,
        about,
        educationalLevel: level(c.part),
        proficiencyLevel: level(c.part),
        learningResourceType: "interactive chapter",
        ...(opts.words ? { wordCount: opts.words } : {}),
        ...(opts.minutes ? { timeRequired: `PT${opts.minutes}M` } : {}),
      },
      person,
      breadcrumbs([[site.name, "/"], ["contents", "/learn"], [c.part.title, `/learn/${c.part.slug}`], [c.title]]),
    ],
  };
}

/** one part: a collection of chapters inside the book, plus breadcrumbs */
export function partJsonLd(p: Part) {
  const url = abs(`/learn/${p.slug}`);
  const modified = partModified(p);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#part`,
        url,
        name: `part ${pad2(p.n)}: ${p.title}`,
        description: partDescription(p),
        inLanguage: "en",
        author: personRef,
        isPartOf: bookRef,
        ...(modified ? { dateModified: modified } : {}),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: p.chapters.length,
          itemListElement: p.chapters.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.title,
            url: abs(`/learn/${p.slug}/${c.slug}`),
          })),
        },
      },
      person,
      breadcrumbs([[site.name, "/"], ["contents", "/learn"], [p.title]]),
    ],
  };
}

/**
 * the contents page: the whole thing as a free online book (it calls itself one, and it is one).
 * not a Course: google's course markup is a carousel of at least three courses, and this is
 * one book you read at your own pace.
 */
export function bookJsonLd(parts: Part[]) {
  const modified = newest(parts.map(partModified));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Book",
        "@id": bookId,
        name: site.name,
        alternateName: `${site.name}: ${site.tagline}`,
        url: abs("/learn"),
        description: site.description,
        bookFormat: "https://schema.org/EBook",
        inLanguage: "en",
        author: personRef,
        publisher: personRef,
        datePublished: BOOK_PUBLISHED,
        ...(modified ? { dateModified: modified } : {}),
        isAccessibleForFree: true,
        license: "https://opensource.org/licenses/MIT",
        image: abs("/opengraph-image"),
        about,
        hasPart: parts.map((p) => ({
          "@type": "CollectionPage",
          "@id": `${abs(`/learn/${p.slug}`)}#part`,
          name: `part ${pad2(p.n)}: ${p.title}`,
          url: abs(`/learn/${p.slug}`),
          position: p.n,
        })),
      },
      person,
      breadcrumbs([[site.name, "/"], ["contents"]]),
    ],
  };
}

/** the glossary: a set of defined terms, each pointing at the chapter that explains it */
export function glossaryJsonLd(terms: { id: string; term: string; short: string; href: string; aka?: string[] }[]) {
  const url = abs("/glossary");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTermSet",
        "@id": `${url}#terms`,
        name: `sql and database glossary · ${site.name}`,
        url,
        inLanguage: "en",
        author: personRef,
        isPartOf: bookRef,
        hasDefinedTerm: terms.map((t) => ({
          "@type": "DefinedTerm",
          "@id": `${url}#${t.id}`,
          name: t.term,
          ...(t.aka?.length ? { alternateName: t.aka } : {}),
          description: t.short,
          url: `${url}#${t.id}`,
          inDefinedTermSet: { "@id": `${url}#terms` },
          subjectOf: { "@type": "TechArticle", "@id": `${abs(t.href)}#article`, url: abs(t.href) },
        })),
      },
      person,
      breadcrumbs([[site.name, "/"], ["glossary"]]),
    ],
  };
}

export { abs };
