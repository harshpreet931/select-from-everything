"use client";

import { useMemo, useState } from "react";

type Tone = "ref" | "live" | "dead" | "meta" | "hot";
type Node = { label: string; note?: string; tone?: Tone; children: Node[]; depth: number; id: string };

/**
 * a hierarchy drawn with box-drawing characters. write it as indented text:
 *
 *   <Tree>{`
 *   Throwable
 *       Error              // the JVM is in trouble. don't catch these
 *           OutOfMemoryError #dead
 *       Exception
 *           IOException      #hot // checked
 *           RuntimeException // unchecked
 *   `}</Tree>
 *
 * four spaces per level (mdx eats two). `// note` adds a faint note. `#tone` colours the label.
 * click a node with children to fold it.
 */
export function Tree({ children, folded = [] }: { children: string; folded?: string[] }) {
  const roots = useMemo(() => parse(children), [children]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set(folded));

  const rows: { node: Node; prefix: string }[] = [];
  const walk = (nodes: Node[], prefix: string, isRoot: boolean) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const branch = isRoot ? "" : last ? "└── " : "├── ";
      rows.push({ node: n, prefix: prefix + branch });
      if (n.children.length && !closed.has(n.label)) {
        walk(n.children, isRoot ? "" : prefix + (last ? "    " : "│   "), false);
      }
    });
  };
  walk(roots, "", true);

  return (
    <div className="overflow-x-auto">
      <ul className="min-w-max text-13 leading-[1.85]">
        {rows.map(({ node, prefix }) => {
          const kids = node.children.length > 0;
          const isClosed = closed.has(node.label);
          return (
            <li key={node.id} className="flex items-baseline whitespace-pre">
              <span className="text-faint/70 select-none">{prefix}</span>
              {kids ? (
                <button
                  onClick={() =>
                    setClosed((c) => {
                      const n = new Set(c);
                      if (n.has(node.label)) n.delete(node.label);
                      else n.add(node.label);
                      return n;
                    })
                  }
                  className="rounded-xs text-left transition-colors duration-150 hover:text-hi"
                  aria-expanded={!isClosed}
                  style={{ color: node.tone ? `var(--${node.tone})` : "var(--hi)" }}
                >
                  {node.label}
                  {isClosed && <span className="text-faint"> +{count(node)}</span>}
                </button>
              ) : (
                <span style={{ color: node.tone ? `var(--${node.tone})` : "var(--ink)" }}>{node.label}</span>
              )}
              {node.note && <span className="ml-4 text-12 text-faint">{node.note}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const count = (n: Node): number => n.children.reduce((a, c) => a + 1 + count(c), 0);

function parse(src: string): Node[] {
  // indentation is compared relatively (deeper = child), never counted. mdx strips
  // 2 leading spaces inside expressions, so authors indent with 4 spaces per level.
  const lines = src.replace(/\t/g, "    ").split("\n").filter((l) => l.trim());
  const roots: Node[] = [];
  const stack: Node[] = [];
  lines.forEach((line, i) => {
    const indent = line.match(/^ */)![0].length;
    let text = line.trim();
    let note: string | undefined;
    const ni = text.indexOf("//");
    if (ni >= 0) {
      note = text.slice(ni + 2).trim();
      text = text.slice(0, ni).trim();
    }
    let tone: Tone | undefined;
    const tm = text.match(/\s#(ref|live|dead|meta|hot)\b/);
    if (tm) {
      tone = tm[1] as Tone;
      text = text.replace(tm[0], "").trim();
    }
    const node: Node = { label: text, note, tone, children: [], depth: indent, id: `${i}` };
    while (stack.length && stack[stack.length - 1].depth >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
}
