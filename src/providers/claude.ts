import type { ProviderResult } from "@/types/usage";
import type { UsageProvider } from "./types";

/**
 * Live Claude Code usage.
 *
 * Anthropic does not publish a local or public API for consumer plan
 * usage limits, so this provider reports an honest unavailable state
 * rather than guessing. The interface is ready for a real integration
 * if one becomes possible.
 */
export class ClaudeProvider implements UsageProvider {
  readonly id = "claude" as const;

  async fetchUsage(): Promise<ProviderResult> {
    return {
      status: "unavailable",
      providerId: this.id,
      reason:
        "Claude Code does not expose a local usage API. Enable Demo Mode to preview Orbit.",
    };
  }
}
