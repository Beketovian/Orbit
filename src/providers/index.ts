import type { ProviderId } from "@/types/usage";
import { PROVIDER_IDS } from "@/types/usage";
import type { UsageProvider } from "./types";
import { DemoProvider } from "./demo";
import { ClaudeProvider } from "./claude";
import { CodexProvider } from "./codex";
import { AntigravityProvider } from "./antigravity";

const liveProviders: Record<ProviderId, UsageProvider> = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
  antigravity: new AntigravityProvider(),
};

const demoProviders: Record<ProviderId, UsageProvider> = {
  claude: new DemoProvider("claude"),
  codex: new DemoProvider("codex"),
  antigravity: new DemoProvider("antigravity"),
};

/** Resolve the active provider set for the current mode. */
export function getProviders(demoMode: boolean): UsageProvider[] {
  const set = demoMode ? demoProviders : liveProviders;
  return PROVIDER_IDS.map((id) => set[id]);
}

export type { UsageProvider } from "./types";
