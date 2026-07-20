import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./summary";
import type { SnapshotMap } from "@/store/usageStore";
import type { ProviderId } from "@/types/usage";

function snapshots(values: Partial<Record<ProviderId, number>>): SnapshotMap {
  const map: SnapshotMap = { claude: null, codex: null, antigravity: null };
  for (const [id, pct] of Object.entries(values) as [ProviderId, number][]) {
    map[id] = {
      status: "ok",
      snapshot: {
        providerId: id,
        percentRemaining: pct,
        reset: { kind: "unknown" },
        takenAt: 0,
      },
    };
  }
  return map;
}

describe("summarizeUsage", () => {
  it("is calm when everything is healthy", () => {
    const s = summarizeUsage(snapshots({ claude: 92, codex: 93, antigravity: 94 }), 20);
    expect(s.tone).toBe("good");
    expect(s.title).toBe("All systems looking good.");
  });

  it("flags the lowest provider when it needs watching", () => {
    const s = summarizeUsage(snapshots({ claude: 35, codex: 93, antigravity: 94 }), 20);
    expect(s.tone).toBe("watch");
    expect(s.title).toContain("Claude");
  });

  it("warns when a provider is below the threshold", () => {
    const s = summarizeUsage(snapshots({ claude: 92, codex: 8, antigravity: 94 }), 20);
    expect(s.tone).toBe("low");
    expect(s.title).toContain("Codex");
  });

  it("is honest when nothing is available", () => {
    const s = summarizeUsage(snapshots({}), 20);
    expect(s.tone).toBe("unknown");
  });
});
