import { useUsageStore } from "@/store/usageStore";
import { PROVIDER_IDS } from "@/types/usage";
import { useNow } from "@/hooks/useNow";
import { formatUpdatedAgo } from "@/lib/time";
import { buildChartData } from "@/lib/chartData";
import { SectionHeader } from "@/components/SectionHeader";
import { ProviderCard } from "@/components/ProviderCard";
import { ChartCard, LegendItem } from "@/components/ChartCard";
import { UsageChart } from "@/components/UsageChart";
import { Button } from "@/components/Button";
import { RefreshIcon } from "@/components/Icon";
import styles from "./OverviewView.module.css";

/** Overview: three large rings, reset info, and one restrained chart. */
export function OverviewView() {
  const now = useNow(30_000);
  const snapshots = useUsageStore((s) => s.snapshots);
  const history = useUsageStore((s) => s.history);
  const lastUpdated = useUsageStore((s) => s.lastUpdated);
  const refreshing = useUsageStore((s) => s.refreshing);
  const refresh = useUsageStore((s) => s.refresh);

  const { series, xLabels } = buildChartData(history, 7, now);

  return (
    <div className={styles.view}>
      <SectionHeader
        title="Overview"
        trailing={
          <div className={styles.headerTrailing}>
            <span className={styles.updated}>{formatUpdatedAgo(lastUpdated, now)}</span>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh usage"
            >
              <RefreshIcon size={13} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className={styles.cards}>
        {PROVIDER_IDS.map((id) => (
          <ProviderCard key={id} provider={id} result={snapshots[id]} now={now} />
        ))}
      </div>

      <ChartCard
        title="Remaining this week"
        legend={series.map((s) => {
          const result = snapshots[s.id as keyof typeof snapshots];
          const value =
            result?.status === "ok"
              ? `${result.snapshot.percentRemaining}%`
              : "—";
          return <LegendItem key={s.id} color={s.color} name={s.name} value={value} />;
        })}
      >
        <UsageChart
          series={series}
          xLabels={xLabels}
          ariaLabel="Remaining usage over the last seven days for Claude, Codex, and Antigravity"
        />
      </ChartCard>
    </div>
  );
}
