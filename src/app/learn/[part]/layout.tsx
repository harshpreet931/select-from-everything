import { Rail } from "@/components/learn/Rail";
import { availableHrefs } from "@/lib/content";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1600px]">
      <Rail available={availableHrefs()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
