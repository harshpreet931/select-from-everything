"use client";

import { StepControls, useStepper } from "@/components/viz/stepper";
import { Chip, Legend, Narration, Provenance, ring, tint, useReducedMotion } from "@/components/figures/kit";

// the same row updated twice, stored two ways: postgres keeps every version in the heap,
// InnoDB keeps one row in place and the older values in undo records behind a roll pointer.
// then an old reader looks, then cleanup. textbook material, drawn by hand: the transaction
// ids and balances are made up, the shapes follow the postgres and mysql 8.4 manuals.

type Ver = { by: number; ended?: number; balance: string; tone?: "live" | "dead" | "hot" | "mute" };
type Undo = { by: number; balance: string; tone?: "hot" | "dead" | "mute" };
type Frame = {
  label: string;
  pg: Ver[];
  inno: { row: Ver; undo: Undo[] };
  note: string;
};

const FRAMES: Frame[] = [
  {
    label: "trx 10 inserts alice",
    pg: [{ by: 10, balance: "100" }],
    inno: { row: { by: 10, balance: "100" }, undo: [] },
    note: "one row, one version, in both. (InnoDB wrote an insert undo record too, but that one is only for rollback and goes away at commit.)",
  },
  {
    label: "trx 20 sets 110",
    pg: [{ by: 10, ended: 20, balance: "100" }, { by: 20, balance: "110", tone: "hot" }],
    inno: { row: { by: 20, balance: "110", tone: "hot" }, undo: [{ by: 10, balance: "100", tone: "hot" }] },
    note: "postgres writes a whole new tuple and stamps the old one's xmax. InnoDB overwrites the row in place, sets its DB_TRX_ID to 20, and points DB_ROLL_PTR at an undo record holding what the row was before.",
  },
  {
    label: "trx 30 sets 120",
    pg: [{ by: 10, ended: 20, balance: "100" }, { by: 20, ended: 30, balance: "110" }, { by: 30, balance: "120", tone: "hot" }],
    inno: { row: { by: 30, balance: "120", tone: "hot" }, undo: [{ by: 20, balance: "110", tone: "hot" }, { by: 10, balance: "100" }] },
    note: "three versions in the postgres heap. in InnoDB still one row, and the undo chain is two records long.",
  },
  {
    label: "an old reader looks",
    pg: [{ by: 10, ended: 20, balance: "100", tone: "live" }, { by: 20, ended: 30, balance: "110", tone: "mute" }, { by: 30, balance: "120", tone: "mute" }],
    inno: { row: { by: 30, balance: "120", tone: "mute" }, undo: [{ by: 20, balance: "110", tone: "mute" }, { by: 10, balance: "100", tone: "hot" }] },
    note: "a reader whose snapshot is from before trx 20. postgres checks each version's xmin and xmax and reads the first one: 100. InnoDB reads the row, sees trx 30 is too new, follows the roll pointer and applies undo, sees trx 20 is too new, applies the next one, and builds 100 in its own copy.",
  },
  {
    label: "cleanup",
    pg: [{ by: 10, ended: 20, balance: "100", tone: "dead" }, { by: 20, ended: 30, balance: "110", tone: "dead" }, { by: 30, balance: "120" }],
    inno: { row: { by: 30, balance: "120" }, undo: [{ by: 20, balance: "110", tone: "dead" }, { by: 10, balance: "100", tone: "dead" }] },
    note: "once no snapshot needs the old values: VACUUM frees the two dead tuples in the table and their index entries. InnoDB's purge discards the undo records. the table itself never held them.",
  },
];

