import type { Glyph as G } from "@/content/curriculum";

// one tiny drawing per part. stroke-only, 28px, they move a little on hover (see .glyph in globals.css).

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "square" as const };

const shapes: Record<G, React.ReactNode> = {
  // start: the database drum
  cylinder: (
    <>
      <ellipse {...s} cx={14} cy={7} rx={8} ry={2.6} />
      <path {...s} d="M6 7v14c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V7" />
      <path {...s} className="g-blink" d="M6 14c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6" />
    </>
  ),
  // one table: a grid with a doubled header rule
  grid: (
    <>
      <rect {...s} x={4} y={6} width={20} height={16} />
      <path {...s} d="M4 10.5h20M4 11.5h20M11 6v16M17.5 6v16M4 16.5h20" />
      <rect x={4.6} y={12.1} width={18.8} height={3.8} fill="currentColor" fillOpacity={0.15} className="g-blink" />
    </>
  ),
  // joins: matching dots laced across, one left dot alone
  laces: (
    <>
      {[8, 14, 20].map((y) => (
        <g key={y}>
          <circle cx={6} cy={y} r={1.6} fill="currentColor" />
          <circle cx={22} cy={y} r={1.6} fill="none" stroke="currentColor" strokeWidth={1} />
        </g>
      ))}
      <path {...s} className="g-dash" d="M7.6 8L20.4 14M7.6 14L20.4 8M7.6 14L20.4 20" />
    </>
  ),
  // windows: a row of cells under a sliding frame bracket
  frame: (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} {...s} x={3 + i * 3.8} y={15} width={2.8} height={2.8} />
      ))}
      <path {...s} className="g-flow" d="M6.4 12v-2.5h11.2V12" />
    </>
  ),
  // changing data: a table with a row sliding in and a caret
  caret: (
    <>
      <rect {...s} x={4} y={5} width={16} height={14} />
      <path {...s} d="M4 9.5h16M4 14h16" />
      <rect {...s} x={6} y={19.5} width={12} height={3.5} className="g-pop" />
      <path {...s} className="g-blink" d="M23 17v7" />
    </>
  ),
  // types: a number, a string, a document
  shapes: (
    <>
      <circle {...s} cx={7} cy={14} r={3.2} />
      <rect {...s} x={11} y={10.8} width={6.4} height={6.4} className="g-pop" />
      <path {...s} d="M21.5 10.6l3.6 6.6h-7.2z" />
    </>
  ),
  // schema design: two tables and a crow's foot
  schema: (
    <>
      <rect {...s} x={3} y={5} width={8} height={7} />
      <rect {...s} x={17} y={16} width={8} height={7} />
      <path {...s} className="g-dash" d="M7 12v7.5h7" />
      <path {...s} d="M14 19.5l3-2.5M14 19.5l3 2.5M14 19.5h3" />
    </>
  ),
  // indexes from the outside: thumb tabs on a book's edge
  tabs: (
    <>
      <path {...s} d="M5 4h13v20H5z" />
      <path {...s} d="M18 6h3v3h-3" />
      <path {...s} className="g-pop" d="M18 12h3v3h-3" />
      <path {...s} d="M18 18h3v3h-3" />
    </>
  ),
  // how a query runs: a plan tree with a row climbing an edge
  plan: (
    <>
      <rect {...s} x={10.5} y={4} width={7} height={4.5} />
      <rect {...s} x={3.5} y={19} width={7} height={4.5} />
      <rect {...s} x={17.5} y={19} width={7} height={4.5} />
      <path {...s} d="M14 8.5v4M7 19v-3.5h14V19M14 12.5v3" />
      <circle cx={7} cy={17.2} r={1.3} fill="currentColor" className="g-flow" />
    </>
  ),
  // the optimizer: a balance
  scales: (
    <>
      <path {...s} d="M14 7v16M10 23h8" />
      <g className="g-needle" style={{ transformOrigin: "14px 8px" }}>
        <path {...s} d="M5 8h18M5 8l-2.5 6h5zM23 8l-2.5 6h5z" />
      </g>
    </>
  ),
  // transactions: two lanes, one waiting
  lanes: (
    <>
      <path {...s} d="M9 4v20" />
      <path {...s} d="M19 4v6M19 18v6" />
      <path {...s} className="g-dash" d="M19 10v8" />
      <path {...s} d="M7 8h4M7 16h4M17 6h4M17 21h4" />
    </>
  ),
  // pages: slots at the top, tuples at the bottom
  page: (
    <>
      <rect {...s} x={6} y={3.5} width={16} height={21} />
      <path {...s} d="M8.5 7h2M12 7h2M15.5 7h2" />
      <rect {...s} x={8.5} y={18.5} width={11} height={3} />
      <rect {...s} x={12.5} y={14.5} width={7} height={3} className="g-pop" />
    </>
  ),
  // inside indexes: a root over three leaves, siblings linked
  tree: (
    <>
      <rect {...s} x={10} y={4} width={8} height={4.5} />
      <rect {...s} x={3} y={18} width={6} height={4.5} />
      <rect {...s} x={11} y={18} width={6} height={4.5} />
      <rect {...s} x={19} y={18} width={6} height={4.5} />
      <path {...s} d="M12 8.5L6 18M14 8.5V18M16 8.5L22 18" />
      <path {...s} className="g-dash" d="M9 20.3h2M17 20.3h2" />
    </>
  ),
  // MVCC: versions stacked, the old ones fading
  ghosts: (
    <>
      <rect {...s} x={4} y={4} width={13} height={10} strokeDasharray="2 2" className="g-fade" />
      <rect {...s} x={7.5} y={8.5} width={13} height={10} strokeDasharray="2 2" className="g-fade" />
      <rect {...s} x={11} y={13} width={13} height={10} />
    </>
  ),
  // locks
  padlock: (
    <>
      <rect {...s} x={7} y={13} width={14} height={11} />
      <path {...s} className="g-rise" d="M10 13V9a4 4 0 0 1 8 0v4" />
      <path {...s} d="M14 17v3" />
    </>
  ),
  // WAL: a tape of records, appending
  tape: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} {...s} x={2.5 + i * 4.6} y={10} width={3.6} height={7} />
      ))}
      <rect {...s} x={20.9} y={10} width={3.6} height={7} className="g-pop" />
      <path {...s} d="M18.4 19.5v3" />
    </>
  ),
  // scale: three drums, linked
  shards: (
    <>
      {[
        [14, 5],
        [6, 18],
        [22, 18],
      ].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <ellipse {...s} cx={x} cy={y} rx={3.4} ry={1.2} />
          <path {...s} d={`M${x - 3.4} ${y}v3.4c0 .7 1.5 1.2 3.4 1.2s3.4-.5 3.4-1.2V${y}`} />
        </g>
      ))}
      <path {...s} className="g-dash" d="M11.5 10l-3 6M16.5 10l3 6M10 20h8" />
    </>
  ),
  // deep dives
  magnifier: (
    <>
      <circle {...s} cx={12} cy={12} r={6} />
      <path {...s} d="M17 17l6 6" />
      <path {...s} className="g-blink" d="M10 12h4" />
    </>
  ),
};

export function Glyph({ name, className }: { name: G; className?: string }) {
  return (
    <svg viewBox="0 0 28 28" width={28} height={28} className={`glyph ${className ?? ""}`} aria-hidden>
      {shapes[name]}
    </svg>
  );
}
