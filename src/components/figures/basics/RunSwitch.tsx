// RunSwitch is the shared RunPick now (@/components/db/RunPick, global in mdx). this file keeps
// the old name and import path working: same props, same run shape (ghost, tones, hot, note).
export { RunPick as RunSwitch } from "@/components/db/RunPick";
export type { PickRun as Run } from "@/components/db/RunPick";
