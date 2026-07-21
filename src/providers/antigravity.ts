import type { ProviderResult } from "@/types/usage";
import { fetchLiveUsage } from "@/lib/liveUsage";
import type { UsageProvider } from "./types";

/**
 * Live Google Antigravity model quota, read from the loopback-only Connect
 * endpoint exposed by Antigravity's language server while the IDE is open,
 * including its Gemini and Claude/GPT weekly and five-hour buckets. See
 * docs/LIVE_PROVIDERS.md.
 */
export class AntigravityProvider implements UsageProvider {
  readonly id = "antigravity" as const;

  fetchUsage(): Promise<ProviderResult> {
    return fetchLiveUsage(this.id);
  }
}
