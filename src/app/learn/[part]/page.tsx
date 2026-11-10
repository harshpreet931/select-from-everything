import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPart, parts, pad2 } from "@/content/curriculum";
import { availableHrefs } from "@/lib/content";
import { Glyph } from "@/components/home/Glyph";
import { site } from "@/lib/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta, partDescription, partJsonLd, partTitle } from "@/lib/seo";

type Params = { part: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return parts.map((p) => ({ part: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = getPart((await params).part);
  if (!p) return {};
  return pageMeta({
    path: `/learn/${p.slug}`,
    title: partTitle(p),
    description: partDescription(p),
  });
}


export default async function PartPage({ params }: { params: Promise<Params> }) {
  const p = getPart((await params).part);
  if (!p) notFound();
  const ready = new Set(availableHrefs());
  const prev = parts[p.n - 2];
  const next = parts[p.n];
  const first = `/learn/${p.slug}/${p.chapters[0].slug}`;

  return (
    <div className="px-[var(--gutter)] pt-10 pb-28 lg:pt-14 xl:pl-16">
      <main id="main" className="max-w-[880px]">
        <JsonLd data={partJsonLd(p)} />
        <div className="text-12 text-faint">
          <Link href="/learn" className="hover:text-hi">
            everything
          </Link>
          <span className="text-line-2">.</span>
          <span className="text-mute">{p.slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}</span>
        </div>
        <div className="mt-6 flex items-start justify-between gap-6">
          <h1 className="max-w-[18ch] text-[clamp(2rem,1.2rem+2.6vw,2.75rem)] leading-[1.05] font-display font-light tracking-[0.005em] text-hi">
            {p.title}
          </h1>
          <Glyph name={p.glyph} className="mt-2 shrink-0 scale-150 text-mute" />
        </div>
        <p className="mt-5 max-w-[56ch] text-15 leading-[1.65] text-mute">{p.blurb}</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={first} className="act solid">
            start part {pad2(p.n)}
          </Link>
        </div>

        <ol className="mt-14 border-t border-line">
          {p.chapters.map((c, i) => {
            const href = `/learn/${p.slug}/${c.slug}`;
            const has = ready.has(href);
            return (
              <li key={c.slug} className="border-b border-line">
                <Link
                  href={href}
                  className="group grid grid-cols-[5ch_minmax(0,1fr)] gap-x-4 px-2 py-5 transition-colors duration-150 hover:bg-well"
                >
                  <span className="text-12 leading-6 text-faint tabular">{pad2(i + 1)}</span>
                  <span>
                    <span className={`block text-16 leading-6 ${has ? "text-ink group-hover:text-hi" : "text-faint"}`}>
                      {c.title}
                      {!has && <span className="ml-2 text-11 text-faint">soon</span>}
                      {c.since && <span className="ml-3 text-11 text-faint">postgres {c.since}+</span>}
                      {c.preview && <span className="ml-3 text-11 text-faint">postgres {site.pg.major + 1}</span>}
                      {c.preview && <span className="ml-3 text-11 text-faint">preview</span>}
                    </span>
                    <span className="mt-1 block text-13 leading-[1.6] text-mute">{c.blurb}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <nav className="mt-10 grid gap-px bg-line sm:grid-cols-2" aria-label="parts">
          {[prev, next].map((x, i) =>
            x ? (
              <Link
                key={x.slug}
                href={`/learn/${x.slug}`}
                className={`flex flex-col gap-1 bg-bg px-5 py-5 transition-colors duration-150 hover:bg-well ${i ? "sm:items-end sm:text-right" : ""}`}
              >
                <span className="text-11 text-faint">{i ? `next part · ${pad2(x.n)} →` : `← previous part · ${pad2(x.n)}`}</span>
                <span className="text-15 text-ink">{x.title}</span>
              </Link>
            ) : (
              <div key={i} className="bg-bg" />
            ),
          )}
        </nav>
      </main>
    </div>
  );
}
