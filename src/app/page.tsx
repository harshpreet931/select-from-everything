import type { Metadata } from "next";
import Link from "next/link";
import { Descent } from "@/components/home/Descent";
import { Hero } from "@/components/home/Hero";
import { Wall } from "@/components/home/Wall";
import { Footer } from "@/components/site/Footer";
import { availableHrefs } from "@/lib/content";
import { totalChapters, parts } from "@/content/curriculum";
import { JsonLd } from "@/components/seo/JsonLd";
import { homeDescription, homeJsonLd, homeTitle, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/", title: homeTitle, absolute: true, description: homeDescription });

const rules: [string, React.ReactNode][] = [
  ["queries", "real. every snippet runs on postgres 18.6, right here in your browser."],
  ["figures", "they move. step them, slide them, break them."],
  ["internals", "every page, tuple and WAL record you see was captured from a real server."],
  ["depth", "from your first SELECT to the bytes on disk, in one voice."],
  ["price", "free. MIT licensed. no account, no ads, no tracking."],
];

function SectionHead({ id, title, sub }: { id: string; title: string; sub: React.ReactNode }) {
  return (
    <header className="mx-auto max-w-[36rem] text-center">
      <span className="ornament" aria-hidden />
      <h2 id={id} className="mt-7 font-display text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-[1.15] font-light text-hi">
        {title}
      </h2>
      <p className="mt-4 text-17 leading-[1.7] text-mute italic">{sub}</p>
    </header>
  );
}

export default function Home() {
  return (
    <main id="main">
      <JsonLd data={homeJsonLd()} />
      <Hero />
      <Descent />

      <section className="mt-[clamp(80px,12vw,160px)] px-[var(--gutter)]" aria-labelledby="book-title">
        <SectionHead
          id="book-title"
          title="the whole book"
          sub={`${parts.length} parts, ${totalChapters} chapters. read it in order, or jump to whatever you're stuck on. your progress stays in your browser.`}
        />
        <div className="mx-auto mt-12 max-w-[1180px]">
          <Wall available={availableHrefs()} />
        </div>
      </section>

      <section className="mt-[clamp(80px,12vw,160px)] px-[var(--gutter)]" aria-labelledby="rules-title">
        <SectionHead id="rules-title" title="the house rules" sub="what every page here promises." />
        <dl className="mx-auto mt-10 max-w-[38rem]">
          {rules.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-5 border-b border-line py-4 last:border-b-0">
              <dt className="text-right font-display text-[1.2rem] text-accent italic">{k}</dt>
              <dd className="text-[1.1rem] leading-[1.65] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-12 flex flex-wrap justify-center gap-2.5">
          <Link href="/learn/start/what-is-a-database" className="act solid !min-h-11 !px-5 !text-13">
            start at the top
          </Link>
          <Link href="/learn/basics/logical-order" className="act !min-h-11 !px-5 !text-13">
            or jump to the best picture in SQL
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
