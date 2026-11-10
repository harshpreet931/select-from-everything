"use client";

import { useState } from "react";
import { Chip, Legend, Narration, Provenance, ring, tint } from "@/components/figures/kit";

// a model of raft (Ongaro & Ousterhout, 2014), simplified for reading: no timers (you press
// "time out" for a node), and replication sends a follower the leader's whole log at once
// instead of backing off entry by entry. the rules kept: terms, one vote per term, votes only
// for candidates whose log is at least as up to date, a majority to win, and an entry is
// committed once a majority stores it and it's from the leader's current term.

type Role = "follower" | "candidate" | "leader";
type Entry = { term: number; cmd: string };
type Node = { id: number; up: boolean; term: number; role: Role; voted: number | null; log: Entry[]; commit: number };
const N = 5;
const MAJ = Math.floor(N / 2) + 1;
const CMDS = ["x=1", "y=2", "x=3", "z=4", "y=5", "x=6", "z=7", "y=8"];

const fresh = (): Node[] => Array.from({ length: N }, (_, id) => ({ id, up: true, term: 0, role: "follower", voted: null, log: [], commit: 0 }));
const last = (n: Node) => ({ term: n.log.at(-1)?.term ?? 0, len: n.log.length });
const upToDate = (c: Node, v: Node) => last(c).term > last(v).term || (last(c).term === last(v).term && last(c).len >= last(v).len);

