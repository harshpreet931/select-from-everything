import { Provenance, ring, tint } from "@/components/figures/kit";

// two different axes, drawn by hand: consistency models (one object, many copies, real time)
// and isolation levels (many objects, one transaction at a time). strict serializability is
// where the strongest of each meet. placement follows the usual textbook map (Herlihy & Wing,
// Lamport, Terry et al., Adya; summarized in Bailis et al. 2013 and jepsen.io).

const CONS = [
  ["linearizable", "one copy, real time: once a write finishes, everyone sees it"],
  ["sequential", "one order everyone agrees on, but it may lag real time"],
  ["causal", "causes before effects; unrelated writes in any order"],
  ["read your writes · monotonic reads", "per session: your own writes, and never backwards"],
  ["eventual", "copies agree once writes stop"],
];
const ISO = [
  ["serializable", "the same result as some one-at-a-time order"],
  ["snapshot isolation", "postgres's REPEATABLE READ"],
  ["read committed", "postgres's default"],
  ["read uncommitted", "the standard's floor; postgres runs it as read committed"],
];

export function ModelMap() {
  const col = (title: string, sub: string, rows: string[][]) => (
    <div className="min-w-0 rounded-md bg-well p-2.5" style={{ boxShadow: ring("line") }}>
      <div className="text-hi">{title}</div>
      <div className="mb-2 text-11 text-faint">{sub}</div>
      <ol className="grid gap-1">
        {rows.map(([k, v], i) => (
          <li key={k} className="grid grid-cols-[minmax(0,1fr)] rounded-xs px-2 py-1" style={{ background: "var(--well-2)", opacity: 1 - i * 0.12 }}>
            <span className="text-hi">{k}</span>
            <span className="text-11 text-mute">{v}</span>
          </li>
        ))}
      </ol>
      <div className="mt-1.5 text-right text-[10px] text-faint">↑ stronger</div>
    </div>
  );
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="mx-auto rounded-md px-3 py-2 text-center" style={{ boxShadow: ring("live", 60), background: tint("live", 8) }}>
        <div className="text-hi">strict serializable</div>
        <div className="text-11 text-mute">serializable transactions, in an order that respects real time</div>
      </div>
      <div className="grid gap-3 @min-[600px]:grid-cols-2">
        {col("consistency", "about copies of data and time: what can a read return?", CONS)}
        {col("isolation", "about concurrent transactions: what can they see of each other?", ISO)}
      </div>
      <Provenance drawn="the textbook map, simplified: each column is roughly a ladder, and the two are independent" />
    </div>
  );
}
