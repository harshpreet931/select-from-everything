import { renderOg, ogSize } from "@/lib/og";
import { totalChapters } from "@/content/curriculum";

export const alt = "select * from everything: sql, all the way down.";
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return renderOg({
    address: "everything",
    title: "sql, all the way down",
    blurb: `an open-source book that draws sql and the database under it. ${totalChapters} chapters, from your first SELECT to the write-ahead log.`,
    foot: "a visual guide to sql and postgres",
  });
}
