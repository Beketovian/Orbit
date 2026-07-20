import { beforeEach, describe, expect, it } from "vitest";
import { recordHistory, useUsageStore } from "./usageStore";
import type { SnapshotMap } from "./usageStore";
import type { UsageHistory } from "@/types/usage";
import { dayKey } from "@/lib/time";
import { DEMO_PERCENTS } from "@/providers/demo";

function okSnapshot(pct: number, takenAt = Date.now()): SnapshotMap {
  return {
    claude: {
      status: "ok",
      snapshot: {
        providerId: "claude",
        percentRemaining: pct,
        reset: { kind: "unknown" },
        takenAt,
      },
    },
    codex: null,
    antigravity: null,
  };
}

const empty: UsageHistory = { claude: [], codex: [], antigravity: [] };

describe("recordHistory", () => {
  it("appends a new point for a new day", () => {
    const next = recordHistory(empty, okSnapshot(90));
    expect(next.claude).toHaveLength(1);
    expect(next.claude[0]).toEqual({
      day: dayKey(Date.now()),
      percentRemaining: 90,
    });
  });

  it("keeps the daily low-water mark", () => {
    let history = recordHistory(empty, okSnapshot(90));
    history = recordHistory(history, okSnapshot(70));
    history = recordHistory(history, okSnapshot(85));
    expect(history.claude).toHaveLength(1);
    expect(history.claude[0].percentRemaining).toBe(70);
  });

  it("caps retained history at 30 days", () => {
    let history = empty;
    for (let i = 40; i >= 0; i--) {
      history = recordHistory(history, okSnapshot(50, Date.now() - i * 86_400_000));
    }
    expect(history.claude.length).toBeLessThanOrEqual(30);
  });

  it("ignores unavailable results", () => {
    const snapshots: SnapshotMap = {
      claude: { status: "unavailable", providerId: "claude", reason: "no api" },
      codex: null,
      antigravity: null,
    };
    expect(recordHistory(empty, snapshots).claude).toHaveLength(0);
  });
});

describe("useUsageStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUsageStore.setState({
      hydrated: false,
      settings: {
        demoMode: true,
        refreshIntervalMinutes: 5,
        launchAtLogin: false,
        notificationsEnabled: true,
        lowUsageThreshold: 20,
      },
      snapshots: { claude: null, codex: null, antigravity: null },
      history: { claude: [], codex: [], antigravity: [] },
      lastUpdated: null,
      refreshing: false,
      notifiedLow: [],
    });
  });

  it("hydrates and produces demo snapshots and history", async () => {
    await useUsageStore.getState().hydrate();
    const state = useUsageStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.snapshots.claude?.status).toBe("ok");
    if (state.snapshots.codex?.status === "ok") {
      expect(state.snapshots.codex.snapshot.percentRemaining).toBe(
        DEMO_PERCENTS.codex,
      );
    }
    expect(state.history.antigravity.length).toBeGreaterThanOrEqual(29);
    expect(state.lastUpdated).not.toBeNull();
  });

  it("switching demo mode off yields honest unavailable snapshots", async () => {
    await useUsageStore.getState().hydrate();
    await useUsageStore.getState().setDemoMode(false);
    const state = useUsageStore.getState();
    expect(state.settings.demoMode).toBe(false);
    expect(state.snapshots.claude?.status).toBe("unavailable");
    expect(state.history.claude).toHaveLength(0);
  });

  it("persists settings across store lifecycles", async () => {
    await useUsageStore.getState().hydrate();
    useUsageStore.getState().setRefreshInterval(30);
    const raw = window.localStorage.getItem("orbit:settings");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).refreshIntervalMinutes).toBe(30);
  });
});
