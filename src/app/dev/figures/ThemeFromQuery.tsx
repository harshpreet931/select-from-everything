"use client";

import { useEffect } from "react";

// ?theme=dark or ?theme=light pins the theme for screenshots. dev gallery only.
export function ThemeFromQuery() {
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  }, []);
  return null;
}
