import type { HTMLAttributes, ReactNode } from "react";
import styles from "./GlassSurface.module.css";

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * panel  — the floating tray panel chrome
   * card   — an inset card inside a window
   * inset  — a subtle recessed area (banners, wells)
   */
  variant?: "panel" | "card" | "inset";
}

/** Translucent, softly shadowed surface — the building block of Orbit's chrome. */
export function GlassSurface({
  children,
  variant = "card",
  className,
  ...rest
}: GlassSurfaceProps) {
  const classes = [styles.surface, styles[variant], className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
