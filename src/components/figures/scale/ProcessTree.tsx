import { Provenance, ring, tint } from "@/components/figures/kit";

// the processes of a running postgres 18.6, as pg_stat_activity listed them in
// traces/processes (step 0: backend_type and a count, step 1: the client backends by
// application_name). server side: only the counts and names come in.
//
//   <ProcessTree types={[["checkpointer", "1"], ...]} clients={["A", "B", "C", "pgtrace"]} trace={prov(trace)} />

const WHAT: Record<string, string> = {
  checkpointer: "writes dirty pages at checkpoints",
  "background writer": "trickles dirty pages out",
  walwriter: "flushes WAL",
  "io worker": "does reads for backends (io_method = worker)",
  "logical replication launcher": "starts subscription workers",
  "autovacuum launcher": "schedules vacuum",
};

export function ProcessTree({
  types,
  clients,
  observer,
  trace,
}: {
  /** [backend_type, count] rows */
  types: (string | null)[][];
  /** application_name of each client backend */
  clients: string[];
  /** the application_name that belongs to the capture tool itself */
  observer?: string;
  trace: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const helpers = types.filter((r) => r[0] !== "client backend");
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]" role="img" aria-label={`a postgres server: the postmaster, ${clients.length} client backends (one per connection) and ${helpers.length} kinds of helper process`}>
      <div className="mx-auto rounded-md px-3 py-2 text-center" style={{ boxShadow: ring("meta", 60), background: tint("meta", 8) }}>
        <div className="text-hi">postmaster</div>
        <div className="text-11 text-mute">listens on the port, forks a process for every connection</div>
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-md bg-well p-2.5" style={{ boxShadow: ring("line") }}>
          <div className="mb-2 text-11 text-faint">client backends: one process per connection, each with its own pid and memory</div>
          <div className="grid gap-1.5">
            {clients.map((c) => (
              <div key={c} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <span className="truncate text-right text-mute">{c === observer ? "the capture tool" : `client ${c}`}</span>
                <span aria-hidden className="text-ref">⟶</span>
                <span className="truncate rounded-xs px-1.5 leading-[22px]" style={{ boxShadow: ring(c === observer ? "line-2" : "hot", c === observer ? undefined : 60), background: c === observer ? undefined : tint("hot", 7) }}>
                  backend process
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-md bg-well p-2.5" style={{ boxShadow: ring("line") }}>
          <div className="mb-2 text-11 text-faint">the server's own processes</div>
          <div className="grid gap-1">
            {helpers.map(([t, n]) => (
              <div key={t} className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-2">
                <span className="text-hi">
                  {t}
                  {Number(n) > 1 ? <span className="text-faint"> ×{n}</span> : null}
                </span>
                <span className="text-11 text-mute">{WHAT[t ?? ""] ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Provenance trace={trace} />
    </div>
  );
}
