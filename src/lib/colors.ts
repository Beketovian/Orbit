import type { ProviderId } from "@/types/usage";

/** Solid accent per provider, for chart lines and legend dots. */
export const PROVIDER_ACCENT: Record<ProviderId, string> = {
  claude: "var(--claude-accent)",
  codex: "var(--codex-accent)",
  antigravity: "var(--antigravity-accent)",
};
