import type { Metadata } from "next";
import Link from "next/link";
import { glossary } from "@/content/glossary";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { glossaryJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "sql and database glossary: every term in one line",
  description: "a sql and database glossary: joins, NULL, indexes, EXPLAIN, MVCC, VACUUM, WAL, isolation levels and more, each in one line and linked to a visual chapter that explains it.",
  alternates: { canonical: "/glossary" },
  openGraph: { url: "/glossary" },
};

export default function Glossary() {
  const groups = new Map<string, typeof glossary>();
  for (const t of glossary) {
    const ch = /^[a-z]/i.test(t.term) ? t.term[0].toUpperCase() : "#";
    groups.set(ch, [...(groups.get(ch) ?? []), t]);
  }
  const letters = [...groups.keys()];

  return (
    <main id="main" className="px-[var(--gutter)] pt-14">
      <JsonLd data={glossaryJsonLd(glossary)} />
      <div className="mx-auto max-w-[980px]">
        <header className="border-b border-line pb-8">
          <div className="text-12 text-faint">everything.glossary</div>
          <h1 className="mt-4 text-[clamp(2rem,1.2rem+2.6vw,2.75rem)] leading-[1.05] font-display font-light tracking-[0.005em] text-hi">
            glossary
          </h1>
          <p className="mt-4 max-w-[56ch] text-15 leading-[1.65] text-mute">
            {glossary.length} terms, one line each. every one links to the chapter that explains it properly.
          </p>
          <nav className="mt-7 flex flex-wrap gap-1" aria-label="letters">
            {letters.map((l) => (
              <a key={l} href={`#letter-${l}`} className="word !min-h-7 !px-2">
                {l.toLowerCase()}
              </a>
            ))}
          </nav>
        </header>
        {letters.map((l) => (
          <section key={l} id={`letter-${l}`} className="grid gap-x-10 border-b border-line py-8 md:grid-cols-[6ch_minmax(0,1fr)]">
            <h2 className="mb-4 font-display text-[2rem] leading-none font-light text-accent italic md:mb-0">{l.toLowerCase()}</h2>
            <dl>
              {groups.get(l)!.map((t) => (
                <div key={t.id} id={t.id} className="grid scroll-mt-28 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <dt className="text-14 text-hi">{t.term}</dt>
                  <dd className="text-13 leading-[1.7] text-ink">
                    {t.short}{" "}
                    <Link href={t.href} className="link text-mute">
                      read more
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <Footer />
    </main>
  );
}
