"use client";

import { useEffect } from "react";
import { useTheme } from "@/lib/theme";

/** dark ↔ paper. also bound to "t" anywhere outside a text field. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable=true], .cm-editor")) return;
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTheme]);

  return (
    <button
      onClick={() => setTheme(next)}
      className="word relative"
      aria-label={`switch to ${next} theme (t)`}
      title={`${next} theme · t`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" />
        <path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
      </svg>
    </button>
  );
}
