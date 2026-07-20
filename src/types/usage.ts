/** Identifiers for the AI services Orbit tracks. */
export type ProviderId = "claude" | "codex" | "antigravity";

export const PROVIDER_IDS: readonly ProviderId[] = [
  "claude",
  "codex",
  "antigravity",
] as const;

/** How a reset time should be communicated to the user. */
export type ResetInfo =
  | { kind: "at"; timestamp: number }
  | { kind: "unknown" };

/** A single reading of remaining usage for one provider. */
export interface UsageSnapshot {
  providerId: ProviderId;
  /** Remaining usage, 0–100. */
  percentRemaining: number;
  reset: ResetInfo;
  /** Epoch millis when this snapshot was taken. */
  takenAt: number;
  /** True when computed against an estimated limit (see docs/LIVE_PROVIDERS.md). */
  estimated?: boolean;
}

/**
 * The result of asking a provider for usage. Providers that cannot be
 * queried report an honest `unavailable` state instead of inventing data.
 */
export type ProviderResult =
  | { status: "ok"; snapshot: UsageSnapshot }
  | { status: "unavailable"; providerId: ProviderId; reason: string };

/** One retained history point (a daily low-water mark of remaining usage). */
export interface HistoryPoint {
  /** Calendar day in local time, formatted YYYY-MM-DD. */
  day: string;
  /** Lowest remaining percentage observed that day. */
  percentRemaining: number;
}

export type UsageHistory = Record<ProviderId, HistoryPoint[]>;

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  /** Short description used in Settings → Provider status. */
  description: string;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Claude",
    description: "Claude Code usage limits",
  },
  codex: {
    id: "codex",
    name: "Codex",
    description: "OpenAI Codex usage limits",
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    description: "Google Antigravity usage limits",
  },
};
