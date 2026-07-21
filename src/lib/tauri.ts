/**
 * Thin bridge over the Tauri runtime. Every capability degrades
 * gracefully when the app runs in a plain browser (dev server, tests).
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type WindowKind = "panel" | "main";

/**
 * Which Orbit window this frontend instance is rendering. In the browser
 * the `?window=panel` query param simulates the tray panel.
 */
export function getWindowKind(): WindowKind {
  if (isTauri()) {
    const label = (
      window as unknown as {
        __TAURI_INTERNALS__: { metadata?: { currentWindow?: { label?: string } } };
      }
    ).__TAURI_INTERNALS__.metadata?.currentWindow?.label;
    return label === "panel" ? "panel" : "main";
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("window") === "panel" ? "panel" : "main";
}

/** Ask the backend to show + focus the main window, optionally at a section. */
export async function openMainWindow(section?: string): Promise<void> {
  if (!isTauri()) {
    // In the browser, the "main window" is just the same page without the
    // panel query param.
    const url = new URL(window.location.href);
    url.searchParams.delete("window");
    if (section) url.hash = section;
    window.location.href = url.toString();
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_main_window", { section: section ?? null });
}

/** Hide the floating panel (used after actions that move focus away). */
export async function hidePanel(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("hide_panel");
}

/** Match the native tray panel height to whether guidance is visible. */
export async function setPanelCompact(compact: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_panel_compact", { compact });
}

/** Broadcast an app-level event to every window (no-op in the browser). */
export async function emitEvent(event: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit(event, payload);
}

/** Subscribe to an app-level event emitted by the Rust side. */
export async function listenToEvent(
  event: string,
  handler: (payload: unknown) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen(event, (e) => handler(e.payload));
  return unlisten;
}
