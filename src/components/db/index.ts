// the database primitives, available in every .mdx file without an import (spread next to
// viz in src/mdx-components.tsx; scripts/check.mjs reads the keys of `db` below).
// bespoke figures import from "@/components/db/<File>", never from this index.

import { ResultTable } from "./ResultTable";
import { Sql, SqlPanel } from "./SqlPanel";
import { ClauseStepper } from "./ClauseStepper";
import { SessionLanes } from "./SessionLanes";
import { PageView } from "./PageView";
import { VersionChain } from "./VersionChain";
import { BTree } from "./BTree";
import { PlanTree } from "./PlanTree";
import { JoinLab } from "./JoinLab";
import { BufferPool } from "./BufferPool";
import { WalStrip } from "./WalStrip";
import { PgStepper } from "./PgStepper";
import { HeapFile } from "./HeapFile";
import { SnapshotLine } from "./SnapshotLine";
import { WaitForGraph } from "./WaitForGraph";
import { LockTable } from "./LockTable";
import { HashIndex } from "./HashIndex";
import { RunPick } from "./RunPick";
import { Provenance } from "@/components/figures/kit/Provenance";

export const db = {
  ResultTable,
  SqlPanel,
  Sql,
  ClauseStepper,
  SessionLanes,
  PageView,
  VersionChain,
  BTree,
  PlanTree,
  JoinLab,
  BufferPool,
  WalStrip,
  PgStepper,
  HeapFile,
  SnapshotLine,
  WaitForGraph,
  LockTable,
  HashIndex,
  RunPick,
  // the one-line source under a figure: global so chapters stop importing it
  Provenance,
};

export {
  ResultTable,
  SqlPanel,
  Sql,
  ClauseStepper,
  SessionLanes,
  PageView,
  VersionChain,
  BTree,
  PlanTree,
  JoinLab,
  BufferPool,
  WalStrip,
  PgStepper,
  HeapFile,
  SnapshotLine,
  WaitForGraph,
  LockTable,
  HashIndex,
  RunPick,
};
