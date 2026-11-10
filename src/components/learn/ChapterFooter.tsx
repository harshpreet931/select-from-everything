"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { markDone, rememberLast, useProgress } from "@/lib/progress";
import { site } from "@/lib/site";

type Neighbour = { href: string; title: string; num: string } | null;

/** mark-as-read + prev/next. reaching the bottom marks the chapter read. */
export function ChapterFooter({ href, prev, next }: { href: string; prev: Neighbour; next: Neighbour }) {
  const progress = useProgress();
  const done = !!progress[href];
  const sentinel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    rememberLast(href);
  }, [href]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      // don't count a flick to the bottom as reading it
      if (e.isIntersecting) timer = setTimeout(() => markDone(href), 1500);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [href]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight" && next) router.push(next.href);
      if (e.key === "ArrowLeft" && prev) router.push(prev.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  return (
    <footer className="mt-24">
      <div ref={sentinel} className="flex items-center justify-between gap-4 border-t border-line pt-5 text-12">
        <button onClick={() => markDone(href, !done)} className="act" aria-pressed={done}>
          <span className={`size-[6px] rounded-full ${done ? "bg-ink" : "bg-line-2"}`} />
          {done ? "read" : "mark as read"}
        </button>
        <span className="hidden text-faint sm:inline">
          <kbd>⌥</kbd> <kbd>←</kbd> <kbd>→</kbd> to flip pages
        </span>
      </div>
      <p className="mt-8 text-center text-15 text-mute italic">
        written and drawn by{" "}
        <a href={site.author.url} className="link not-italic" target="_blank" rel="noreferrer">
          {site.author.short}
        </a>
        . spotted something wrong?{" "}
        <a href={`${site.repo}/issues`} className="link not-italic" target="_blank" rel="noreferrer">
          open an issue
        </a>
        . more at{" "}
        <a href={site.author.url} className="link not-italic" target="_blank" rel="noreferrer">
          {site.author.domain}
        </a>
        .
      </p>
      <div className="mt-8 grid gap-px bg-line sm:grid-cols-2">
        {[prev, next].map((n, i) =>
          n ? (
            <Link
              key={n.href}
              href={n.href}
              className={`group flex flex-col gap-1 bg-bg px-5 py-5 transition-colors duration-150 hover:bg-well ${
                i === 1 ? "sm:items-end sm:text-right" : ""
              }`}
            >
              <span className="text-11 text-faint">
                {i === 0 ? `← previous · ${n.num}` : `next · ${n.num} →`}
              </span>
              <span className="text-15 text-ink group-hover:text-hi">{n.title}</span>
            </Link>
          ) : (
            <div key={i} className="bg-bg" />
          ),
        )}
      </div>
    </footer>
  );
}
