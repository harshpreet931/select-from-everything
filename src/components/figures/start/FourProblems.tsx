"use client";

import { useState } from "react";
import { StepControls, useStepper } from "@/components/viz/stepper";
import { Narration, Provenance, Well, Words, tint, tv, type Ink } from "@/components/figures/kit";

// the four things a hand-rolled file gets wrong, next to what postgres does instead.
// the file side is a model, drawn by hand. the postgres side quotes real output: the error
// messages are postgres 18.6's own (content/start/what-is-a-database.golden.json has them), the
// shop rows are the shop dataset's, and the lost update is postgres's read committed behaviour
// (the captured two-session version lives in transactions/lost-updates).

type Line = { t: string; k?: Ink; dim?: boolean; strike?: boolean };
type Step = { file: Line[]; db: Line[]; note: string };
type Problem = { id: string; label: string; file: string; db: string; steps: Step[]; verdict: [string, string] };

const L = (t: string, k?: Ink, x: Partial<Line> = {}): Line => ({ t, k, ...x });

const PROBLEMS: Problem[] = [
  {
    id: "crash",
    label: "a crash",
    file: "customers.csv",
    db: "postgres",
    verdict: ["a torn row", "the update, exactly once"],
    steps: [
      {
        file: [L("id,name,city", "faint"), L("41,Mateus Kowalski,Chicago"), L("42,Ada Lovelace,London", "hot")],
        db: [L("UPDATE customers", "hot"), L("SET city = 'Cambridge'", "hot"), L("WHERE id = 42;", "hot")],
        note: "Ada moves to Cambridge. your code starts rewriting her line in place. postgres starts the same change.",
      },
      {
        file: [L("id,name,city", "faint"), L("41,Mateus Kowalski,Chicago"), L("42,Ada Lovelace,Camb", "hot"), L("~ power cut ~", "dead")],
        db: [
          L("log:  customers id 42 → city 'Cambridge'", "hot"),
          L("log:  COMMIT", "hot"),
          L("      flushed to disk. only now does COMMIT return", "live"),
          L("page: not written yet. it doesn't need to be", "mute"),
          L("~ power cut ~", "dead"),
        ],
        note: "the power goes out halfway through the line. postgres wrote a log record first and forced it to disk before it answered COMMIT.",
      },
      {
        file: [L("id,name,city", "faint"), L("41,Mateus Kowalski,Chicago"), L("42,Ada Lovelace,Camb", "dead")],
        db: [L("restart: replay the log onto the table"), L(" 42 | Ada Lovelace | Cambridge", "live")],
        note: "after the reboot the file holds half a row, and nothing says which half. postgres replays its log and Ada is in Cambridge. a crash before the COMMIT reached disk would lose the whole update, never half of it.",
      },
    ],
  },
  {
    id: "two",
    label: "two writers",
    file: "accounts.csv · apps A and B",
    db: "postgres · sessions T1 and T2",
    verdict: ["120.00, a +10 lost", "130.00, nothing lost"],
    steps: [
      {
        file: [L("alice,100.00")],
        db: [L(" 1 | alice | 100.00")],
        note: "alice has 100.00. one request adds 10, another adds 20, at the same moment. the right answer is 130.00.",
      },
      {
        file: [L("alice,100.00"), L("A reads 100.00", "hot"), L("B reads 100.00", "hot")],
        db: [L("T1: UPDATE accounts SET balance = balance + 10", "hot"), L("    WHERE id = 1;  locks the row, writes 110.00"), L("T2: UPDATE ... balance + 20 ...", "mute"), L("    waits for T1's row lock", "mute", { dim: true })],
        note: "both apps read 100.00 before either writes. in postgres the second UPDATE can't touch the row while the first one holds it, so it waits.",
      },
      {
        file: [L("A writes 110.00", "hot"), L("B writes 120.00", "hot")],
        db: [L("T1: COMMIT", "live"), L("T2: wakes, re-reads the row: 110.00", "hot"), L("    writes 110.00 + 20 = 130.00")],
        note: "A writes 100 + 10, then B writes 100 + 20 over it. in postgres, T1 commits, T2 wakes up, reads the new 110.00 and adds 20 to that.",
      },
      {
        file: [L("alice,120.00", "dead")],
        db: [L("T2: COMMIT", "live"), L(" 1 | alice | 130.00", "live")],
        note: "the file says 120.00: A's +10 vanished and nobody got an error. postgres says 130.00. (a read in the app, then a write of the computed number, would lose it in postgres too. that's the lost-update chapter.)",
      },
    ],
  },
  {
    id: "question",
    label: "a new question",
    file: "your code",
    db: "postgres",
    verdict: ["a new program per question", "one statement"],
    steps: [
      {
        file: [L("# which London customers order the most?", "faint"), L("for line in open('customers.csv'):"), L("    c = line.split(',')"), L("    if c[3] == 'London': ...")],
        db: [L("SELECT c.id, c.name, count(*) AS orders"), L("FROM customers AS c"), L("JOIN orders AS o ON o.customer_id = c.id"), L("WHERE c.city = 'London'"), L("GROUP BY c.id, c.name"), L("ORDER BY orders DESC, c.id"), L("LIMIT 3;")],
        note: "a question nobody planned for. with files, you write a program. with postgres, you write down the question.",
      },
      {
        file: [L("for each of the 159 London customers:"), L("    for line in open('orders.csv'):"), L("        # 10,000 lines, every time", "hot"), L("159 × 10,000 = 1,590,000 lines read", "dead")],
        db: [L("the plan postgres picked:", "faint"), L("put the 159 London customers"), L("in a hash table, then read"), L("orders once, looking each one up", "hot"), L("10,000 + 2,000 rows read", "live")],
        note: "your loop decides the how, and the obvious how is slow. postgres's planner picked a hash join (that's its real plan for this query), from what it knows about the tables. it picks again when they change.",
      },
      {
        file: [L("and next week, a new question:", "faint"), L("'which products do they buy?'"), L("→ a new program"), L("→ and a name like \"Okafor, Grace\"", "dead"), L("   breaks split(',')", "dead")],
        db: [L("  id | name           | orders"), L("  38 | Elena Yilmaz   |     17", "live"), L(" 169 | Elena Mueller  |     14", "live"), L("  22 | Fatima Mueller |     13", "live")],
        note: "the answer comes back as a table (the real one, from the shop data). the next question is another statement, not another program.",
      },
    ],
  },
  {
    id: "rules",
    label: "a bad row",
    file: "customers.csv",
    db: "postgres",
    verdict: ["junk, found months later", "refused, with a reason"],
    steps: [
      {
        file: [L("...", "faint"), L("42,Ada Lovelace,ada@example.com,London"), L("2001,,ada@example.com,London", "dead")],
        db: [L("ERROR 23502", "dead"), L("null value in column \"name\" of relation"), L("\"customers\" violates not-null constraint")],
        note: "a row with no name. the file takes it. postgres refuses: name was declared NOT NULL.",
      },
      {
        file: [L("...", "faint"), L("2001,,ada@example.com,London"), L("2002,Bob,bob@example.com,Atlantis,ZZZ", "dead")],
        db: [L("ERROR 22001", "dead"), L("value too long for type character(2)")],
        note: "a country code three letters long. the file takes it. postgres refuses: country is char(2).",
      },
      {
        file: [L("...", "faint"), L("2001,,ada@example.com,London", "dead"), L("2002,Bob,bob@example.com,Atlantis,ZZZ", "dead"), L("2003,Ada Again,ada@example.com,London", "dead")],
        db: [L("ERROR 23505", "dead"), L("duplicate key value violates unique"), L("constraint \"customers_email_key\""), L("DETAIL: Key (email)=(ada@example.com)", "mute"), L("already exists.", "mute")],
        note: "a second account with Ada's email. the file now holds three bad rows and nobody knows yet. postgres said no three times, and said why.",
      },
    ],
  },
];

