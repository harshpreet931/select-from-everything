import type { MetadataRoute } from "next";
import { flat, parts } from "@/content/curriculum";
import { availableHrefs } from "@/lib/content";
import { abs, gitModified, lastModified, newest, partModified } from "@/lib/seo";

export const dynamic = "force-static";

// every public page, and only those: written chapters (a "soon" page is noindex), the parts,
// contents, glossary, play and home. lastmod is the last git commit that changed what the page
// shows; a page git can't date gets no lastmod rather than a made-up one. google ignores
// changefreq and priority, so they're left out.
export default function sitemap(): MetadataRoute.Sitemap {
  const ready = new Set(availableHrefs());
  const chapters = flat.filter((c) => ready.has(c.href));
  const curriculum = gitModified("src/content/curriculum.ts");
  const book = newest([...parts.map(partModified), curriculum]);
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: abs(path),
    ...(lastModified ? { lastModified } : {}),
  });
  return [
    entry("/", book),
    entry("/learn", book),
    entry("/glossary", gitModified("src/content/glossary.ts", ...parts.map((p) => `content/${p.slug}/terms.json`))),
    entry("/play", gitModified("src/app/play", "src/components/play")),
    ...parts.map((p) => entry(`/learn/${p.slug}`, newest([partModified(p), curriculum]))),
    ...chapters.map((c) => entry(c.href, lastModified(c))),
  ];
}
