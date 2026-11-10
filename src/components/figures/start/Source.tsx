import type { ReactNode } from "react";

// a provenance line for figures whose data is real but doesn't fit <Provenance>'s three shapes
// (one trace, one sim, or drawn by hand): several engines at once, or a file from a postgres
// install. same look as <Provenance>.
export function Source({ children }: { children: ReactNode }) {
  return <div className="text-right text-[10px] leading-4 text-faint">{children}</div>;
}
