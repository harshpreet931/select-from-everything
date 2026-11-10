import type { PgTrace } from "@/lib/db/pgtrace";
import { Tree } from "@/components/viz/Tree";
import { Provenance, fmt } from "@/components/figures/kit";
import { prov, records } from "./source";

// the files of one table and everything that hangs off it, as pg_ls_dir and pg_stat_file saw
// them (traces/lab-files, step 2). server side: builds the Tree text from the capture.

const WHAT: Record<string, string> = { r: "the table", t: "its toast table", i: "an index" };

export function FileTree({ trace, dir }: { trace: PgTrace; dir: string }) {
  const rs = records(trace.steps[1]);
  const lines = rs.map((r) => {
    const fork = /_(fsm|vm|init)$/.exec(r.file ?? "")?.[1];
    const n = Number(r.bytes);
    const what = fork === "fsm" ? `${r.relname}'s free space map` : fork === "vm" ? `${r.relname}'s visibility map` : `${r.relname}, ${WHAT[r.relkind ?? ""] ?? r.relkind}`;
    const pages = n ? `${fmt(n / 8192)} page${n === 8192 ? "" : "s"}` : "empty";
    return `    ${r.file}  ${fmt(n)} B // ${what}: ${pages}`;
  });
  const text = `\n${dir}/ // the database's directory\n${lines.join("\n")}\n`;
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <Tree>{text}</Tree>
      <Provenance trace={prov(trace)} />
    </div>
  );
}
