import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export const dynamic = "force-static";

// everything readable is open. kept out: the engine and dataset downloads (/sql/: megabytes of
// wasm no search result needs), the analytics proxy (/ingest/) and the search index (/_pagefind/).
// every page renders its text on the server, so none of these are needed to see what a page says.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/sql/", "/ingest/", "/_pagefind/"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
