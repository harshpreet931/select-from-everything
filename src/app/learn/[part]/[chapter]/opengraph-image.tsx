import { renderOg, ogSize } from "@/lib/og";
import { flat, getChapter, pad2 } from "@/content/curriculum";

export const alt = "a chapter of select * from everything";
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export function generateStaticParams() {
  return flat.map((c) => ({ part: c.part.slug, chapter: c.slug }));
}

export default async function Image({ params }: { params: Promise<{ part: string; chapter: string }> }) {
  const { part, chapter } = await params;
  const c = getChapter(part, chapter)!;
  const i = c.part.chapters.findIndex((x) => x.slug === c.slug) + 1;
  return renderOg({
    address: c.address,
    title: c.title,
    blurb: c.blurb,
    foot: `part ${pad2(c.part.n)}, ${c.part.title}`,
  });
}
