"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";
import { openSearch } from "./Search";
import { site } from "@/lib/site";

const nav = [
  { href: "/learn", label: "learn" },
  { href: "/play", label: "play" },
  { href: "/glossary", label: "glossary" },
];

export function Bar() {
  const path = usePathname();
  const inBook = /^\/learn\/[^/]+/.test(path);
  return (
    <header className="sticky top-0 z-40 h-[var(--bar-h)] border-b border-line bg-bg/86 backdrop-blur-[14px]">
      <div className="flex h-full items-center justify-between gap-4 px-[var(--gutter)]">
        <div className="flex items-center gap-3">
          {inBook && (
            <button
              onClick={() => window.dispatchEvent(new Event("sfe-menu"))}
              className="word -ml-2 lg:hidden"
              aria-label="open contents"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          )}
          <Link href="/" className="rounded-xs" aria-label="select * from everything, home">
            <Wordmark />
          </Link>
          <a
            href={site.author.url}
            target="_blank"
            rel="noreferrer"
            className="hidden text-[0.98rem] text-faint italic transition-colors duration-150 hover:text-hi lg:inline"
          >
            by {site.author.short}
          </a>
        </div>

        <nav className="flex items-center gap-1" aria-label="main">
          <div className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const on = path === n.href || path.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-sm px-2.5 py-1 text-[1.02rem] transition-colors duration-150 ${on ? "text-hi" : "text-mute hover:text-hi"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
          <button
            onClick={openSearch}
            className="ml-2 flex h-8 items-center gap-3 rounded-md pr-1.5 pl-3 text-13 text-mute shadow-[inset_0_0_0_1px_var(--line-2)] transition-[color,box-shadow] duration-150 ease-sfe hover:text-hi hover:shadow-[inset_0_0_0_1px_var(--ink)]"
            aria-label="search, command k"
          >
            <span className="hidden text-[0.98rem] sm:inline">search</span>
            <svg className="sm:hidden" width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" fill="none" />
              <path d="M9 9l3.5 3.5" stroke="currentColor" />
            </svg>
            <span className="kbd hidden sm:inline-flex">⌘K</span>
          </button>
          <ThemeToggle />
          <a
            href={site.repo}
            className="word hidden sm:inline-flex"
            aria-label="source on github"
            target="_blank"
            rel="noreferrer"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}
