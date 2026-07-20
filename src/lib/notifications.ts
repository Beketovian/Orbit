/**
 * Native notifications via the Tauri notification plugin, with a
 * best-effort Web Notifications fallback for browser development.
 */

import { isTauri } from "./tauri";

export async function sendNotification(
  title: string,
  body: string,
): Promise<void> {
  try {
    if (isTauri()) {
      const plugin = await import("@tauri-apps/plugin-notification");
      let granted = await plugin.isPermissionGranted();
      if (!granted) {
        granted = (await plugin.requestPermission()) === "granted";
      }
      if (granted) plugin.sendNotification({ title, body });
      return;
    }
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      }
    }
  } catch {
    // Notifications are a nicety, never a failure mode.
  }
}
