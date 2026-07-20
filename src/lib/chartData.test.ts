import { describe, expect, it } from "vitest";
import { buildChartData } from "./chartData";
import type { UsageHistory } from "@/types/usage";
import { dayKey } from "./time";

const NOW = new Date(2026, 4, 19, 13, 0).getTime();
const DAY = 86_400_000;

const history: UsageHistory = {
  claude: [
    { day: dayKey(NOW - 2 * DAY), percentRemaining: 80 },
    { day: dayKey(NOW), percentRemaining: 92 },
  ],
  codex: [],
  antigravity: [{ day: dayKey(NOW - 40 * DAY), percentRemaining: 10 }],
};

describe("buildChartData", () => {
  it("aligns every provider to a shared 7-day axis with gaps", () => {
    const { series, xLabels } = buildChartData(history, 7, NOW);
    expect(xLabels).toHaveLength(7);
    const claude = series.find((s) => s.id === "claude")!;
    expect(claude.values).toHaveLength(7);
    expect(claude.values[6]).toBe(92);
    expect(claude.values[4]).toBe(80);
    expect(claude.values[5]).toBeNull();
    // Data older than the window is excluded.
    const anti = series.find((s) => s.id === "antigravity")!;
    expect(anti.values.every((v) => v === null)).toBe(true);
  });

  it("labels each of 7 days and only weekly ticks for 30 days", () => {
    const week = buildChartData(history, 7, NOW);
    expect(week.xLabels.every((l) => l.length > 0)).toBe(true);
    const month = buildChartData(history, 30, NOW);
    expect(month.xLabels).toHaveLength(30);
    expect(month.xLabels[29]).not.toBe("");
    expect(month.xLabels.filter((l) => l !== "")).toHaveLength(5);
  });
});