function Panel({ title, lines, tone }: { title: string; lines: Line[]; tone?: Ink }) {
  return (
    <Well label={title} tone={tone}>
      <div className="min-h-[9.5rem] overflow-x-auto px-3 py-2.5">
        <ol className="min-w-max text-12 leading-[1.75]">
          {lines.map((l, i) => (
            <li
              key={`${i}-${l.t}`}
              className="obj-in whitespace-pre"
              style={{
                color: l.k ? tv(l.k) : "var(--ink)",
                opacity: l.dim ? 0.7 : 1,
                textDecoration: l.strike ? "line-through" : undefined,
                background: l.k === "dead" || l.k === "live" ? tint(l.k, 8) : undefined,
              }}
            >
              {l.t}
            </li>
          ))}
        </ol>
      </div>
    </Well>
  );
}

export function FourProblems() {
  const [pi, setPi] = useState(0);
  const p = PROBLEMS[pi];
  return <Inner key={p.id} p={p} pi={pi} setPi={setPi} />;
}

function Inner({ p, pi, setPi }: { p: Problem; pi: number; setPi: (n: number) => void }) {
  const s = useStepper(p.steps.length, { interval: 2600 });
  const st = p.steps[s.i];
  const last = s.atEnd;
  return (
    <div {...s.keys} className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 outline-none" aria-label="four things a file gets wrong, and what postgres does instead">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
        <span className="text-faint">problem =</span>
        <Words options={PROBLEMS.map((x, i) => ({ v: i, label: x.label }))} value={pi} onChange={setPi} label="pick a problem" />
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Panel title={`${p.file} · drawn by hand`} lines={st.file} tone={last ? "dead" : undefined} />
          <div className="text-11" style={{ color: last ? "var(--dead)" : "var(--faint)" }}>
            {last ? `→ ${p.verdict[0]}` : " "}
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Panel title={p.db} lines={st.db} tone={last ? "live" : undefined} />
          <div className="text-11" style={{ color: last ? "var(--live)" : "var(--faint)" }}>
            {last ? `→ ${p.verdict[1]}` : " "}
          </div>
        </div>
      </div>
      <Narration minLines={3}>{st.note}</Narration>
      <StepControls s={s} label="step" />
      <Provenance drawn="the file side is a model. the postgres side quotes real postgres 18.6 output" />
    </div>
  );
}
