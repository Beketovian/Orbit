import type { ReactNode } from "react";
import styles from "./StatusRow.module.css";

export interface StatusRowProps {
  icon?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md";
}

/** A quiet single-line row: small leading icon, secondary text. */
export function StatusRow({ icon, children, size = "md" }: StatusRowProps) {
  return (
    <div className={styles.row}>
      {icon && (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      )}
      <span className={`${styles.text} ${size === "sm" ? styles.sm : ""}`}>
        {children}
      </span>
    </div>
  );
}
