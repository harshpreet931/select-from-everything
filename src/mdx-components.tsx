import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/mdx/CodeBlock";
import { C, Deep, Defs, Docs, Figure, Gotcha, InShort, Interview, Keylines, Note, Since } from "@/components/mdx/blocks";
import { Bad, Compare, Explain, Good, Predict, Quiz, Tab, Tabs } from "@/components/mdx/interactive";
import { viz } from "@/components/viz";
import { db } from "@/components/db";

// everything here is available in every .mdx file without an import.
// chapter-specific figures live in src/components/figures/<part>/ and are imported explicitly.

function Anchor({ href = "", ...props }: ComponentProps<"a">) {
  if (href.startsWith("/") || href.startsWith("#")) return <Link href={href} {...props} />;
  return <a href={href} target="_blank" rel="noreferrer" {...props} />;
}

function H2({ id, children }: ComponentProps<"h2">) {
  return (
    <h2 id={id}>
      <a className="anchor" href={`#${id}`}>
        {children}
      </a>
    </h2>
  );
}

function H3({ id, children }: ComponentProps<"h3">) {
  return (
    <h3 id={id}>
      <a className="anchor" href={`#${id}`}>
        {children}
      </a>
    </h3>
  );
}

function Table(props: ComponentProps<"table">) {
  return (
    <div className="table-wrap my-8">
      <table {...props} />
    </div>
  );
}

const components: MDXComponents = {
  a: Anchor,
  h2: H2,
  h3: H3,
  pre: CodeBlock as MDXComponents["pre"],
  table: Table,
  // blocks
  InShort,
  Gotcha,
  Interview,
  Docs,
  Note,
  Deep,
  Keylines,
  Figure,
  Defs,
  C,
  Since,
  // interactive
  Quiz,
  Predict,
  Explain,
  Tabs,
  Tab,
  Compare,
  Bad,
  Good,
  // generic figures
  ...viz,
  // database primitives
  ...db,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
