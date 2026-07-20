import type { ProviderResult } from "@/types/usage";
import { fetchLiveUsage } from "@/lib/liveUsage";
import type { UsageProvider } from "./types";

/**
 * Google Antigravity usage. No stable local artifact records remaining
 * quota yet, so the native probe only detects the installation and
 * reports an honest unavailable state. See docs/LIVE_PROVIDERS.md.
 */
export class AntigravityProvider implements UsageProvider {
  readonly id = "antigravity" as const;

  fetchUsage(): Promise<ProviderResult> {
    return fetchLiveUsage(this.id);
  }
}
