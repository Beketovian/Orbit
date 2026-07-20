import { useEffect } from "react";
import { useUsageStore } from "@/store/usageStore";
import { listenToEvent } from "@/lib/tauri";

/**
 * Hydrates the store on mount, refreshes on the configured interval,
 * and reacts to refresh requests from the tray menu.
 */
export function useAutoRefresh(): void {
  const hydrate = useUsageStore((s) => s.hydrate);
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
}
