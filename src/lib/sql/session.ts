// the reader's edits to blocks in a session chain. when block 3 of session "orders" runs, the
// earlier blocks run first as its prelude, with whatever the reader typed into them.

const edits = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

/** the edited text of a block, or undefined when it's untouched */
export function sessionText(blockId: string): string | undefined {
  return edits.get(blockId);
}

export function setSessionText(blockId: string, text: string | null) {
  if (text === null) edits.delete(blockId);
  else edits.set(blockId, text);
  version++;
  for (const l of listeners) l();
}

/** for useSyncExternalStore: changes whenever any block's edit changes */
export function sessionVersion() {
  return version;
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
