"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { flat, totalChapters } from "@/content/curriculum";
import { readLast, useProgress } from "@/lib/progress";

export function ContentsProgress() {
  const progress = useProgress();
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => setLast(readLast()), []);
  const read = Object.keys(progress).length;
  const lastChapter = flat.find((c) => c.href === last);
  if (!read && !lastChapter) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-12">
      <span className="text-faint tabular">
        {read} of {totalChapters} read
      </span>
      {lastChapter && (
        <Link href={lastChapter.href} className="link text-ink">
          continue: {lastChapter.title}
        </Link>
      )}
    </div>
  );
}
