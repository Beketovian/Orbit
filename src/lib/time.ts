import type { ResetInfo } from "@/types/usage";

const HOUR = 3_600_000;
const MINUTE = 60_000;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Human phrasing for a reset time, relative to `now`.
 *
 *  - within 3 hours  → "in 2h 14m"
 *  - later today     → "at 4:00 PM"
 *  - tomorrow        → "tomorrow"
 *  - beyond          → weekday name
 */
export function formatReset(reset: ResetInfo, now: number = Date.now()): string {
  if (reset.kind === "unknown") return "unavailable";

  const diff = reset.timestamp - now;
  if (diff <= 0) return "any moment";

  if (diff < 3 * HOUR) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.round((diff % HOUR) / MINUTE);
    if (hours === 0) return minutes <= 1 ? "in 1m" : `in ${minutes}m`;
    return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
  }

  const target = new Date(reset.timestamp);
  const current = new Date(now);
  if (isSameDay(target, current)) return `at ${formatClock(target)}`;

  const tomorrow = new Date(now + 24 * HOUR);
  if (isSameDay(target, tomorrow)) return "tomorrow";

  return `on ${target.toLocaleDateString(undefined, { weekday: "long" })}`;
}

/** "just now", "3m ago", "2h ago" — for the refresh footer. */
export function formatUpdatedAgo(
  timestamp: number | null,
  now: number = Date.now(),
): string {
  if (timestamp === null) return "Not updated yet";
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE) return "Updated just now";
  if (diff < HOUR) return `Updated ${Math.floor(diff / MINUTE)}m ago`;
  if (diff < 24 * HOUR) return `Updated ${Math.floor(diff / HOUR)}h ago`;
  return `Updated ${new Date(timestamp).toLocaleDateString()}`;
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Short label ("Mon", "Jul 4") for a YYYY-MM-DD day key. */
export function dayLabel(key: string, format: "weekday" | "date" = "weekday"): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (format === "weekday") {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
