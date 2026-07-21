import type { SnapshotMap } from "@/store/usageStore";
import { PROVIDER_IDS, PROVIDER_META } from "@/types/usage";

export type SummaryTone = "good" | "watch" | "low" | "unknown";

export interface UsageSummary {
  tone: SummaryTone;
  title: string;
  subtitle: string;
}

/**
 * One calm sentence about the overall state — the panel's centerpiece.
 */
export function summarizeUsage(
  snapshots: SnapshotMap,
  lowThreshold: number,
): UsageSummary {
  const ok = PROVIDER_IDS.flatMap((id) => {
    const r = snapshots[id];
    return r?.status === "ok"
      ? [{ id, pct: r.snapshot.percentRemaining }]
      : [];
  });

  if (ok.length === 0) {
    return {
      tone: "unknown",
      title: "Live usage is unavailable.",
      subtitle: "Open a provider app or run a recent session, then refresh.",
    };
  }

  const lowest = ok.reduce((a, b) => (b.pct < a.pct ? b : a));
  const name = PROVIDER_META[lowest.id].name;

  if (lowest.pct < lowThreshold) {
    return {
      tone: "low",
      title: `${name} is running low.`,
      subtitle: `Only ${lowest.pct}% remains — it will replenish at the next reset.`,
    };
  }

  if (lowest.pct < 50) {
    return {
      tone: "watch",
      title: `Keep an eye on ${name}.`,
      subtitle: `${lowest.pct}% remaining — pace yourself until the next reset.`,
    };
  }

  return {
    tone: "good",
    title: "All systems looking good.",
    subtitle: "You have plenty of runway today.",
  };
}
