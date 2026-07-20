import type { ProviderId, ProviderResult } from "@/types/usage";
import { PROVIDER_META } from "@/types/usage";
import { formatReset } from "@/lib/time";
import { GlassSurface } from "./GlassSurface";
import { UsageRing } from "./UsageRing";
import { ClockIcon } from "./Icon";
import styles from "./ProviderCard.module.css";

export interface ProviderCardProps {
  provider: ProviderId;
  result: ProviderResult | null;
  now: number;
}

/** A softly tinted overview card: large ring plus reset line. */
export function ProviderCard({ provider, result, now }: ProviderCardProps) {
  const meta = PROVIDER_META[provider];
  const ok = result?.status === "ok";
  const value = ok ? result.snapshot.percentRemaining : null;

  return (
    <GlassSurface variant="card" className={`${styles.card} ${styles[provider]}`}>
      <UsageRing provider={provider} label={meta.name} value={value} size={148} strokeWidth={10} />
      <div className={styles.reset}>
        <ClockIcon size={13} aria-hidden />
        <span>
          {ok ? `Resets ${formatReset(result.snapshot.reset, now)}` : "Unavailable"}
        </span>
      </div>
    </GlassSurface>
  );
}
