/**
 * Launch-at-login via the Tauri autostart plugin. Reported as
 * unsupported when running outside Tauri so the UI can say so honestly.
 */

import { isTauri } from "./tauri";

export function isAutostartSupported(): boolean {
  return isTauri();
}

export async function setAutostart(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const plugin = await import("@tauri-apps/plugin-autostart");
    if (enabled) {
      await plugin.enable();
    } else {
      await plugin.disable();
    }
    return await plugin.isEnabled();
  } catch {
    return false;
  }
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const plugin = await import("@tauri-apps/plugin-autostart");
    return await plugin.isEnabled();
  } catch {
    return false;
  }
}
