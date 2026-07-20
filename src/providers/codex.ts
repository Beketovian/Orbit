import type { ProviderResult } from "@/types/usage";
import { fetchLiveUsage } from "@/lib/liveUsage";
import type { UsageProvider } from "./types";

/**
 * Live OpenAI Codex usage, read from the rate-limit snapshots Codex CLI
 * records in its local session rollout files (`~/.codex/sessions`).
 * Exact percentages, as fresh as the last Codex session.
 * See docs/LIVE_PROVIDERS.md.
 */
export class CodexProvider implements UsageProvider {
  readonly id = "codex" as const;

  fetchUsage(): Promise<ProviderResult> {
    return fetchLiveUsage(this.id);
  }
}
