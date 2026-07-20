import { useEffect } from "react";
import {
  STATE_CHANGED_EVENT,
  STORE_INSTANCE_ID,
  useUsageStore,
} from "@/store/usageStore";
import { listenToEvent } from "@/lib/tauri";

/**
 * Hydrates the store on mount, refreshes on the configured interval,
 * reacts to refresh requests from the tray menu, and keeps this
 * window's state in sync with changes made in other Orbit windows.
 */
export function useAutoRefresh(): void {
  const hydrate = useUsageStore((s) => s.hydrate);
  const rehydrate = useUsageStore((s) => s.rehydrate);
  const refresh = useUsageStore((s) => s.refresh);
  const intervalMinutes = useUsageStore((s) => s.settings.refreshIntervalMinutes);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), intervalMinutes * 60_000);
    return () => window.clearInterval(id);
  }, [refresh, intervalMinutes]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenToEvent("orbit://refresh", () => void refresh()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenToEvent(STATE_CHANGED_EVENT, (payload) => {
      if (payload !== STORE_INSTANCE_ID) void rehydrate();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [rehydrate]);
}
