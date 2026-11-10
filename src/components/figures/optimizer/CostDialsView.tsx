"use client";

import { useState } from "react";
import { Legend, Narration, Provenance, Row, Words, fmt } from "@/components/figures/kit";

// three cost settings as option rows, and the three scans' estimated totals for one query under
// them. every total is captured (each scan forced in turn); the hot bar is the one the planner
// picked. bars share one scale across every combination, so a setting visibly moves them.

export type DialPoint = { scans: { scan: string; cost: number; chosen: boolean }[] };

const SHORT: Record<string, string> = { "Seq Scan": "seq scan", "Bitmap Heap Scan": "bitmap scan", "Index Scan": "index scan" };
const DEFAULTS = { rpc: 4, spc: 1, ctc: 0.01 };

export function CostDialsView({
  points,
  rpcs,
  spcs,
  ctcs,
  f,
  source,
}: {
  points: Record<string, DialPoint>;
  rpcs: number[];
  spcs: number[];
  ctcs: number[];
  /** the numbers the two printed formulas are made of (checked on the server) */
  f: { pages: number; tuples: number; opc: number; leaf: number; rows: number; k: number; b: number };
  source: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [rpc, setRpc] = useState(DEFAULTS.rpc);
  const [spc, setSpc] = useState(DEFAULTS.spc);
  const [ctc, setCtc] = useState(DEFAULTS.ctc);
  const p = points[`${rpc}|${spc}|${ctc}`];
  const top = Math.max(...Object.values(points).flatMap((x) => x.scans.map((s) => s.cost)));
  const pick = p.scans.find((s) => s.chosen)!;
  const runnerUp = p.scans.filter((s) => !s.chosen).sort((a, b) => a.cost - b.cost)[0];
  const atDefault = rpc === DEFAULTS.rpc && spc === DEFAULTS.spc && ctc === DEFAULTS.ctc;
  const opt = (vals: number[], d: number) => vals.map((v) => ({ v, label: v === d ? `${v}*` : String(v), title: v === d ? "the default" : undefined }));
  // the sums print the captured totals: the server checked each formula against them
  const c = (scan: string) => p.scans.find((s) => s.scan === scan)!.cost;
  const seqSum = c("Seq Scan");
  const ixSum = c("Index Scan");
  const bmSum = c("Bitmap Heap Scan");

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12" aria-label="three cost settings and the estimated cost of three ways to scan orders">
      <div className="rounded-md bg-well px-3 py-2 text-12 text-ink shadow-[inset_0_0_0_1px_var(--line)]">
        <span className="text-mute">SELECT</span> * <span className="text-mute">FROM</span> orders <span className="text-mute">WHERE</span> customer_id &lt;= 500;
      </div>
      <div>
        <Row k="random_page_cost =" w="19ch">
          <Words label="random_page_cost" options={opt(rpcs, DEFAULTS.rpc)} value={rpc} onChange={setRpc} />
        </Row>
        <Row k="seq_page_cost =" w="19ch">
          <Words label="seq_page_cost" options={opt(spcs, DEFAULTS.spc)} value={spc} onChange={setSpc} />
        </Row>
        <Row k="cpu_tuple_cost =" w="19ch" last>
          <Words label="cpu_tuple_cost" options={opt(ctcs, DEFAULTS.ctc)} value={ctc} onChange={setCtc} />
        </Row>
      </div>

      <div className="grid grid-cols-[11ch_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
        {p.scans.map((s) => (
          <div key={s.scan} className="contents">
            <span className="text-12" style={{ color: s.chosen ? "var(--hot)" : "var(--mute)" }}>
              {SHORT[s.scan]}
            </span>
            <span className="relative h-[14px] rounded-[2px] bg-well-2">
              <span
                className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-300 ease-sfe"
                style={{ width: `${Math.max(0.8, (s.cost / top) * 100)}%`, background: s.chosen ? "var(--hot)" : "var(--mute)", opacity: s.chosen ? 0.9 : 0.45 }}
              />
            </span>
            <span className="text-right text-12 tabular" style={{ color: s.chosen ? "var(--hi)" : "var(--mute)" }}>
              {s.cost.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          ["hot", "the scan the planner picked: the lowest total"],
          ["mute", "the others, each forced in turn"],
        ]}
      />

      <div className="grid gap-1.5 rounded-md bg-well px-3 py-2.5 text-11 leading-5 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="min-w-0 break-words">
          <span className="text-faint">seq scan = </span>
          {f.pages} × <span className="text-hi">{spc}</span> + {fmt(f.tuples)} × <span className="text-hi">{ctc}</span> + {fmt(f.tuples)} × {f.opc}
          <span className="text-faint"> = </span>
          <span className="text-hi tabular">{seqSum.toFixed(2)}</span>
        </div>
        <div className="min-w-0 break-words">
          <span className="text-faint">bitmap scan = </span>
          {f.leaf} × <span className="text-hi">{rpc}</span> + {f.pages} × <span className="text-hi">{spc}</span> + {fmt(f.rows)} × <span className="text-hi">{ctc}</span> + {fmt(f.b, 2)}
          <span className="text-faint"> = </span>
          <span className="text-hi tabular">{bmSum.toFixed(2)}</span>
        </div>
        <div className="min-w-0 break-words">
          <span className="text-faint">index scan = </span>({f.leaf} + {f.pages}) × <span className="text-hi">{rpc}</span> + {fmt(f.rows)} × <span className="text-hi">{ctc}</span> + {fmt(f.k, 2)}
          <span className="text-faint"> = </span>
          <span className="text-hi tabular">{ixSum.toFixed(2)}</span>
        </div>
      </div>

      <Narration minLines={2}>
        {SHORT[pick.scan]} wins at {pick.cost.toFixed(2)}, {(runnerUp.cost - pick.cost).toFixed(2)} under the {SHORT[runnerUp.scan]}.{" "}
        {atDefault
          ? "these are the defaults. change one setting and watch which total moves."
          : rpc < spc
            ? "a random page cheaper than a sequential one isn't physically sensible, but the planner does the arithmetic anyway."
            : "same query, same statistics, same table. only the prices changed."}
      </Narration>
      <Provenance trace={source} />
    </div>
  );
}
