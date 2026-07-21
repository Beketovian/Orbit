import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@/types/usage";
import { getProviders } from "./index";

describe("live providers", () => {
  it("returns every provider in stable display order", () => {
    expect(getProviders().map((provider) => provider.id)).toEqual([
      ...PROVIDER_IDS,
    ]);
  });

  it("reports honest unavailable states outside the desktop app", async () => {
    const results = await Promise.all(
      getProviders().map((provider) => provider.fetchUsage()),
    );
    expect(results).toHaveLength(PROVIDER_IDS.length);
    for (const result of results) {
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
