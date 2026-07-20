import { describe, expect, it } from "vitest";
import {
  DEMO_PERCENTS,
  DemoProvider,
  demoResetInfo,
  generateDemoHistory,
} from "./demo";
import { ClaudeProvider } from "./claude";
import { CodexProvider } from "./codex";
import { AntigravityProvider } from "./antigravity";
import { getProviders } from "./index";
import { PROVIDER_IDS } from "@/types/usage";

describe("DemoProvider", () => {
  it("reports the canonical demo values", async () => {
    for (const id of PROVIDER_IDS) {
      const result = await new DemoProvider(id).fetchUsage();
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.snapshot.percentRemaining).toBe(DEMO_PERCENTS[id]);
        expect(result.snapshot.providerId).toBe(id);
      }
    }
  });

  it("gives Claude a rolling ~2h14m reset", () => {
    const now = Date.now();
    const reset = demoResetInfo("claude", now);
    expect(reset.kind).toBe("at");
    if (reset.kind === "at") {
      expect(reset.timestamp - now).toBe(2 * 3_600_000 + 14 * 60_000);
    }
  });

  it("gives Codex a 4 PM reset that rolls to tomorrow when past", () => {
    const morning = new Date(2026, 4, 19, 9, 0).getTime();
    const evening = new Date(2026, 4, 19, 20, 0).getTime();
    const early = demoResetInfo("codex", morning);
    const late = demoResetInfo("codex", evening);
    if (early.kind === "at" && late.kind === "at") {
      expect(new Date(early.timestamp).getHours()).toBe(16);
      expect(new Date(early.timestamp).getDate()).toBe(19);
      expect(new Date(late.timestamp).getDate()).toBe(20);
    }
  });

  it("gives Antigravity a reset tomorrow morning", () => {
    const now = new Date(2026, 4, 19, 13, 0).getTime();
    const reset = demoResetInfo("antigravity", now);
    if (reset.kind === "at") {
      const at = new Date(reset.timestamp);
      expect(at.getDate()).toBe(20);
      expect(at.getHours()).toBe(9);
    }
  });
});

describe("generateDemoHistory", () => {
  it("is deterministic and spans the requested days", () => {
    const now = new Date(2026, 4, 19, 13, 0).getTime();
    const a = generateDemoHistory("claude", 30, now);
    const b = generateDemoHistory("claude", 30, now);
    expect(a).toEqual(b);
    expect(a).toHaveLength(30);
  });

  it("ends on today with the canonical value", () => {
    const now = new Date(2026, 4, 19, 13, 0).getTime();
    const history = generateDemoHistory("codex", 7, now);
    expect(history[6].day).toBe("2026-05-19");
    expect(history[6].percentRemaining).toBe(DEMO_PERCENTS.codex);
  });

  it("stays within 0–100", () => {
    const history = generateDemoHistory("antigravity", 30);
    for (const point of history) {
      expect(point.percentRemaining).toBeGreaterThanOrEqual(0);
      expect(point.percentRemaining).toBeLessThanOrEqual(100);
    }
  });
});

describe("live providers", () => {
  it("report an honest unavailable state instead of inventing data", async () => {
    for (const provider of [
      new ClaudeProvider(),
      new CodexProvider(),
      new AntigravityProvider(),
    ]) {
      const result = await provider.fetchUsage();
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getProviders", () => {
  it("selects the provider set by mode, covering every provider", async () => {
    const demo = getProviders(true);
    const live = getProviders(false);
    expect(demo.map((p) => p.id)).toEqual([...PROVIDER_IDS]);
    expect(live.map((p) => p.id)).toEqual([...PROVIDER_IDS]);
    const demoResult = await demo[0].fetchUsage();
    const liveResult = await live[0].fetchUsage();
    expect(demoResult.status).toBe("ok");
    expect(liveResult.status).toBe("unavailable");
  });
});
