declare module "*.mdx" {
  import type { MDXProps } from "mdx/types";
  export type TocEntry = { depth: 2 | 3; id: string; text: string };
  export const toc: TocEntry[];
  export const stats: { words: number; figures: number };
  export const frontmatter: Record<string, unknown> | undefined;
  export default function MDXContent(props: MDXProps): React.JSX.Element;
}
