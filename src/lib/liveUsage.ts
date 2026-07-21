/**
 * Bridge to the Rust-side local usage readers (src-tauri/src/usage).
 * Outside the desktop app there is no filesystem to read, so live
 * providers resolve to an honest unavailable state.
 */

import type {
  ProviderId,
  ProviderResult,
  UsageCategory,
  UsageLimitWindow,
} from "@/types/usage";
import { isTauri } from "./tauri";

interface LiveUsageOk {
  status: "ok";
  percentRemaining: number;
  resetAtMs: number | null;
  takenAtMs: number;
  estimated: boolean;
  limitWindow: UsageLimitWindow | null;
  limits: LiveUsageLimit[] | null;
  usageCategories: LiveUsageCategory[] | null;
}

interface LiveUsageLimit {
  window: UsageLimitWindow;
  percentRemaining: number;
  resetAtMs: number | null;
}

interface LiveUsageCategory {
  id: string;
  name: string;
  description: string | null;
  limits: LiveUsageLimit[];
}

interface LiveUsageUnavailable {
  status: "unavailable";
  reason: string;
}

type LiveUsagePayload = LiveUsageOk | LiveUsageUnavailable;

function resetInfo(resetAtMs: number | null) {
  return resetAtMs === null
    ? ({ kind: "unknown" } as const)
    : ({ kind: "at", timestamp: resetAtMs } as const);
}

function mapUsageCategories(
  categories: LiveUsageCategory[] | null,
): UsageCategory[] | undefined {
  if (!categories?.length) return undefined;
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description ?? undefined,
    limits: mapLimits(category.limits) ?? [],
  }));
}

function mapLimits(limits: LiveUsageLimit[] | null) {
  if (!limits?.length) return undefined;
  return limits.map((limit) => ({
    window: limit.window,
    percentRemaining: Math.round(limit.percentRemaining),
    reset: resetInfo(limit.resetAtMs),
  }));
}

export async function fetchLiveUsage(id: ProviderId): Promise<ProviderResult> {
  if (!isTauri()) {
    return {
      status: "unavailable",
      providerId: id,
      reason: "Live data requires the Orbit desktop app.",
    };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = await invoke<LiveUsagePayload>("get_live_usage", {
      provider: id,
    });
    if (payload.status === "ok") {
      return {
        status: "ok",
        snapshot: {
          providerId: id,
          percentRemaining: Math.round(payload.percentRemaining),
          reset: resetInfo(payload.resetAtMs),
          takenAt: payload.takenAtMs,
          estimated: payload.estimated,
          limitWindow: payload.limitWindow ?? undefined,
          limits: mapLimits(payload.limits),
          usageCategories: mapUsageCategories(payload.usageCategories),
        },
      };
    }
    return { status: "unavailable", providerId: id, reason: payload.reason };
  } catch {
    return {
      status: "unavailable",
      providerId: id,
      reason: "Could not read local usage data.",
    };
  }
}
