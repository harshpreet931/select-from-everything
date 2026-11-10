import { Provenance } from "@/components/figures/kit/Provenance";
import { ring, tint } from "@/components/figures/kit/tone";

// a real hash index from pgtrace's hash probe, one panel per captured step: the metapage
// (meta) and every bucket as a column, its primary page filled to scale (items / page
// capacity) and its overflow pages chained underneath, dashed. the hash index stores only
// the 32-bit hash of each key, so items are counted, not listed; a few hashes show on hover.
// server only: the trace stays on the server, the page gets plain markup.
//
//   <HashPages trace={trace} index="h_id" steps={[1, 2, 3]} />

type HashProbe = {
  meta: Record<string, number>;
  pages: { blk: number; type: string; bucket?: number; next?: number; items: { hash: number }[] }[];
};
type Trace = {
  steps: { note?: string; hash?: Record<string, HashProbe> }[];
  engine?: { version?: string; build?: string };
  scenario?: string;
};

const bin = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0").slice(-w);
const hex = (h: number) => `0x${(h >>> 0).toString(16).padStart(8, "0")}`;

function Panel({ probe, note, cap, hot }: { probe: HashProbe; note?: string; cap: number; hot?: number[] }) {
  const m = probe.meta;
  const w = Math.max(2, m.highmask.toString(2).length);
  const byBlk = new Map(probe.pages.map((p) => [p.blk, p]));
  const buckets = probe.pages.filter((p) => p.type === "bucket").sort((a, b) => (a.bucket ?? 0) - (b.bucket ?? 0));
  const chain = (p: HashProbe["pages"][number]) => {
    const out = [p];
    let n = p.next;
    while (n && byBlk.get(n)) {
      out.push(byBlk.get(n)!);
      n = byBlk.get(n)!.next;
    }
    return out;
  };
  const unused = probe.pages.filter((p) => p.type === "unused").length;
  return (
    <div className="grid min-w-0 gap-2.5">
      {note ? <div className="font-serif text-[1.02rem] leading-[1.55] text-ink">{note}</div> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md px-3 py-2 text-11 tabular" style={{ boxShadow: ring("meta", 60), background: tint("meta", 6) }}>
        <span className="text-meta">metapage</span>
        {(["ntuples", "ffactor", "maxbucket", "highmask", "lowmask"] as const).map((k) => (
          <span key={k}>
            <span className="text-faint">{k}</span> <span className="text-hi">{k.endsWith("mask") ? bin(m[k], w) : m[k].toLocaleString("en-US")}</span>
          </span>
        ))}
      </div>
      <div className="min-w-0 overflow-x-auto pb-1">
        <div className="flex min-w-max items-start gap-1.5" role="img" aria-label={`${buckets.length} buckets: ${buckets.map((b) => `bucket ${b.bucket} with ${chain(b).reduce((s, p) => s + p.items.length, 0)} tuples on ${chain(b).length} page${chain(b).length > 1 ? "s" : ""}`).join(", ")}`}>
          {buckets.map((b) => {
            const pages = chain(b);
            const on = hot?.includes(b.bucket ?? -1);
            return (
              <div key={b.blk} className="flex w-[3.4rem] flex-col gap-1">
                <div className="text-center text-[10px] leading-3 tabular" style={{ color: on ? "var(--hot)" : "var(--faint)" }}>
                  {b.bucket}
                  <div className="text-[9px] text-faint">{bin(b.bucket ?? 0, w)}</div>
                </div>
                {pages.map((p, i) => {
                  const fill = Math.min(1, p.items.length / cap);
                  return (
                    <div
                      key={p.blk}
                      className="relative h-12 overflow-hidden rounded-[3px]"
                      title={`${i ? "overflow" : "bucket"} page ${p.blk}: ${p.items.length} tuples${p.items.length ? `, e.g. ${p.items.slice(0, 3).map((x) => hex(x.hash)).join(", ")}` : ""}`}
                      style={{
                        boxShadow: i === 0 ? (on ? ring("hot", undefined, 1.5) : ring("line-2")) : undefined,
                        outline: i > 0 ? "1px dashed var(--mute)" : undefined,
                        outlineOffset: -1,
                        background: "var(--bg)",
                      }}
                    >
                      <span className="absolute inset-x-0 bottom-0" style={{ height: `${fill * 100}%`, background: on ? tint("hot", 22) : "color-mix(in srgb, var(--mute) 22%, transparent)" }} />
                      <span className="absolute inset-x-0 top-1 text-center text-11 text-hi tabular">{p.items.length}</span>
                      {i > 0 && <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] text-mute italic">overflow</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {unused ? <div className="text-[10px] text-faint">and {unused} {unused === 1 ? "page" : "pages"} allocated ahead for the next buckets, still empty</div> : null}
    </div>
  );
}

export function HashPages({ trace, index, steps, hot = {} }: { trace: Trace; index: string; steps: number[]; hot?: Record<number, number[]> }) {
  // tuples per page: 8,152 usable bytes / (a 16-byte hash tuple + a 4-byte line pointer)
  const cap = Math.floor((trace.steps[steps[0]].hash?.[index]?.meta.bsize ?? 8152) / 20);
  return (
    <div className="grid min-w-0 gap-6 text-12">
      {steps.map((i) => {
        const probe = trace.steps[i].hash?.[index];
        return probe ? <Panel key={i} probe={probe} note={trace.steps[i].note} cap={cap} hot={hot[i]} /> : null;
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-mute">
        <span><span className="text-meta">■</span> metapage</span>
        <span>▮ tuples on the page, to scale ({cap} fit)</span>
        <span>┆ overflow page, dashed</span>
        <span><span className="text-hot">■</span> the buckets that just changed</span>
      </div>
      <Provenance trace={trace} />
    </div>
  );
}
