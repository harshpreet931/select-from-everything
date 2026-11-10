"use client";

import Link from "next/link";
import { parts } from "@/content/curriculum";
import { useProgress } from "@/lib/progress";
import { Glyph } from "./Glyph";

const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii"];

/** the whole book as a table of contents: 18 parts, a line-art glyph each, a quiet progress line. */
export function Wall({ available }: { available: string[] }) {
  const progress = useProgress();
  const ready = new Set(available);
  return (
    <ol className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
      {parts.map((p) => {
        const hrefs = p.chapters.map((c) => `/learn/${p.slug}/${c.slug}`);
        const read = hrefs.filter((h) => progress[h]).length;
        const written = hrefs.filter((h) => ready.has(h)).length;
        return (
          <li key={p.slug} className="border-t border-line">
            <Link
              href={`/learn/${p.slug}`}
              className="group -mx-3 flex h-full gap-5 rounded-lg px-3 py-6 transition-colors duration-200 hover:bg-well"
            >
              <Glyph name={p.glyph} className="lineart-glyph mt-1 size-[40px] shrink-0 text-ref opacity-80 group-hover:opacity-100" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[1.05rem] text-accent italic">part {roman[p.n - 1]}</span>
                  <span className="font-mono text-11 text-faint tabular">
                    {read > 0 ? `${read}/${p.chapters.length} read` : written < p.chapters.length ? `${written}/${p.chapters.length}` : `${p.chapters.length} ch`}
                  </span>
                </div>
                <div className="mt-1 font-display text-[1.45rem] leading-[1.2] text-hi">{p.title}</div>
                <p className="mt-2 text-[0.98rem] leading-[1.55] text-mute">{p.blurb}</p>
                {read > 0 && (
                  <div className="mt-3 h-px bg-line">
                    <div className="h-px bg-accent" style={{ width: `${(read / p.chapters.length) * 100}%` }} />
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
