import type { Metadata } from "next";
import Link from "next/link";
import { parts, pad2, totalChapters } from "@/content/curriculum";
import { availableHrefs } from "@/lib/content";
import { Footer } from "@/components/site/Footer";
import { ContentsProgress } from "@/components/learn/ContentsProgress";
import { JsonLd } from "@/components/seo/JsonLd";
import { courseJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "learn sql and databases: the full contents",
  description: `a free, visual sql and database course: all ${totalChapters} chapters in reading order, from your first SELECT to joins, indexes, transactions, MVCC and the write-ahead log.`,
  alternates: { canonical: "/learn" },
  openGraph: { url: "/learn" },
};

export default function Contents() {
  const ready = new Set(availableHrefs());
  return (
    <main id="main" className="px-[var(--gutter)] pt-14">
      <JsonLd data={courseJsonLd(parts, ready)} />
      <div className="mx-auto max-w-[1180px]">
        <header className="grid gap-4 border-b border-line pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,46ch)] md:items-end">
          <div>
            <div className="text-12 text-faint">everything</div>
            <h1 className="mt-4 text-[clamp(2rem,1.2rem+2.6vw,2.75rem)] leading-[1.05] font-display font-light tracking-[0.005em] text-hi">
              contents
            </h1>
          </div>
          <div className="text-13 leading-[1.7] text-mute">
            <p>
              {parts.length} parts, {totalChapters} chapters, in the order they build on each other. if you already know
              some sql, skip around. every chapter links back to what it needs.
            </p>
            <ContentsProgress />
          </div>
        </header>

        <ol>
          {parts.map((p) => (
            <li key={p.slug} className="grid gap-x-12 gap-y-5 border-b border-line py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
              <div className="lg:sticky lg:top-[calc(var(--bar-h)+32px)] lg:self-start">
                <Link href={`/learn/${p.slug}`} className="group block">
                  <span className="font-display text-[1.05rem] text-accent italic">part {pad2(p.n)}</span>
                  <h2 className="mt-2 font-display text-[1.6rem] leading-[1.2] font-normal text-hi group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                    {p.title}
                  </h2>
                  <p className="mt-2 max-w-[44ch] text-13 leading-[1.65] text-mute">{p.blurb}</p>
                </Link>
              </div>
              <ol className="grid gap-px">
                {p.chapters.map((c, i) => {
                  const href = `/learn/${p.slug}/${c.slug}`;
                  const has = ready.has(href);
                  return (
                    <li key={c.slug}>
                      <Link
                        href={href}
                        className="group grid grid-cols-[5ch_minmax(0,1fr)] gap-x-3 rounded-xs px-3 py-2.5 transition-colors duration-150 hover:bg-well sm:grid-cols-[5ch_minmax(0,16rem)_minmax(0,1fr)]"
                      >
                        <span className="text-12 leading-6 text-faint tabular">
                          {pad2(p.n)}.{pad2(i + 1)}
                        </span>
                        <span className={`text-14 leading-6 ${has ? "text-ink group-hover:text-hi" : "text-faint"}`}>
                          {c.title}
                          {!has && <span className="ml-2 text-11 text-faint">soon</span>}
                        </span>
                        <span className="col-start-2 text-12 leading-6 text-mute sm:col-start-3">{c.blurb}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </div>
      <Footer />
    </main>
  );
}
