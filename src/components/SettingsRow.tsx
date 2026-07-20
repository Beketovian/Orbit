import type { ReactNode } from "react";
import styles from "./SettingsRow.module.css";

export interface SettingsRowProps {
  title: string;
  description?: string;
  /** The trailing control: toggle, select, segmented control… */
  children?: ReactNode;
}

/** One row of a macOS-style settings group. */
export function SettingsRow({ title, description, children }: SettingsRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.copy}>
        <div className={styles.title}>{title}</div>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      {children && <div className={styles.control}>{children}</div>}
    </div>
  );
}
