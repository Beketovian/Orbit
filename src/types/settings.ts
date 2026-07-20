/** Refresh cadence options, in minutes. */
export type RefreshInterval = 1 | 5 | 15 | 30 | 60;

export const REFRESH_INTERVALS: readonly RefreshInterval[] = [1, 5, 15, 30, 60];

export interface Settings {
  demoMode: boolean;
  refreshIntervalMinutes: RefreshInterval;
  launchAtLogin: boolean;
  notificationsEnabled: boolean;
  /** Notify when remaining usage drops below this percentage. */
  lowUsageThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  demoMode: true,
  refreshIntervalMinutes: 5,
  launchAtLogin: false,
  notificationsEnabled: true,
  lowUsageThreshold: 20,
};
