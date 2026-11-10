import "server-only";
import { createHighlighter, type Highlighter } from "shiki";
import { toHtml } from "hast-util-to-html";
import type { Element } from "hast";
import { darkTheme, lightTheme } from "@/mdx/themes.mjs";

// build-time syntax highlighting for figures that show code (steppers etc).
// returns one html string per source line, coloured with the same themes as code blocks.

let hl: Promise<Highlighter> | null = null;
function highlighter() {
  hl ??= createHighlighter({
    themes: [darkTheme, lightTheme],
    langs: ["sql", "bash", "json", "text"],
  });
  return hl;
}

export async function highlightLines(code: string, lang = "sql"): Promise<string[]> {
  const h = await highlighter();
  const hast = h.codeToHast(code.replace(/\n$/, ""), {
    lang,
    themes: { dark: "blackroom", light: "paper" },
    defaultColor: false,
  });
  const lines: string[] = [];
  const pre = hast.children[0] as Element;
  const codeEl = pre.children[0] as Element;
  for (const child of codeEl.children) {
    if (child.type !== "element") continue;
    const cls = child.properties.className ?? child.properties.class;
    const isLine = Array.isArray(cls) ? cls.includes("line") : String(cls ?? "").split(" ").includes("line");
    if (isLine) {
      lines.push(toHtml(child.children));
    }
  }
  return lines;
}