function PgCard({ v }: { v: Ver }) {
  const t = v.tone;
  return (
    <div
      className="min-w-[7.5rem] rounded-md bg-well px-2.5 py-1.5 text-11 transition-[box-shadow,background-color,opacity] duration-200 ease-sfe"
      style={{
        boxShadow: t === "hot" ? ring("hot", undefined, 1.5) : t === "dead" ? undefined : ring("line-2"),
        outline: t === "dead" ? "1px dashed var(--dead)" : undefined,
        outlineOffset: -1,
        background: t === "live" ? tint("live", 12) : undefined,
        opacity: t === "dead" || t === "mute" ? 0.55 : 1,
      }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <span className="text-meta">xmin</span>
        <span className="tabular">{v.by}</span>
        <span className="text-meta">xmax</span>
        <span className="tabular">{v.ended ?? 0}</span>
        <span className="text-faint">balance</span>
        <span className="text-hi tabular">{v.balance}</span>
      </div>
    </div>
  );
}

export function UndoChain() {
  const s = useStepper(FRAMES.length, { interval: 2600 });
  const reduce = useReducedMotion();
  const f = FRAMES[s.i];
  return (
    <div {...s.keys} className="@container grid min-w-0 gap-4 text-12 outline-none grid-cols-[minmax(0,1fr)]" aria-label="one row, two storage designs, step by step">
      <div className="text-12 text-hi" aria-live="polite">
        {f.label}
      </div>
      <div className="grid min-w-0 gap-4 grid-cols-[minmax(0,1fr)] @min-[680px]:grid-cols-2">
        <section className="min-w-0 rounded-md px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="postgres">
          <div className="mb-2 font-mono text-11 text-faint">postgres · every version in the heap page</div>
          <div className="flex flex-col items-start gap-1">
            {f.pg.map((v, i) => (
              <div key={i} className="flex flex-col items-start gap-1">
                <PgCard v={v} />
                {i < f.pg.length - 1 && (
                  <span className="pl-6 text-ref" aria-hidden>
                    ↓
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-faint">↓ t_ctid, old to new</div>
        </section>
        <section className="min-w-0 rounded-md px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="InnoDB">
          <div className="mb-2 font-mono text-11 text-faint">InnoDB · one row in the clustered index, old values in undo</div>
          <div className="flex flex-col items-start gap-1">
            <div
              className="min-w-[8rem] rounded-md bg-well px-2.5 py-1.5 text-11 transition-[box-shadow] duration-200 ease-sfe"
              style={{ boxShadow: f.inno.row.tone === "hot" ? ring("hot", undefined, 1.5) : ring("line-2"), opacity: f.inno.row.tone === "mute" ? 0.55 : 1 }}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
                <span className="text-meta">DB_TRX_ID</span>
                <span className="tabular">{f.inno.row.by}</span>
                <span className="text-ref">DB_ROLL_PTR</span>
                <span className="text-ref">{f.inno.undo.length ? "↓" : "·"}</span>
                <span className="text-faint">balance</span>
                <span className="text-hi tabular">{f.inno.row.balance}</span>
              </div>
            </div>
            {f.inno.undo.map((u, i) => (
              <div key={i} className="flex flex-col items-start gap-1">
                <span className="pl-6 text-ref" aria-hidden>
                  ↓
                </span>
                <div
                  className="rounded-md px-2 py-1 text-11 transition-[box-shadow,opacity] duration-200 ease-sfe"
                  style={{
                    boxShadow: u.tone === "hot" ? ring("hot", undefined, 1.5) : u.tone === "dead" ? undefined : ring("meta", 50),
                    outline: u.tone === "dead" ? "1px dashed var(--dead)" : undefined,
                    outlineOffset: -1,
                    opacity: u.tone === "dead" || u.tone === "mute" ? 0.55 : 1,
                    background: tint("meta", 6),
                  }}
                >
                  <div className="text-meta">undo</div>
                  <div className="tabular">
                    was {u.balance} <span className="text-faint">· trx {u.by}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip tone="meta">undo log, in the undo tablespace</Chip>
          </div>
        </section>
      </div>
      <Narration minLines={3}>{f.note}</Narration>
      <Legend
        items={[
          ["hot", "just written or just read"],
          ["live", "the version the old reader gets"],
          ["dead", "freed by cleanup", "dashed"],
          ["meta", "headers and undo records"],
          ["ref", "pointers", "line"],
        ]}
      />
      <StepControls s={s} compact={reduce} />
      <Provenance drawn="the shapes follow the postgres 18 and mysql 8.4 manuals; the ids and balances are made up" />
    </div>
  );
}
