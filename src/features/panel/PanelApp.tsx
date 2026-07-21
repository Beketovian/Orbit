import { useEffect } from "react";
import { useUsageStore } from "@/store/usageStore";
import { PROVIDER_IDS, PROVIDER_META } from "@/types/usage";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useNow } from "@/hooks/useNow";
import { formatReset, formatUpdatedAgo } from "@/lib/time";
import { summarizeUsage } from "@/lib/summary";
import { openMainWindow, setPanelCompact } from "@/lib/tauri";
import { GlassSurface } from "@/components/GlassSurface";
import { UsageRing } from "@/components/UsageRing";
import { StatusRow } from "@/components/StatusRow";
import { Button } from "@/components/Button";
import { ClockIcon, GearIcon, RefreshIcon, SparkleIcon } from "@/components/Icon";
import styles from "./PanelApp.module.css";

/**
 * The compact floating panel that opens from the tray. Answers one
 * question at a glance: how much AI usage is left?
 */
export function PanelApp() {
  useAutoRefresh();
  const now = useNow(30_000);

  const snapshots = useUsageStore((s) => s.snapshots);
  const lastUpdated = useUsageStore((s) => s.lastUpdated);
  const refreshing = useUsageStore((s) => s.refreshing);
  const refresh = useUsageStore((s) => s.refresh);
  const threshold = useUsageStore((s) => s.settings.lowUsageThreshold);
  const showUsageHints = useUsageStore((s) => s.settings.showUsageHints);

  const summary = summarizeUsage(snapshots, threshold);

  useEffect(() => {
    void setPanelCompact(!showUsageHints);
  }, [showUsageHints]);

  const resetParts = PROVIDER_IDS.flatMap((id) => {
    const result = snapshots[id];
    if (result?.status !== "ok") return [];
    return [
      <span key={id}>
        <strong>
          {PROVIDER_META[id].name}
          {result.snapshot.limitWindow === "weekly" ? " weekly limit" : ""}
        </strong>{" "}
        resets {formatReset(result.snapshot.reset, now)}
      </span>,
    ];
  });

  return (
    <div className={styles.root}>
      <GlassSurface variant="panel" className={styles.panel}>
        <header className={styles.header}>
          <h1 className={styles.title}>Orbit</h1>
        </header>

        <div className={styles.rings}>
          {PROVIDER_IDS.map((id) => {
            const result = snapshots[id];
            return (
              <UsageRing
                key={id}
                provider={id}
                label={PROVIDER_META[id].name}
                value={
                  result?.status === "ok"
                    ? result.snapshot.percentRemaining
                    : null
                }
                windowLabel={
                  result?.status === "ok"
                    ? result.snapshot.limitWindow === "weekly"
                      ? "Week"
                      : "5h"
                    : undefined
                }
                size={124}
                strokeWidth={9}
              />
            );
          })}
        </div>

        <div className={styles.section}>
          <StatusRow size="sm" wrap icon={<ClockIcon size={14} />}>
            {resetParts.length > 0 ? (
              resetParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className={styles.dot}> · </span>}
                  {part}
                </span>
              ))
            ) : (
              <span>No reset information available</span>
            )}
          </StatusRow>
        </div>

        {showUsageHints && (
          <GlassSurface
            variant="inset"
            className={`${styles.summary} ${styles[`tone-${summary.tone}`]}`}
          >
            <span className={styles.summaryIcon} aria-hidden>
              <SparkleIcon size={16} />
            </span>
            <div>
              <div className={styles.summaryTitle}>{summary.title}</div>
              <div className={styles.summarySubtitle}>{summary.subtitle}</div>
            </div>
          </GlassSurface>
        )}

        <footer className={styles.footer}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh usage"
          >
            <RefreshIcon
              size={14}
              className={refreshing ? styles.spinning : undefined}
            />
            Refresh
          </Button>
          <span className={styles.updated} role="status">
            {formatUpdatedAgo(lastUpdated, now)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openMainWindow("settings")}
            aria-label="Open settings"
          >
            <GearIcon size={14} />
            Settings
          </Button>
        </footer>
      </GlassSurface>
    </div>
  );
}
