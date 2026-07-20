import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, formatReset, formatUpdatedAgo } from "./time";

const HOUR = 3_600_000;
const MINUTE = 60_000;

// A fixed reference: Tuesday 2026-05-19 13:46 local time.
const NOW = new Date(2026, 4, 19, 13, 46).getTime();

describe("formatReset", () => {
  it("formats near-term resets as a countdown", () => {
    expect(
      formatReset({ kind: "at", timestamp: NOW + 2 * HOUR + 14 * MINUTE }, NOW),
    ).toBe("in 2h 14m");
  });

  it("omits minutes on exact hours", () => {
    expect(formatReset({ kind: "at", timestamp: NOW + 2 * HOUR }, NOW)).toBe(
      "in 2h",
    );
  });

  it("formats sub-hour countdowns in minutes", () => {
    expect(formatReset({ kind: "at", timestamp: NOW + 40 * MINUTE }, NOW)).toBe(
      "in 40m",
    );
  });

  it("formats later-today resets as a clock time", () => {
    const at = new Date(2026, 4, 19, 18, 0).getTime();
    expect(formatReset({ kind: "at", timestamp: at }, NOW)).toMatch(/^at 6:00/);
  });

  it("formats next-day resets as tomorrow", () => {
    const at = new Date(2026, 4, 20, 9, 0).getTime();
    expect(formatReset({ kind: "at", timestamp: at }, NOW)).toBe("tomorrow");
  });

  it("formats further resets with the weekday", () => {
    const at = new Date(2026, 4, 22, 9, 0).getTime();
    expect(formatReset({ kind: "at", timestamp: at }, NOW)).toBe("on Friday");
  });

  it("handles past and unknown resets honestly", () => {
    expect(formatReset({ kind: "at", timestamp: NOW - 1000 }, NOW)).toBe(
      "any moment",
    );
    expect(formatReset({ kind: "unknown" }, NOW)).toBe("unavailable");
  });
});

describe("formatUpdatedAgo", () => {
  it("says just now within a minute", () => {
    expect(formatUpdatedAgo(NOW - 20_000, NOW)).toBe("Updated just now");
  });

  it("uses minutes and hours", () => {
    expect(formatUpdatedAgo(NOW - 5 * MINUTE, NOW)).toBe("Updated 5m ago");
    expect(formatUpdatedAgo(NOW - 3 * HOUR, NOW)).toBe("Updated 3h ago");
  });

  it("handles the never-updated state", () => {
    expect(formatUpdatedAgo(null, NOW)).toBe("Not updated yet");
  });
});

describe("dayKey / dayLabel", () => {
  it("produces stable local-day keys", () => {
    expect(dayKey(NOW)).toBe("2026-05-19");
  });

  it("labels days by weekday or date", () => {
    expect(dayLabel("2026-05-19", "weekday")).toBe("Tue");
    expect(dayLabel("2026-05-19", "date")).toMatch(/May/);
  });
});
