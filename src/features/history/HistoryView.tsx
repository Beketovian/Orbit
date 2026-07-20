import { useState } from "react";
import { useUsageStore } from "@/store/usageStore";
import { useNow } from "@/hooks/useNow";
import { buildChartData } from "@/lib/chartData";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChartCard, LegendItem } from "@/components/ChartCard";
import { UsageChart } from "@/components/UsageChart";
import styles from "./HistoryView.module.css";

type Range = "7" | "30";

/** History: the same restrained chart over a 7 or 30 day window. */
export function HistoryView() {
  const now = useNow(60_000);
  const history = useUsageStore((s) => s.history);
  const [range, setRange] = useState<Range>("7");

  const days = range === "7" ? 7 : 30;
  const { series, xLabels } = buildChartData(history, days, now);

  const hasData = series.some((s) => s.values.some((v) => v !== null));

  return (
    <div className={styles.view}>
      <SectionHeader
        title="History"
        trailing={
          <SegmentedControl<Range>
            label="History range"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />

      <ChartCard
        title={`Lowest remaining each day · last ${days} days`}
        legend={series.map((s) => (
          <LegendItem key={s.id} color={s.color} name={s.name} />
        ))}
      >
        {hasData ? (
          <UsageChart
            series={series}
            xLabels={xLabels}
            height={220}
            ariaLabel={`Remaining usage over the last ${days} days for Claude, Codex, and Antigravity`}
          />
        ) : (
          <div className={styles.empty}>
            <p>No history yet.</p>
            <p className={styles.emptyHint}>
              Orbit records one point per day as it refreshes.
            </p>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
