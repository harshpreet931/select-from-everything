import type { MetadataRoute } from "next";
import { flat, parts } from "@/content/curriculum";
import { availableHrefs } from "@/lib/content";
import { abs, lastModified } from "@/lib/seo";

export const dynamic = "force-static";

// only written chapters go in: "soon" pages are noindex and stay out of the sitemap
export default function sitemap(): MetadataRoute.Sitemap {
  const ready = new Set(availableHrefs());
  const now = new Date();
  return [
    { url: abs("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: abs("/learn"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: abs("/glossary"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: abs("/play"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...parts.map((p) => ({
      url: abs(`/learn/${p.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...flat
      .filter((c) => ready.has(c.href))
      .map((c) => ({
        url: abs(c.href),
        lastModified: lastModified(c) ?? now,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
  ];
}
