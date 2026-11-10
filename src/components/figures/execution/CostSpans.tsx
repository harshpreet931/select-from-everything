import type { Capture } from "@/lib/db/captured";
import { Provenance } from "@/components/figures/kit/Provenance";
import { prov, topNode } from "./source";

// a plan's costs as spans on one axis: each node is a bar from its startup cost (before its
// first row) to its total cost (after its last). a node that has to read all of its input
// first (a Hash, an aggregate, a Sort) starts late and ends right after; a Limit sits at the
// very end. server component: it only reads the capture.
//
//   <CostSpans trace={trace} step={2} />

type J = Record<string, unknown> & { Plans?: J[] };

function label(n: J): string {
  const t = String(n["Node Type"]);
  const op = t === "Aggregate" ? ({ Hashed: "HashAggregate", Sorted: "GroupAggregate", Mixed: "MixedAggregate" } as Record<string, string>)[String(n.Strategy)] ?? t : t;
  const rel = n["Relation Name"] ? ` on ${n["Relation Name"]}` : "";
  return op + rel;
}

export function CostSpans({ trace, step, blocking = ["Hash", "HashAggregate", "Sort", "GroupAggregate", "Aggregate"] }: { trace: Capture; step: number; blocking?: string[] }) {
  const rows: { depth: number; label: string; a: number; b: number; block: boolean }[] = [];
  const walk = (n: J, d: number) => {
    const l = label(n);
    rows.push({ depth: d, label: l, a: Number(n["Startup Cost"]), b: Number(n["Total Cost"]), block: blocking.includes(l.split(" on ")[0]) });
    for (const c of n.Plans ?? []) walk(c, d + 1);
  };
  walk(topNode(trace, step) as J, 0);
  const max = Math.max(...rows.map((r) => r.b));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-12" role="img" aria-label={`each plan node's cost as a span from startup to total: ${rows.map((r) => `${r.label} ${r.a} to ${r.b}`).join("; ")}`}>
      <div className="grid gap-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 @min-[560px]:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="min-w-0 truncate text-11" style={{ paddingLeft: r.depth * 10 }}>
              {r.depth > 0 && <span className="mr-1 text-faint">↳</span>}
              <span className={r.block ? "text-hi" : "text-ink"}>{r.label}</span>
            </div>
            <div className="relative h-5">
              <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
              <span
                className="absolute top-1/2 h-[9px] -translate-y-1/2 rounded-[2px]"
                style={{ left: pct(r.a), width: `max(3px, ${((r.b - r.a) / max) * 100}%)`, background: r.block ? "var(--hi)" : "var(--mute)", opacity: r.block ? 0.85 : 0.55 }}
              />
              <span className="absolute top-1/2 -translate-y-1/2 text-[10px] text-faint tabular" style={r.b / max > 0.72 ? { right: `calc(${100 - (r.a / max) * 100}% + 6px)` } : { left: `calc(${pct(r.b)} + 6px)` }}>
                {r.a.toFixed(2)}..{r.b.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 @min-[560px]:grid-cols-[16rem_minmax(0,1fr)]">
        <span className="hidden @min-[560px]:block" />
        <div className="flex justify-between text-[10px] text-faint tabular">
          <span>0</span>
          <span>cost units →</span>
          <span>{max.toFixed(2)}</span>
        </div>
      </div>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