export function RaftLab() {
  const [nodes, setNodes] = useState<Node[]>(fresh);
  const [split, setSplit] = useState(false);
  const [msg, setMsg] = useState("five servers, no leader yet. press time out on any of them to start an election.");
  const [writes, setWrites] = useState(0);
  const side = (id: number) => (split ? (id < 2 ? 0 : 1) : 0);
  const reach = (a: number, b: number) => side(a) === side(b);
  const top = (ns: Node[]) => ns.filter((n) => n.up && n.role === "leader").sort((a, b) => b.term - a.term)[0];
  const leader = top(nodes);

  const update = (f: (ns: Node[]) => string) => {
    const ns = nodes.map((n) => ({ ...n, log: [...n.log] }));
    setMsg(f(ns));
    setNodes(ns);
  };

  const timeout = (id: number) =>
    update((ns) => {
      const c = ns[id];
      if (!c.up) return `S${id + 1} is down.`;
      c.term += 1;
      c.role = "candidate";
      c.voted = id;
      const yes = [id];
      const no: number[] = [];
      for (const v of ns) {
        if (v.id === id || !v.up || !reach(id, v.id)) continue;
        if (v.term > c.term) {
          no.push(v.id);
          continue;
        }
        if (v.term < c.term) {
          v.term = c.term;
          v.voted = null;
          if (v.role !== "follower") v.role = "follower";
        }
        if ((v.voted === null || v.voted === id) && upToDate(c, v)) {
          v.voted = id;
          yes.push(v.id);
        } else no.push(v.id);
      }
      if (yes.length >= MAJ) {
        c.role = "leader";
        for (const v of ns) if (v.id !== id && v.role === "leader" && v.term < c.term && reach(id, v.id)) v.role = "follower";
        return `S${id + 1} starts term ${c.term} and gets votes from ${yes.map((y) => `S${y + 1}`).join(", ")}: ${yes.length} of ${N}, a majority. it's the leader for term ${c.term}.`;
      }
      return `S${id + 1} starts term ${c.term} but only gets ${yes.length} vote${yes.length === 1 ? "" : "s"} (${yes.map((y) => `S${y + 1}`).join(", ")})${no.length ? `; ${no.map((x) => `S${x + 1}`).join(", ")} said no (already voted this term, or its log is behind)` : ""}. no majority, so no leader: it stays a candidate until someone times out again.`;
    });

  const write = () =>
    update((ns) => {
      const l = top(ns);
      if (!l) return "no leader to send the write to. clients wait (or retry) until an election succeeds.";
      const cmd = CMDS[writes % CMDS.length];
      setWrites((w) => w + 1);
      l.log.push({ term: l.term, cmd });
      return `the client sends ${cmd} to the leader, S${l.id + 1}. it's appended to S${l.id + 1}'s log at index ${l.log.length}, uncommitted: no one else has it yet.`;
    });

  const replicate = () =>
    update((ns) => {
      const l = top(ns);
      if (!l) return "no leader, nothing to replicate.";
      const got: number[] = [l.id];
      for (const f of ns) {
        if (f.id === l.id || !f.up || !reach(l.id, f.id)) continue;
        if (f.term > l.term) {
          l.role = "follower";
          l.term = f.term;
          return `S${f.id + 1} answers with a newer term (${f.term}). S${l.id + 1} learns it's no longer the leader and steps down.`;
        }
        f.term = l.term;
        f.role = "follower";
        f.log = l.log.map((e) => ({ ...e }));
        got.push(f.id);
      }
      // commit: the highest index a majority stores, if it's from the current term
      let c = l.commit;
      for (let i = l.log.length; i > l.commit; i--) {
        const stored = got.length;
        if (stored >= MAJ && l.log[i - 1].term === l.term) {
          c = i;
          break;
        }
      }
      const was = l.commit;
      l.commit = c;
      for (const f of ns) if (got.includes(f.id)) f.commit = Math.min(c, f.log.length);
      return got.length >= MAJ
        ? c > was
          ? `S${l.id + 1} sends its log to ${got.length - 1} follower${got.length === 2 ? "" : "s"}. ${got.length} of ${N} servers now store it, a majority, so everything up to index ${c} is committed and can be applied.`
          : `S${l.id + 1} sends its log to ${got.length - 1} followers. nothing new to commit.`
        : `S${l.id + 1} reaches only ${got.length} of ${N} servers. without a majority nothing new commits: the writes sit in its log, uncommitted.`;
    });

  const toggle = (id: number) =>
    update((ns) => {
      const n = ns[id];
      n.up = !n.up;
      if (!n.up && n.role === "leader") return `the leader, S${id + 1}, crashes. followers stop hearing from it; press time out on one of them.`;
      if (n.up) {
        n.role = "follower";
        return `S${id + 1} comes back as a follower, with whatever log it had on disk.`;
      }
      return `S${id + 1} crashes.`;
    });

  const reset = () => {
    setNodes(fresh());
    setSplit(false);
    setWrites(0);
    setMsg("five servers, no leader yet. press time out on any of them to start an election.");
  };

  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="act solid" onClick={write}>client write</button>
        <button type="button" className="act" onClick={replicate}>replicate</button>
        <button type="button" className="word" aria-pressed={split} onClick={() => { setSplit(!split); setMsg(!split ? "the network splits: S1 and S2 on one side, S3, S4 and S5 on the other. only the side with three can elect or commit." : "the network heals."); }}>
          partition 2 | 3
        </button>
        <button type="button" className="act" onClick={reset}>reset</button>
      </div>
      <div className="grid grid-cols-2 gap-2 @min-[560px]:grid-cols-5">
        {nodes.map((n) => (
          <div
            key={n.id}
            className="min-w-0 rounded-md bg-well p-2 transition-[box-shadow,opacity] duration-200 ease-sfe"
            style={{
              boxShadow: n.role === "leader" && n.up ? ring("hot", undefined, 1.5) : ring("line"),
              opacity: n.up ? 1 : 0.45,
              marginLeft: split && n.id === 2 ? 0 : undefined,
              borderLeft: split && n.id === 2 ? "2px dashed var(--dead)" : undefined,
            }}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-hi">S{n.id + 1}</span>
              <span className="text-11" style={{ color: !n.up ? "var(--dead)" : n.role === "leader" ? "var(--hot)" : "var(--mute)" }}>{n.up ? n.role : "down"}</span>
            </div>
            <div className="text-[10.5px] text-faint">term {n.term}{n.voted !== null ? ` · voted S${n.voted + 1}` : ""}</div>
            <div className="mt-1.5 flex min-h-[22px] flex-wrap gap-[3px]" aria-label={`log of S${n.id + 1}`}>
              {n.log.length === 0 && <span className="text-[10.5px] text-faint">empty log</span>}
              {n.log.map((e, i) => (
                <span
                  key={i}
                  title={`index ${i + 1}, term ${e.term}${i < n.commit ? ", committed" : ", not committed"}`}
                  className="rounded-[3px] px-1 text-[10px] leading-4 tabular"
                  style={i < n.commit ? { boxShadow: ring("live", 60), background: tint("live", 10), color: "var(--live)" } : { outline: "1px dashed var(--mute)", outlineOffset: -1, color: "var(--mute)" }}
                >
                  {e.term}:{e.cmd}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              <button type="button" className="act !px-1.5 !text-[10.5px]" disabled={!n.up} onClick={() => timeout(n.id)}>time out</button>
              <button type="button" className="act !px-1.5 !text-[10.5px]" onClick={() => toggle(n.id)}>{n.up ? "crash" : "restart"}</button>
            </div>
          </div>
        ))}
      </div>
      <Narration minLines={3}>{msg}</Narration>
      <div className="flex flex-wrap gap-2">
        <Chip tone={leader ? "hot" : undefined}>{leader ? `leader: S${leader.id + 1}, term ${leader.term}` : "no leader"}</Chip>
        <Chip>majority: {MAJ} of {N}</Chip>
      </div>
      <Legend items={[["live", "committed entry"], ["mute", "in the log, not committed", "dashed"], ["hot", "the leader"]]} />
      <Provenance sim="model of raft, after Ongaro & Ousterhout (2014): no timers, whole-log replication. not a real cluster" />
    </div>
  );
}
