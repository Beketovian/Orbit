import type { ProviderId, ProviderResult } from "@/types/usage";

/**
 * A source of usage data for one AI service.
 *
 * Implementations must never invent data: when a service has no
 * queryable local state or documented usage API, `fetchUsage` resolves
 * to an `unavailable` result with a human-readable reason.
 */
export interface UsageProvider {
  readonly id: ProviderId;
  fetchUsage(): Promise<ProviderResult>;
}
