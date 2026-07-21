import { create } from "zustand";
import type { ProviderId, ProviderResult, UsageHistory } from "@/types/usage";
import { PROVIDER_IDS, PROVIDER_META } from "@/types/usage";
import type { RefreshInterval, Settings } from "@/types/settings";
import { DEFAULT_SETTINGS, REFRESH_INTERVALS } from "@/types/settings";
import { getProviders } from "@/providers";
import { loadValue, saveValue } from "@/lib/persistence";
import { sendNotification } from "@/lib/notifications";
import { getAutostart, setAutostart } from "@/lib/autostart";
import { emitEvent, getWindowKind, isTauri } from "@/lib/tauri";
import { dayKey } from "@/lib/time";

const HISTORY_DAYS = 30;

/** Identifies this window's store so it can ignore its own broadcasts. */
export const STORE_INSTANCE_ID = Math.random().toString(36).slice(2);

export const STATE_CHANGED_EVENT = "orbit://state-changed";

export type SnapshotMap = Record<ProviderId, ProviderResult | null>;

interface UsageState {
  hydrated: boolean;
  settings: Settings;
  snapshots: SnapshotMap;
  history: UsageHistory;
  lastUpdated: number | null;
  refreshing: boolean;
  /** Providers already notified for the current low-usage episode. */
  notifiedLow: ProviderId[];

  hydrate(): Promise<void>;
  /** Re-read persisted state written by another Orbit window. */
  rehydrate(): Promise<void>;
  refresh(): Promise<void>;
  setRefreshInterval(minutes: RefreshInterval): void;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  setNotificationsEnabled(enabled: boolean): void;
  setUsageHintsEnabled(enabled: boolean): void;
}

const emptySnapshots = (): SnapshotMap => ({
  claude: null,
  codex: null,
  antigravity: null,
});

const emptyHistory = (): UsageHistory => ({
  claude: [],
  codex: [],
  antigravity: [],
});

function trimHistory(points: UsageHistory[ProviderId]): UsageHistory[ProviderId] {
  return points.slice(-HISTORY_DAYS);
}

interface LegacySettings extends Partial<Settings> {
  demoMode?: boolean;
}

/** Normalize persisted settings and intentionally discard retired fields. */
function normalizeSettings(settings: LegacySettings | null): Settings {
  const interval = settings?.refreshIntervalMinutes;
  return {
    refreshIntervalMinutes: REFRESH_INTERVALS.includes(
      interval as RefreshInterval,
    )
      ? (interval as RefreshInterval)
      : DEFAULT_SETTINGS.refreshIntervalMinutes,
    launchAtLogin:
      typeof settings?.launchAtLogin === "boolean"
        ? settings.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    notificationsEnabled:
      typeof settings?.notificationsEnabled === "boolean"
        ? settings.notificationsEnabled
        : DEFAULT_SETTINGS.notificationsEnabled,
    showUsageHints:
      typeof settings?.showUsageHints === "boolean"
        ? settings.showUsageHints
        : DEFAULT_SETTINGS.showUsageHints,
    lowUsageThreshold:
      typeof settings?.lowUsageThreshold === "number" &&
      Number.isFinite(settings.lowUsageThreshold)
        ? Math.max(0, Math.min(100, settings.lowUsageThreshold))
        : DEFAULT_SETTINGS.lowUsageThreshold,
  };
}

/** Fold fresh snapshots into per-day low-water-mark history. */
export function recordHistory(
  history: UsageHistory,
  snapshots: SnapshotMap,
): UsageHistory {
  const next = { ...history };
  for (const id of PROVIDER_IDS) {
    const result = snapshots[id];
    if (!result || result.status !== "ok") continue;
    const key = dayKey(result.snapshot.takenAt);
    const points = [...(next[id] ?? [])];
    const last = points[points.length - 1];
    if (last?.day === key) {
      points[points.length - 1] = {
        day: key,
        percentRemaining: Math.min(
          last.percentRemaining,
          result.snapshot.percentRemaining,
        ),
      };
    } else {
      points.push({ day: key, percentRemaining: result.snapshot.percentRemaining });
    }
    next[id] = trimHistory(points);
  }
  return next;
}

async function persist(state: Pick<UsageState, "settings" | "snapshots" | "history" | "lastUpdated">) {
  await Promise.all([
    saveValue("settings", state.settings),
    saveValue("snapshots", state.snapshots),
    saveValue("history", state.history),
    saveValue("lastUpdated", state.lastUpdated),
  ]);
  await emitEvent(STATE_CHANGED_EVENT, STORE_INSTANCE_ID);
}

