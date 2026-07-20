import type { ReactNode } from "react";
import { GlassSurface } from "./GlassSurface";
import styles from "./ChartCard.module.css";

export interface ChartCardProps {
  title: string;
  trailing?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
}

/** A quiet card that frames the usage chart without dashboard chrome. */
export function ChartCard({ title, trailing, legend, children }: ChartCardProps) {
  return (
    <GlassSurface variant="card" className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {trailing}
      </div>
      {children}
      {legend && <div className={styles.legend}>{legend}</div>}
    </GlassSurface>
  );
}

export interface LegendItemProps {
  color: string;
  name: string;
  value?: string;
}

export function LegendItem({ color, name, value }: LegendItemProps) {
  return (
    <span className={styles.legendItem}>
      <span className={styles.dot} style={{ background: color }} aria-hidden />
      <span className={styles.legendName}>{name}</span>
      {value && <span className={styles.legendValue}>{value}</span>}
    </span>
  );
}
