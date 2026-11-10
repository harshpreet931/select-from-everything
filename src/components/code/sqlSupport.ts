// what the browser engine can't run (the run button goes away and the block says why) and where
// its answer can differ from a real server (a note under the result). the rules live in
// src/lib/sql/shared/support.mjs so sql-check applies the same ones.
export { EXTENSIONS, sqlCantRun, sqlCaveat } from "@/lib/sql/shared/support.mjs";
