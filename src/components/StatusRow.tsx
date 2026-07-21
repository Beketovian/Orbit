import type { ReactNode } from "react";
import styles from "./StatusRow.module.css";

export interface StatusRowProps {
  icon?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md";
  /** Allow long status details to use more than one line. */
  wrap?: boolean;
}

/** A quiet status row with a small leading icon and secondary text. */
export function StatusRow({
  icon,
  children,
  size = "md",
  wrap = false,
}: StatusRowProps) {
  return (
    <div className={styles.row}>
      {icon && (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      )}
      <span
        className={`${styles.text} ${size === "sm" ? styles.sm : ""} ${
          wrap ? styles.wrap : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}
