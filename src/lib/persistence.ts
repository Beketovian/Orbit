/**
 * Local persistence with two backends:
 *
 *  - Tauri: `tauri-plugin-store`, written to the app data directory.
 *  - Browser (dev/tests): `localStorage`.
 *
 * Only JSON-serializable values pass through here. Nothing ever leaves
 * the machine.
 */

import { isTauri } from "./tauri";

const STORE_FILE = "orbit.json";
const LOCAL_PREFIX = "orbit:";

interface TauriStoreLike {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

let tauriStore: Promise<TauriStoreLike> | null = null;

function getTauriStore(): Promise<TauriStoreLike> {
  tauriStore ??= import("@tauri-apps/plugin-store").then((m) =>
    m.load(STORE_FILE, { autoSave: true }),
  );
  return tauriStore;
}

export async function loadValue<T>(key: string): Promise<T | null> {
  try {
    if (isTauri()) {
      const store = await getTauriStore();
      const value = await store.get<T>(key);
      return value ?? null;
    }
    const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function saveValue(key: string, value: unknown): Promise<void> {
  try {
    if (isTauri()) {
      const store = await getTauriStore();
      await store.set(key, value);
      return;
    }
    window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; the app keeps working from memory.
  }
}
