"use client";

import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";

// which chapters you've finished. the list lives in your browser only; analytics just gets
// an anonymous "chapter_finished" the first time.

const KEY = "sfe-progress-v1";
type Store = Record<string, number>; // href -> finished at (ms)

let cache: Store | null = null;
const listeners = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Store) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function markDone(href: string, done = true) {
  const s = { ...read() };
  if (done && !s[href]) track("chapter_finished", { chapter: href });
  if (done) s[href] = Date.now();
  else delete s[href];
  write(s);
}

const EMPTY: Store = {};

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useProgress(): Store {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** the last chapter you were reading, for "continue where you left off" */
const LAST = "sfe-last-v1";
export function rememberLast(href: string) {
  try {
    localStorage.setItem(LAST, href);
  } catch {}
}
export function readLast(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
