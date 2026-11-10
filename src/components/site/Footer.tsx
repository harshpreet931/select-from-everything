import Link from "next/link";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-[clamp(96px,14vw,180px)] border-t border-line px-[var(--gutter)] pt-14 pb-12 text-15 text-mute">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col items-center text-center">
          <span className="ornament" aria-hidden />
          <p className="mt-6 font-display text-[1.6rem] font-light text-hi">
            {site.name}, by{" "}
            <a href={site.author.url} className="link" target="_blank" rel="noreferrer">
              {site.author.short}
            </a>
          </p>
          <p className="mt-2 text-15 italic">
            written and drawn by{" "}
            <a href={site.author.url} className="link not-italic" target="_blank" rel="noreferrer">
              {site.author.name}
            </a>
            . more of my work at{" "}
            <a href={site.author.url} className="link not-italic" target="_blank" rel="noreferrer">
              {site.author.domain}
            </a>
            .
          </p>
        </div>
        <div className="mt-12 flex flex-col gap-6 border-t border-line pt-8 text-14 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-[44rem] leading-[1.7]">
            MIT licensed and open source. set in Crimson Pro, Cormorant Garamond and JetBrains Mono. every query runs on{" "}
            {site.pg.engine}, compiled to webassembly. made by {site.author.short} after one too many
            &quot;why isn&apos;t my index used&quot; afternoons.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="footer">
            <Link href="/learn" className="link">
              contents
            </Link>
            <Link href="/glossary" className="link">
              glossary
            </Link>
            <Link href="/play" className="link">
              play
            </Link>
            <a href={site.repo} className="link" target="_blank" rel="noreferrer">
              source
            </a>
            <a href={site.author.url} className="link" target="_blank" rel="noreferrer">
              {site.author.domain}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
