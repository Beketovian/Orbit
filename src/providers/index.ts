import type { ProviderId } from "@/types/usage";
import { PROVIDER_IDS } from "@/types/usage";
import type { UsageProvider } from "./types";
import { ClaudeProvider } from "./claude";
import { CodexProvider } from "./codex";
import { AntigravityProvider } from "./antigravity";

const providers: Record<ProviderId, UsageProvider> = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
  antigravity: new AntigravityProvider(),
};

/** Resolve every live provider in stable display order. */
export function getProviders(): UsageProvider[] {
  return PROVIDER_IDS.map((id) => providers[id]);
}

export type { UsageProvider } from "./types";
