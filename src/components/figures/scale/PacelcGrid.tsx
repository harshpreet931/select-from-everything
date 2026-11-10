import { Provenance, ring, tint } from "@/components/figures/kit";

// PACELC as a decision tree, drawn by hand: if there is a Partition, Availability or Consistency;
// Else, Latency or Consistency. the examples under each leaf are postgres setups, placed by what
// they do, plus the classes of systems Abadi's paper uses as examples.

type Leaf = { k: string; what: string; eg: string[] };

export function PacelcGrid({ partition, normal }: { partition: [Leaf, Leaf]; normal: [Leaf, Leaf] }) {
  const col = (title: string, sub: string, leaves: [Leaf, Leaf]) => (
    <div className="min-w-0 rounded-md bg-well p-2.5" style={{ boxShadow: ring("line") }}>
      <div className="text-hi">{title}</div>
      <div className="mb-2 text-11 text-faint">{sub}</div>
      <div className="grid gap-2 @min-[520px]:grid-cols-2">
        {leaves.map((l) => (
          <div key={l.k} className="min-w-0 rounded-md px-2 py-1.5" style={{ boxShadow: ring("meta", 45), background: tint("meta", 6) }}>
            <div className="text-meta">{l.k}</div>
            <div className="text-11 text-mute">{l.what}</div>
            <ul className="mt-1 grid gap-0.5 text-11">
              {l.eg.map((e) => (
                <li key={e} className="text-ink">· {e}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="grid gap-3 @min-[700px]:grid-cols-2">
        {col("P: during a partition", "pick availability or consistency (CAP)", partition)}
        {col("E: else, on a normal day", "pick latency or consistency", normal)}
      </div>
      <Provenance drawn="after Abadi, 2012" />
    </div>
  );
}
