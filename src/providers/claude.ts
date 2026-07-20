import type { ProviderResult } from "@/types/usage";
import { fetchLiveUsage } from "@/lib/liveUsage";
import type { UsageProvider } from "./types";

/**
 * Live Claude Code usage, read from the local session transcripts
 * Claude Code already writes (`~/.claude/projects/**.jsonl`). The
 * remaining percentage is computed against an estimated 5-hour budget
 * and marked as such — Anthropic publishes no per-plan token budgets.
 * See docs/LIVE_PROVIDERS.md.
 */
export class ClaudeProvider implements UsageProvider {
  readonly id = "claude" as const;

  fetchUsage(): Promise<ProviderResult> {
    return fetchLiveUsage(this.id);
  }
}
