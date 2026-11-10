import "server-only";
import fs from "node:fs";
import path from "node:path";
import { flat } from "@/content/curriculum";

const root = path.join(process.cwd(), "content");

/** chapters that have an mdx file on disk. the rest show up as "soon". */
export function availableHrefs(): string[] {
  return flat
    .filter((c) => fs.existsSync(path.join(root, c.part.slug, `${c.slug}.mdx`)))
    .map((c) => c.href);
}

export function isAvailable(part: string, chapter: string) {
  return fs.existsSync(path.join(root, part, `${chapter}.mdx`));
}
