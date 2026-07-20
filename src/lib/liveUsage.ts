/**
 * Bridge to the Rust-side local usage readers (src-tauri/src/usage).
 * Outside the desktop app there is no filesystem to read, so live
 * providers resolve to an honest unavailable state.
 */

import type { ProviderId, ProviderResult } from "@/types/usage";
import { isTauri } from "./tauri";

interface LiveUsageOk {
  status: "ok";
  percentRemaining: number;
  resetAtMs: number | null;
  takenAtMs: number;
  estimated: boolean;
}

interface LiveUsageUnavailable {
  status: "unavailable";
  reason: string;
}

type LiveUsagePayload = LiveUsageOk | LiveUsageUnavailable;

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
          reset:
            payload.resetAtMs === null
              ? { kind: "unknown" }
              : { kind: "at", timestamp: payload.resetAtMs },
          takenAt: payload.takenAtMs,
          estimated: payload.estimated,
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
