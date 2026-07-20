import type { ProviderResult } from "@/types/usage";
import type { UsageProvider } from "./types";

/**
 * Live OpenAI Codex usage.
 *
 * OpenAI does not document a public endpoint for Codex plan usage
 * limits, so this provider reports an honest unavailable state rather
 * than relying on undocumented APIs.
 */
export class CodexProvider implements UsageProvider {
  readonly id = "codex" as const;

  async fetchUsage(): Promise<ProviderResult> {
    return {
      status: "unavailable",
      providerId: this.id,
      reason:
        "OpenAI Codex does not expose a documented usage API. Enable Demo Mode to preview Orbit.",
    };
  }
}
