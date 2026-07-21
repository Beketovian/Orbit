import type { ProviderResult } from "@/types/usage";
import { fetchLiveUsage } from "@/lib/liveUsage";
import type { UsageProvider } from "./types";

/**
 * Live Claude Code usage. Exact five-hour and weekly windows come from
 * the local statusline cache when available; local session transcripts
 * provide an explicitly estimated five-hour fallback. See
 * docs/LIVE_PROVIDERS.md.
 */
export class ClaudeProvider implements UsageProvider {
  readonly id = "claude" as const;

  fetchUsage(): Promise<ProviderResult> {
    return fetchLiveUsage(this.id);
  }
}
