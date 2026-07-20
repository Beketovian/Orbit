import type {
  HistoryPoint,
  ProviderId,
  ProviderResult,
  ResetInfo,
} from "@/types/usage";
import { dayKey } from "@/lib/time";
import type { UsageProvider } from "./types";

/** The canonical demo values shown across the product. */
export const DEMO_PERCENTS: Record<ProviderId, number> = {
  claude: 92,
  codex: 93,
  antigravity: 94,
};

const HOUR = 3_600_000;

/**
 * Demo reset schedule, mirroring how the three services communicate
 * limits: Claude a rolling window, Codex a fixed afternoon reset,
 * Antigravity a daily reset the next morning.
 */
export function demoResetInfo(id: ProviderId, now: number): ResetInfo {
  switch (id) {
    case "claude":
      // Rolling window: resets 2h 14m from now.
      return { kind: "at", timestamp: now + 2 * HOUR + 14 * 60_000 };
    case "codex": {
      // Fixed reset at 4:00 PM local time (tomorrow if already past).
      const at = new Date(now);
      at.setHours(16, 0, 0, 0);
      if (at.getTime() <= now) at.setDate(at.getDate() + 1);
      return { kind: "at", timestamp: at.getTime() };
    }
    case "antigravity": {
      // Daily reset tomorrow at 9:00 AM local time.
      const at = new Date(now);
      at.setDate(at.getDate() + 1);
      at.setHours(9, 0, 0, 0);
      return { kind: "at", timestamp: at.getTime() };
    }
  }
}

/** Deterministic pseudo-random in [0, 1) so demo data is stable. */
function hashNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Plausible, deterministic usage history for demo mode: most days hover
 * in the healthy 55–95% range with an occasional heavier day.
 */
export function generateDemoHistory(
  id: ProviderId,
  days: number,
  now: number = Date.now(),
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (let i = days - 1; i >= 1; i--) {
    const key = dayKey(now - i * 24 * HOUR);
    const noise = hashNoise(`${id}:${key}`);
    const heavy = hashNoise(`${id}:heavy:${key}`) > 0.85;
    const base = heavy ? 18 + noise * 25 : 55 + noise * 40;
    points.push({ day: key, percentRemaining: Math.round(base) });
  }
  // Today always reflects the canonical demo value.
  points.push({ day: dayKey(now), percentRemaining: DEMO_PERCENTS[id] });
  return points;
}

export class DemoProvider implements UsageProvider {
  constructor(readonly id: ProviderId) {}

  async fetchUsage(): Promise<ProviderResult> {
    const now = Date.now();
    return {
      status: "ok",
      snapshot: {
        providerId: this.id,
        percentRemaining: DEMO_PERCENTS[this.id],
        reset: demoResetInfo(this.id, now),
        takenAt: now,
      },
    };
  }
}
