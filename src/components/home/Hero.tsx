"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { flat } from "@/content/curriculum";
import { readLast } from "@/lib/progress";
import { IndexTree } from "./IndexTree";

/** the opener. a book's title page: illustration, title, byline, a short lede. */
export function Hero() {
  const [last, setLast] = useState<(typeof flat)[number] | null>(null);
  useEffect(() => {
    const href = readLast();
    setLast(flat.find((c) => c.href === href) ?? null);
  }, []);

  return (
    <section className="px-[var(--gutter)] pt-[clamp(48px,8vw,96px)] pb-10 text-center">
      <IndexTree className="mx-auto w-full max-w-[400px]" />
      <span className="ornament mt-12" aria-hidden />
      <h1 className="mt-8 font-display text-[clamp(2.6rem,1.6rem+3.6vw,4.4rem)] leading-[1.02] font-light tracking-[0.01em] text-hi">
        sql, all the way down
      </h1>
      <p className="mt-5 text-17 text-mute italic">
        a visual guide to sql, by{" "}
        <a href="https://harshpreet.com" className="link not-italic" target="_blank" rel="noreferrer">
          harshpreet
        </a>{" "}
        <span className="not-italic text-faint">·</span>{" "}
        <a href="https://harshpreet.com" className="link not-italic" target="_blank" rel="noreferrer">
          harshpreet.com
        </a>
      </p>
      <span className="ornament mt-10" aria-hidden />
      <p className="mx-auto mt-10 max-w-[34rem] text-[1.22rem] leading-[1.75] text-ink">
        a free, visual book about SQL and the database underneath it. from your first{" "}
        <code className="inline-code">SELECT</code> to the bytes on disk, on a real postgres running in your browser.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
        <Link href={flat[0].href} className="act solid !min-h-11 !px-5 !text-13">
          start at the top
        </Link>
        <Link href="/learn" className="act !min-h-11 !px-5 !text-13">
          open the contents
        </Link>
      </div>
      <div className="mt-6 min-h-6 text-15 text-mute italic">
        {last ? (
          <Link href={last.href} className="link not-italic">
            continue: {last.title}
          </Link>
        ) : (
          <span>or scroll, and follow one query all the way down.</span>
        )}
      </div>
    </section>
  );
}
