import type { ProviderId, UsageHistory } from "@/types/usage";
import { PROVIDER_IDS, PROVIDER_META } from "@/types/usage";
import type { ChartSeries } from "@/components/UsageChart";
import { PROVIDER_ACCENT } from "./colors";
import { dayKey, dayLabel } from "./time";

const DAY = 86_400_000;

export interface ChartData {
  series: ChartSeries[];
  xLabels: string[];
}

/**
 * Align history onto the last `days` calendar days so every provider
 * shares one x axis. Missing days become gaps rather than zeros.
 */
export function buildChartData(
  history: UsageHistory,
  days: 7 | 30,
  now: number = Date.now(),
): ChartData {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(now - i * DAY));
  }

  const series: ChartSeries[] = PROVIDER_IDS.map((id: ProviderId) => {
    const byDay = new Map(history[id]?.map((p) => [p.day, p.percentRemaining]));
    return {
      id,
      name: PROVIDER_META[id].name,
      color: PROVIDER_ACCENT[id],
      values: keys.map((k) => byDay.get(k) ?? null),
    };
  });

  const xLabels = keys.map((key, i) => {
    if (days === 7) return dayLabel(key, "weekday");
    // 30 days: label roughly weekly, always including the newest day.
    const fromEnd = keys.length - 1 - i;
    return fromEnd % 7 === 0 ? dayLabel(key, "date") : "";
  });

  return { series, xLabels };
}
