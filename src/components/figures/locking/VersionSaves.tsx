import { SessionLanes } from "@/components/db/SessionLanes";
import { Provenance } from "@/components/figures/kit";
import type { SessionStep } from "@/lib/db/views";

// server side: the app-level version column from this chapter's own golden (the runnable block
// "SELECT ... version; UPDATE ... WHERE version = 1" twice). the block runs in one session, so
// the two writers are the block's two UPDATEs put in two lanes; every tag, balance and version
// shown is the golden's. the row's state after each step is read from the SELECTs (the UPDATE 0
// changed nothing, so the final SELECT is also the state right after the first save).

type Stmt = { tag: string; rows?: (string | null)[][] };
type Block = { sql: string; statements: Stmt[] };

/** split the block's sql into statements, comments dropped, whitespace folded */
function statementsOf(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** a short form of an UPDATE that fits a lane: the new balance and the version check */
function shortUpdate(sql: string): string {
  const bal = /SET balance = ([\d.]+)/.exec(sql)?.[1] ?? "?";
  const check = /AND (version = \d+)/.exec(sql)?.[1] ?? "?";
  return `UPDATE … balance = ${bal} WHERE … ${check}`;
}

export function VersionSaves({ block }: { block: Block }) {
  const sql = statementsOf(block.sql);
  const st = block.statements;
  // statements: 0 CREATE, 1 INSERT, 2 SELECT (the read), 3 UPDATE (theirs), 4 UPDATE (ours), 5 SELECT
  const [readBal, readVer] = st[2].rows?.[0] ?? [];
  const [endBal, endVer] = st[5].rows?.[0] ?? [];
  const row = (balance: string | null | undefined, version: string | null | undefined) => ({ balance: balance ?? "", version: version ?? "" });
  const steps: SessionStep[] = [
    {
      ops: [null, { sql: "SELECT balance, version", out: `${readBal}, version ${readVer}` }],
      db: row(readBal, readVer),
      note: `we read the row and keep version ${readVer} in hand. no transaction stays open and no lock is held while the user thinks. the other app read the same version (its save checks it too).`,
    },
    {
      ops: [{ sql: shortUpdate(sql[3]), out: st[3].tag, tone: "live" }, null],
      db: row(endBal, endVer),
      note: `the other app saves first. its WHERE still matches, so it writes ${endBal} and bumps the version to ${endVer}: ${st[3].tag}.`,
    },
    {
      ops: [null, { sql: shortUpdate(sql[4]), out: `${st[4].tag}: retry`, tone: "dead" }],
      db: row(endBal, endVer),
      note: `our save checks version = ${readVer}, but the row says ${endVer} now. the WHERE matches nothing, nothing is overwritten: ${st[4].tag}. that is the failed validation.`,
    },
    {
      ops: [null, { sql: "SELECT balance, version", out: `${endBal}, version ${endVer}` }],
      db: row(endBal, endVer),
      note: `we re-read and get ${endBal} at version ${endVer}. the app retries from there, or shows the user the newer data.`,
    },
  ];
  return (
    <SessionLanes
      sessions={["someone else", "us"]}
      steps={steps}
      cells={["balance", "version"]}
      interval={2200}
      provenance={<Provenance trace={{ engine: { version: "18.6", build: "PGlite 0.5.12" }, scenario: "this page's version-column block, two saves in one session" }} />}
    />
  );
}
