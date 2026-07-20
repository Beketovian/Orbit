import type { ProviderResult } from "@/types/usage";
import type { UsageProvider } from "./types";

/**
 * Live Google Antigravity usage.
 *
 * Google does not document a public endpoint for Antigravity usage
 * limits, so this provider reports an honest unavailable state rather
 * than relying on undocumented APIs.
 */
export class AntigravityProvider implements UsageProvider {
  readonly id = "antigravity" as const;

  async fetchUsage(): Promise<ProviderResult> {
    return {
      status: "unavailable",
      providerId: this.id,
      reason:
        "Google Antigravity does not expose a documented usage API. Enable Demo Mode to preview Orbit.",
    };
  }
}