async function persistSettings(settings: Settings) {
  await saveValue("settings", settings);
  await emitEvent(STATE_CHANGED_EVENT, STORE_INSTANCE_ID);
}

export const useUsageStore = create<UsageState>((set, get) => ({
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  snapshots: emptySnapshots(),
  history: emptyHistory(),
  lastUpdated: null,
  refreshing: false,
  notifiedLow: [],

  async hydrate() {
    if (get().hydrated) return;

    const [settings, snapshots, history, lastUpdated] = await Promise.all([
      loadValue<LegacySettings>("settings"),
      loadValue<SnapshotMap>("snapshots"),
      loadValue<UsageHistory>("history"),
      loadValue<number>("lastUpdated"),
    ]);

    const merged = normalizeSettings(settings);
    const discardDemoData = settings?.demoMode === true;
    // The OS is the source of truth for launch-at-login.
    merged.launchAtLogin = await getAutostart();

    set({
      hydrated: true,
      settings: merged,
      snapshots: discardDemoData
        ? emptySnapshots()
        : { ...emptySnapshots(), ...snapshots },
      history: discardDemoData
        ? emptyHistory()
        : { ...emptyHistory(), ...history },
      lastUpdated: discardDemoData ? null : (lastUpdated ?? null),
    });

    await get().refresh();
  },

  async rehydrate() {
    const [settings, snapshots, history, lastUpdated] = await Promise.all([
      loadValue<LegacySettings>("settings"),
      loadValue<SnapshotMap>("snapshots"),
      loadValue<UsageHistory>("history"),
      loadValue<number>("lastUpdated"),
    ]);
    const discardDemoData = settings?.demoMode === true;
    set({
      settings: normalizeSettings(settings),
      snapshots: discardDemoData
        ? emptySnapshots()
        : { ...emptySnapshots(), ...snapshots },
      history: discardDemoData
        ? emptyHistory()
        : { ...emptyHistory(), ...history },
      lastUpdated: discardDemoData ? null : (lastUpdated ?? null),
    });
  },

  async refresh() {
    if (get().refreshing) return;
    set({ refreshing: true });
    try {
      const { settings } = get();
      const providers = getProviders();
      const results = await Promise.all(providers.map((p) => p.fetchUsage()));

      const snapshots = emptySnapshots();
      for (const result of results) {
        const id = result.status === "ok" ? result.snapshot.providerId : result.providerId;
        snapshots[id] = result;
      }

      const history = recordHistory(get().history, snapshots);

      const lastUpdated = Date.now();
      set({ snapshots, history, lastUpdated });
      await persist({ settings, snapshots, history, lastUpdated });
      await maybeNotifyLowUsage(get, set);
    } finally {
      set({ refreshing: false });
    }
  },

  setRefreshInterval(minutes) {
    const settings = { ...get().settings, refreshIntervalMinutes: minutes };
    set({ settings });
    void persistSettings(settings);
  },

  async setLaunchAtLogin(enabled) {
    const actual = await setAutostart(enabled);
    const settings = { ...get().settings, launchAtLogin: actual };
    set({ settings });
    void persistSettings(settings);
  },

  setNotificationsEnabled(enabled) {
    const settings = { ...get().settings, notificationsEnabled: enabled };
    set({ settings, notifiedLow: enabled ? get().notifiedLow : [] });
    void persistSettings(settings);
  },

  setUsageHintsEnabled(enabled) {
    const settings = { ...get().settings, showUsageHints: enabled };
    set({ settings });
    void persistSettings(settings);
  },
}));

type Get = () => UsageState;
type Set = (partial: Partial<UsageState>) => void;

/**
 * Fire one native notification per provider each time it dips below the
 * threshold; re-arm once it recovers.
 */
async function maybeNotifyLowUsage(get: Get, set: Set): Promise<void> {
  const { settings, snapshots, notifiedLow } = get();
  if (!settings.notificationsEnabled) return;
  // In the desktop app both windows refresh; only the always-present
  // panel window notifies, so alerts never arrive twice.
  if (isTauri() && getWindowKind() !== "panel") return;

  const stillLow: ProviderId[] = [];
  for (const id of PROVIDER_IDS) {
    const result = snapshots[id];
    if (!result || result.status !== "ok") continue;
    const pct = result.snapshot.percentRemaining;
    if (pct < settings.lowUsageThreshold) {
      stillLow.push(id);
      if (!notifiedLow.includes(id)) {
        await sendNotification(
          `${PROVIDER_META[id].name} is running low`,
          `${pct}% of your ${PROVIDER_META[id].name} usage remains.`,
        );
      }
    }
  }
  set({ notifiedLow: stillLow });
}
