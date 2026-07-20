import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

export interface SectionHeaderProps {
  title: string;
  /** Optional trailing control (segmented control, button…). */
  trailing?: ReactNode;
}

export function SectionHeader({ title, trailing }: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {trailing && <div>{trailing}</div>}
    </header>
  );
}
