import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /**
   * primary — filled accent button
   * subtle  — quiet filled button
   * ghost   — text/icon only, shows background on hover
   */
  variant?: "primary" | "subtle" | "ghost";
  size?: "sm" | "md";
}

export function Button({
  children,
  variant = "subtle",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
