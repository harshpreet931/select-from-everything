"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// a real-format postgres error for the missing page. /learn/a/b reads as everything.a.b,
// anything else as everything.public.<path>
function relationFor(path: string) {
  const parts = path.replace(/^\/|\/$/g, "").split("/").filter(Boolean).map((p) => p.replace(/-/g, "_"));
  if (parts[0] === "learn" && parts.length >= 2) return parts.slice(1, 3).join(".");
  return `public.${parts.join("_") || "nothing"}`;
}

export default function NotFound() {
  const [rel, setRel] = useState("public.nothing");
  useEffect(() => setRel(relationFor(window.location.pathname)), []);
  const query = `SELECT * FROM everything.${rel};`;
  const caret = " ".repeat("LINE 1: SELECT * FROM ".length) + "^";

  return (
    <main id="main" className="mx-auto flex min-h-[calc(100dvh-var(--bar-h))] max-w-[880px] flex-col justify-center px-[var(--gutter)] py-24">
      <pre className="overflow-x-auto text-13 leading-[1.7] text-mute">
        <span className="text-dead">{`ERROR:  42P01: relation "${rel}" does not exist`}</span>
        {`\nLINE 1: ${query}\n${caret}`}
      </pre>
      <h1 className="mt-10 text-[clamp(2rem,1.2rem+2.6vw,2.75rem)] leading-[1.05] font-display font-light tracking-[0.005em] text-hi">
        that page doesn&apos;t exist.
      </h1>
      <p className="mt-4 text-15 text-mute">(0 rows.) the link is wrong, or the page moved. the contents has everything, and SELECT * is fine there.</p>
      <div className="mt-8 flex gap-2">
        <Link href="/learn" className="act solid">
          open the contents
        </Link>
        <Link href="/" className="act">
          go home
        </Link>
      </div>
    </main>
  );
}
