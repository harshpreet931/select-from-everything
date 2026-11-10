import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { SqlPanel } from "@/components/figures/kit/SqlPanel";
import { planText, prov } from "./source";

// two captured text plans of the same query side by side (stacked on phones), each with its own
// provenance line: typically a real server next to the browser engine. lines containing any of
// `hot` are lit. server component.
//
//   <PlanPair a={{ trace: server, step: 4, label: "a postgres 18.6 server" }} b={{ trace: browser, step: 1, label: "this page" }} hot={["Workers"]} />

type Side = { trace: Capture; step: number; label: string };

function planOnly(t: Capture, i: number) {
  const all = planText(t, i).split("\n");
  const end = all.findIndex((l, j) => j > 0 && /^\S/.test(l));
  return end < 0 ? all : all.slice(0, end);
}

export function PlanPair({ a, b, hot = [] }: { a: Side; b: Side; hot?: string[] }) {
  const sides = [a, b].map((s) => {
    const lines = planOnly(s.trace, s.step);
    return { ...s, code: lines.join("\n"), hot: lines.flatMap((l, j) => (hot.some((h) => l.includes(h)) ? [j + 1] : [])) };
  });
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[760px]:grid-cols-2">
        {sides.map((s) => (
          <div key={s.label} className="grid min-w-0 content-start gap-1.5">
            <SqlPanel code={s.code} lang="plan" file={s.label} hot={s.hot} nolines />
            <Provenance trace={prov(s.trace)} />
          </div>
        ))}
      </div>
    </div>
  );
}
