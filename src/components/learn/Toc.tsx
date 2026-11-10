"use client";

import { useEffect, useState } from "react";

type Entry = { depth: 2 | 3; id: string; text: string };

/** "on this page", with scroll-spy and a reading meter. */
export function Toc({ toc }: { toc: Entry[] }) {
  const [active, setActive] = useState<string | null>(toc[0]?.id ?? null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const heads = toc
      .map((t) => document.getElementById(t.id))
      .filter((x): x is HTMLElement => !!x);
    if (!heads.length) return;
    const onScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.3;
      let cur = heads[0].id;
      for (const h of heads) if (h.offsetTop <= y) cur = h.id;
      setActive(cur);
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  if (!toc.length) return null;

  return (
    <nav aria-label="on this page" className="text-12">
      <div className="mb-3 flex items-baseline justify-between text-faint">
        <span>on this page</span>
        <span className="tabular">{pct}%</span>
      </div>
      <div className="mb-4 h-px w-full bg-line">
        <div className="h-px bg-ink transition-[width] duration-150 ease-sfe" style={{ width: `${pct}%` }} />
      </div>
      <ol className="space-y-[3px]">
        {toc.map((t) => (
          <li key={t.id} className={t.depth === 3 ? "pl-3" : ""}>
            <a
              href={`#${t.id}`}
              className={`block py-[3px] leading-snug transition-colors duration-150 ${
                active === t.id ? "text-hi" : "text-faint hover:text-ink"
              }`}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
