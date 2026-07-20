import type { ReactNode } from "react";
import styles from "./StatusRow.module.css";

export interface StatusRowProps {
  icon?: ReactNode;
  children: ReactNode;
}

/** A quiet single-line row: small leading icon, secondary text. */
export function StatusRow({ icon, children }: StatusRowProps) {
  return (
    <div className={styles.row}>
      {icon && (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      )}
      <span className={styles.text}>{children}</span>
    </div>
  );
}
