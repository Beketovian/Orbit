import { useEffect, useId, useState } from "react";
import type { ProviderId } from "@/types/usage";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import styles from "./UsageRing.module.css";

/** Gradient stops per provider, sourced from the design tokens. */
const GRADIENTS: Record<ProviderId, string[]> = {
  claude: [
    "var(--claude-1, #e67d22)",
    "var(--claude-2, #de7356)",
    "var(--claude-3, #c15f3c)",
  ],
  codex: [
    "var(--codex-1, #d7d4ff)",
    "var(--codex-2, #aaa7ff)",
    "var(--codex-3, #8188ff)",
    "var(--codex-4, #596af7)",
    "var(--codex-5, #3f4dda)",
  ],
  antigravity: [
    "var(--antigravity-1, #f0524d)",
    "var(--antigravity-2, #f59a2a)",
    "var(--antigravity-3, #e9d43d)",
    "var(--antigravity-4, #55bc70)",
    "var(--antigravity-5, #37afc3)",
    "var(--antigravity-6, #4a7cf0)",
    "var(--antigravity-7, #624fe3)",
  ],
};

export interface UsageRingProps {
  provider: ProviderId;
  label: string;
  /** Remaining usage 0–100, or null when unavailable. */
  value: number | null;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
}

/**
 * An Apple-style activity ring: starts at 12 o'clock, sweeps clockwise,
 * rounded caps, gradient stroke, spring-animated on value changes.
 * Exposed to assistive tech as a meter.
 */
export function UsageRing({
  provider,
  label,
  value,
  size = 120,
  strokeWidth = 9,
}: UsageRingProps) {
  const gradientId = useId();
  const reducedMotion = useReducedMotion();

  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  // First paint renders empty, then transitions to the real value so the
  // ring sweeps in. Reduced motion jumps straight to the target.
  const [displayed, setDisplayed] = useState(reducedMotion ? clamped : 0);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayed(clamped);
      return;
    }
    const frame = requestAnimationFrame(() => setDisplayed(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped, reducedMotion]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - displayed / 100);
  const stops = GRADIENTS[provider];
  const unavailable = value === null;

  return (
    <div
      className={styles.ring}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={unavailable ? undefined : clamped}
      aria-valuetext={
        unavailable ? "Unavailable" : `${clamped}% remaining`
      }
      aria-label={`${label} usage remaining`}
    >
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {stops.map((color, i) => (
              <stop
                key={i}
                offset={stops.length === 1 ? 0 : i / (stops.length - 1)}
                stopColor={color}
              />
            ))}
          </linearGradient>
        </defs>
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        {!unavailable && (
          <circle
            className={styles.progress}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={`url(#${gradientId})`}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            // Rotate so the sweep starts at 12 o'clock and runs clockwise.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className={styles.center} aria-hidden>
        {unavailable ? (
          <span className={styles.dash}>—</span>
        ) : (
          <span className={styles.value}>
            {clamped}
            <span className={styles.percent}>%</span>
          </span>
        )}
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
