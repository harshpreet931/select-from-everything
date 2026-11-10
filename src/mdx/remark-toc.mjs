// gives every h2/h3 a stable id and exports `toc` + `stats` from each mdx file:
//   export const toc = [{ depth: 2, id: "why-strings-are-immutable", text: "why strings are immutable" }, ...]
//   export const stats = { words: 812, figures: 6 }
import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { valueToEstree } from "estree-util-value-to-estree";

// things that count as a "figure" for the header stats and reading time
const FIGURES = new Set(["Figure", "Predict", "Quiz", "Compare"]);

export default function remarkToc() {
  return (tree) => {
    const slugger = new GithubSlugger();
    const toc = [];
    let words = 0;
    let figures = 0;

    visit(tree, (node) => {
      if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
        const text = toString(node).trim();
        const id = slugger.slug(text);
        node.data ??= {};
        node.data.hProperties = { ...(node.data.hProperties ?? {}), id };
        toc.push({ depth: node.depth, id, text });
      }
      if (node.type === "text") {
        words += node.value.split(/\s+/).filter(Boolean).length;
      }
      if (node.type === "code") {
        words += Math.round(node.value.split(/\s+/).length * 0.3);
      }
      if (node.type === "mdxJsxFlowElement" && FIGURES.has(node.name)) {
        figures += 1;
      }
    });

    const program = (name, value) => ({
      type: "mdxjsEsm",
      value: "",
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [
            {
              type: "ExportNamedDeclaration",
              specifiers: [],
              source: null,
              declaration: {
                type: "VariableDeclaration",
                kind: "const",
                declarations: [
                  {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name },
                    init: valueToEstree(value),
                  },
                ],
              },
            },
          ],
        },
      },
    });

    tree.children.unshift(program("toc", toc), program("stats", { words, figures }));
  };
}
