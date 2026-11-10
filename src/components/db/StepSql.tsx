import { Sql } from "@/components/figures/kit/SqlPanel";

/** the statement a trace step ran, one line: "T1  UPDATE accounts SET ..." */
export function StepSql({ label }: { label: string }) {
  const m = /^([\w-]+):\s*([\s\S]*)$/.exec(label);
  const who = m ? m[1] : "";
  const sql = (m ? m[2] : label).replace(/\s+/g, " ").trim();
  return (
    <div className="flex min-w-0 items-baseline gap-2 overflow-hidden rounded-md bg-well px-3 py-1.5 text-11 shadow-[inset_0_0_0_1px_var(--line)] @min-[520px]:text-12" aria-live="polite">
      {who && <span className="shrink-0 text-faint">{who}</span>}
      <Sql code={sql} className="truncate" />
    </div>
  );
}
