import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export const dynamic = "force-static";

// enough for "add to home screen" to look right. no service worker: the book needs the network.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: "select *",
    description: site.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "browser",
    lang: "en",
    dir: "ltr",
    background_color: "#fdfbf7",
    theme_color: "#fdfbf7",
    categories: ["education", "books", "developer"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
