"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import descent from "./descent.json";
import { layers } from "./layers";

/**
 * the home page's one big moment: one query, followed all the way down.
 * left, the story, one layer per screen. right, a sticky stage that swaps to
 * whatever depth you've scrolled to. on phones, each layer carries its own stage.
 */
export function Descent() {
  const [active, setActive] = useState(0);
  const marks = useRef<(HTMLElement | null)[]>([]);

  // the active layer is the last one whose top has crossed the middle of the screen.
  // computed from positions (not just intersection events) so jumps and fast scrolls land right.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let cur = 0;
      marks.current.forEach((m, i) => {
        if (m && m.getBoundingClientRect().top < mid) cur = i;
      });
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="relative mt-[clamp(64px,10vw,140px)] px-[var(--gutter)]" aria-labelledby="descent-title">
      <header className="mx-auto max-w-[36rem] text-center">
        <span className="ornament" aria-hidden />
        <h2 id="descent-title" className="mt-7 font-display text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-[1.15] font-light text-hi">
          one query, all the way down
        </h2>
        <p className="mt-4 text-17 leading-[1.7] text-mute italic">
          what actually happens when you run <code className="inline-code not-italic">{descent.query.replace(/;$/, "")}</code>. every artifact
          below is real output from postgres {site.pg.version}, made by the command printed above it.
        </p>
      </header>

      <div className="mx-auto mt-10 grid max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* the story */}
        <div>
          {layers.map((l, i) => (
            <article
              key={l.id}
              ref={(el) => {
                marks.current[i] = el;
              }}
              data-layer={i}
              className="flex flex-col justify-center py-14 lg:min-h-[74svh] lg:py-20"
            >
              <div className="max-w-[30rem]">
                <div className="font-display text-[1.1rem] text-accent italic tabular">
                  depth {i} of {layers.length - 1}
                </div>
                <h3 className="mt-2 font-display text-[2rem] leading-[1.15] font-light text-hi">{l.title}</h3>
                <p className="mt-4 text-[1.15rem] leading-[1.75] text-ink [&_code]:border-b [&_code]:border-line-2 [&_code]:px-1 [&_code]:text-[0.82em] [&_code]:text-hi">
                  {l.text}
                </p>
                <Link href={l.href} className="link mt-5 inline-block text-[1.02rem]">
                  read: {l.linkLabel}
                </Link>
              </div>
              <div className="ticks mt-8 overflow-x-auto p-6 lg:hidden">{l.stage}</div>
            </article>
          ))}
        </div>

        {/* the stage */}
        <div className="hidden lg:block">
          <div className="sticky top-[calc(var(--bar-h)+10svh)] flex h-[70svh] flex-col">
            <div className="mb-3 flex items-center justify-between font-mono text-12 text-faint">
              <span>
                depth <span className="text-hi tabular">{active}</span> · {layers[active].title}
              </span>
              <Ruler active={active} />
            </div>
            <div className="ticks relative min-h-0 flex-1 p-9">
              {layers.map((l, i) => (
                <div
                  key={l.id}
                  aria-hidden={i !== active}
                  className="absolute inset-9 transition-[opacity,translate] duration-300 ease-sfe"
                  style={{
                    opacity: i === active ? 1 : 0,
                    translate: i === active ? "0 0" : i < active ? "0 -10px" : "0 10px",
                    pointerEvents: i === active ? "auto" : "none",
                  }}
                >
                  {l.stage}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** the depth gauge: one tick per layer, lit up to where you are */
function Ruler({ active }: { active: number }) {
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {layers.map((l, i) => (
        <span
          key={l.id}
          className="h-2.5 w-[3px] rounded-full transition-colors duration-200"
          style={{ background: i === active ? "var(--hot)" : i < active ? "var(--accent-2)" : "var(--line-2)" }}
        />
      ))}
    </div>
  );
}
