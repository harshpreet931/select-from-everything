import { Legend, Provenance } from "@/components/figures/kit";

// optimistic concurrency control in the textbook's three phases (Kung and Robinson, 1981), drawn
// by hand: each transaction reads into a private workspace, validates, then writes. T2's
// validation checks the write set of every transaction that committed during T2's read phase
// against T2's read set. an overlap means T2 may have read a stale value: abort and restart.

type Txn = { name: string; read: [number, number]; validate: number; write?: [number, number]; rs: string; ws: string; ok: boolean; note: string };

const RUNS: Txn[] = [
  { name: "T1", read: [0, 4], validate: 4, write: [4.4, 6], rs: "{A}", ws: "{A}", ok: true, note: "nothing committed meanwhile, valid" },
  { name: "T2", read: [1, 7], validate: 7, rs: "{A, B}", ws: "{B}", ok: false, note: "T1 wrote A while T2 read: abort" },
  { name: "T3", read: [6, 9], validate: 9, write: [9.4, 11], rs: "{C}", ws: "{C}", ok: true, note: "no overlap, valid" },
];

export function OccPhases() {
  const W = 560;
  const x0 = 40;
  const sx = (W - x0 - 20) / 11.2;
  const rowH = 54;
  const H = 30 + RUNS.length * rowH + 20;
  return (
    <div className="grid min-w-0 gap-3 grid-cols-[minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[600px]" style={{ fontFamily: "var(--font-code)" }} role="img" aria-label={RUNS.map((t) => `${t.name}: reads ${t.rs}, writes ${t.ws}, ${t.note}`).join(". ")}>
        {RUNS.map((t, i) => {
          const y = 24 + i * rowH;
          const vx = x0 + t.validate * sx;
          return (
            <g key={t.name}>
              <text x={x0 - 10} y={y + 15} textAnchor="end" fontSize={12} fill="var(--hi)">
                {t.name}
              </text>
              <rect x={x0 + t.read[0] * sx} y={y + 4} width={(t.read[1] - t.read[0]) * sx} height={16} rx={3} fill="var(--well-2)" stroke="var(--line-2)" />
              <text x={x0 + t.read[0] * sx + 6} y={y + 15.5} fontSize={9.5} fill="var(--mute)">
                read {t.rs}
              </text>
              <rect x={vx - 3} y={y} width={6} height={24} rx={2} fill={t.ok ? "var(--live)" : "var(--dead)"} />
              {t.write && (
                <>
                  <rect x={x0 + t.write[0] * sx} y={y + 4} width={(t.write[1] - t.write[0]) * sx} height={16} rx={3} fill="color-mix(in srgb, var(--live) 14%, transparent)" stroke="var(--live)" />
                  <text x={x0 + t.write[0] * sx + 4} y={y + 15.5} fontSize={9.5} fill="var(--live)">
                    write {t.ws}
                  </text>
                </>
              )}
              <text x={x0 + t.read[0] * sx} y={y + 38} fontSize={9.5} fill={t.ok ? "var(--live)" : "var(--dead)"}>
                validate: {t.note}
              </text>
            </g>
          );
        })}
        <line x1={x0} y1={H - 12} x2={W - 20} y2={H - 12} stroke="var(--line-2)" />
        <text x={W - 20} y={H - 2} textAnchor="end" fontSize={9.5} fill="var(--faint)">
          time →
        </text>
      </svg>
      <Legend
        items={[
          ["mute", "read phase: no locks, private writes", "solid"],
          ["live", "valid: the write phase installs the changes"],
          ["dead", "invalid: abort, throw the copy away, restart"],
        ]}
      />
      <Provenance drawn="the textbook model of optimistic concurrency control (Kung and Robinson, 1981)" />
    </div>
  );
}
