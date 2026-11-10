"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parts, pad2 } from "@/content/curriculum";
import { useProgress } from "@/lib/progress";

/** the file-tree sidebar. one part open at a time, lamps for progress. */
export function Rail({ available }: { available: string[] }) {
  const path = usePathname();
  const progress = useProgress();
  const ready = new Set(available);
  const current = parts.find((p) => path.startsWith(`/learn/${p.slug}`))?.slug;
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []));
  const [drawer, setDrawer] = useState(false);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (current) setOpen((o) => (o.has(current) ? o : new Set([...o, current])));
    setDrawer(false);
  }, [path, current]);

  useEffect(() => {
    const on = () => setDrawer((d) => !d);
    window.addEventListener("sfe-menu", on);
    return () => window.removeEventListener("sfe-menu", on);
  }, []);

  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
    el?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggle = (slug: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  return (
    <>
      {drawer && (
        <div className="fixed inset-0 z-30 bg-[rgb(0_0_0/0.6)] lg:hidden" onClick={() => setDrawer(false)} />
      )}
      <nav
        ref={nav}
        aria-label="contents"
        className={`fixed top-[var(--bar-h)] bottom-0 left-0 z-30 w-[288px] overflow-y-auto overscroll-contain border-r border-line bg-bg pt-6 pb-24 transition-transform duration-200 ease-sfe lg:sticky lg:z-0 lg:h-[calc(100dvh-var(--bar-h))] lg:w-[280px] lg:shrink-0 lg:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/learn" className="mb-3 flex items-center justify-between px-5 font-display text-[1.05rem] text-mute italic hover:text-hi">
          <span>contents</span>
          <span className="font-sans text-13 not-italic tabular">{Object.keys(progress).length} read</span>
        </Link>
        <ol>
          {parts.map((p) => {
            const isOpen = open.has(p.slug);
            const done = p.chapters.filter((c) => progress[`/learn/${p.slug}/${c.slug}`]).length;
            return (
              <li key={p.slug} className="border-t border-line first:border-t-0">
                <button
                  onClick={() => toggle(p.slug)}
                  aria-expanded={isOpen}
                  className={`grid w-full grid-cols-[3ch_1fr_auto] items-baseline gap-x-2 px-5 py-3 text-left text-[1.02rem] transition-colors duration-150 ${
                    current === p.slug ? "text-hi" : "text-mute hover:text-hi"
                  }`}
                >
                  <span className="font-mono text-12 text-faint tabular">{pad2(p.n)}</span>
                  <span>{p.title}</span>
                  <span className="font-mono text-11 text-faint tabular">
                    {done > 0 ? `${done}/` : ""}
                    {p.chapters.length}
                  </span>
                </button>
                {isOpen && (
                  <ol className="pb-3">
                    {p.chapters.map((c, i) => {
                      const href = `/learn/${p.slug}/${c.slug}`;
                      const here = path === href;
                      const has = ready.has(href);
                      const read = !!progress[href];
                      return (
                        <li key={c.slug}>
                          {
                            <Link
                              href={href}
                              aria-current={here ? "page" : undefined}
                              className={`mx-2 grid grid-cols-[3ch_1fr_auto] items-baseline gap-x-2 rounded-sm px-3 py-[6px] text-[0.98rem] leading-snug transition-colors duration-120 ${
                                here ? "bg-well-2 text-hi shadow-[inset_2px_0_0_var(--accent)]" : "text-mute hover:text-hi"
                              }`}
                            >
                              <span className={`font-mono text-11 tabular ${here ? "text-accent" : "text-faint"}`}>
                                {pad2(i + 1)}
                              </span>
                              <span className={has || here ? "" : "opacity-55"}>{c.title}</span>
                              {has ? (
                                <span
                                  aria-label={read ? "read" : undefined}
                                  className={`size-[5px] self-center rounded-full ${
                                    read ? "bg-accent" : "bg-line-2"
                                  }`}
                                />
                              ) : (
                                <span className="text-[10px] opacity-60">soon</span>
                              )}
                            </Link>
                          }
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
