import { useEffect, useRef, useState } from "react";
import type {
  ProviderId,
  ProviderResult,
  UsageCategory,
  UsageCategoryLimit,
} from "@/types/usage";
import { PROVIDER_META } from "@/types/usage";
import { formatReset } from "@/lib/time";
import { GlassSurface } from "./GlassSurface";
import { UsageRing } from "./UsageRing";
import { ClockIcon } from "./Icon";
import styles from "./ProviderCard.module.css";

export interface ProviderCardProps {
  provider: ProviderId;
  result: ProviderResult | null;
  now: number;
}

/** Lowest remaining limit wins; a five-hour window wins a percentage tie. */
export function effectiveCategoryLimit(
  category: UsageCategory,
): UsageCategoryLimit | null {
  return category.limits.reduce<UsageCategoryLimit | null>((current, limit) => {
    if (!current || limit.percentRemaining < current.percentRemaining) return limit;
    if (
      limit.percentRemaining === current.percentRemaining &&
      limit.window === "fiveHour" &&
      current.window === "weekly"
    ) {
      return limit;
    }
    return current;
  }, null);
}

/** The ring prefers the operational five-hour window, then weekly. */
export function primaryLimit(
  limits: UsageCategoryLimit[],
): UsageCategoryLimit | null {
  return (
    limits.find((limit) => limit.window === "fiveHour") ??
    limits.find((limit) => limit.window === "weekly") ??
    limits[0] ??
    null
  );
}

function defaultCategory(categories: UsageCategory[]): UsageCategory | null {
  return categories.reduce<UsageCategory | null>((current, category) => {
    if (!current) return category;
    const currentLimit = effectiveCategoryLimit(current);
    const candidateLimit = effectiveCategoryLimit(category);
    if (!currentLimit) return category;
    if (!candidateLimit) return current;
    return candidateLimit.percentRemaining < currentLimit.percentRemaining
      ? category
      : current;
  }, null);
}

/** Continuous red → amber → green signal for compact usage dots. */
export function usageDotColor(percentRemaining: number): string {
  const percent = Math.max(0, Math.min(100, percentRemaining));
  const hue = Math.round(6 + percent * 1.14);
  return `hsl(${hue} 68% 43%)`;
}

interface UsageCategorySelectProps {
  categories: UsageCategory[];
  selected: UsageCategory;
  onChange(categoryId: string): void;
}

function UsageCategorySelect({
  categories,
  selected,
  onChange,
}: UsageCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLimit = effectiveCategoryLimit(selected);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.categorySelect} ref={rootRef}>
      <button
        type="button"
        className={styles.categoryTrigger}
        aria-label={`Antigravity model usage category: ${selected.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          className={styles.usageDot}
          style={{
            backgroundColor: usageDotColor(
              selectedLimit?.percentRemaining ?? 0,
            ),
          }}
          aria-hidden
        />
        <span className={styles.categoryName}>{selected.name}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden />
      </button>

      {open && (
        <div className={styles.categoryMenu} role="listbox" aria-label="Model usage categories">
          {categories.map((category) => {
            const limit = effectiveCategoryLimit(category);
            const percent = limit?.percentRemaining ?? 0;
            const active = category.id === selected.id;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                aria-label={`${category.name}, ${percent}% remaining`}
                className={`${styles.categoryOption} ${
                  active ? styles.categoryOptionActive : ""
                }`}
                key={category.id}
                onClick={() => {
                  onChange(category.id);
                  setOpen(false);
                }}
              >
                <span
                  className={styles.usageDot}
                  style={{ backgroundColor: usageDotColor(percent) }}
                  title={`${percent}% remaining`}
                  aria-hidden
                />
                <span className={styles.optionName}>{category.name}</span>
                <span className={styles.optionPercent}>{percent}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LimitSummary({
  limits,
  primary,
  now,
  label,
}: {
  limits: UsageCategoryLimit[];
  primary: UsageCategoryLimit | null;
  now: number;
  label: string;
}) {
  const ordered = [...limits].sort((a, b) =>
    a.window === b.window ? 0 : a.window === "fiveHour" ? -1 : 1,
  );

  if (!ordered.length) {
    return <div className={styles.emptyLimits}>Limits unavailable</div>;
  }

  return (
    <div className={styles.limitSummary} aria-label={`${label} limit details`}>
      {ordered.map((limit) => {
        const resetCopy =
          limit.reset.kind === "at"
            ? `Resets ${formatReset(limit.reset, now)}`
            : "Reset time unavailable";
        const active = limit.window === primary?.window;
        return (
          <span
            className={`${styles.limitItem} ${
              active ? styles.limitItemPrimary : ""
            }`}
            key={limit.window}
            title={resetCopy}
            aria-label={`${
              limit.window === "fiveHour" ? "Five-hour" : "Weekly"
            } limit: ${limit.percentRemaining}% remaining. ${resetCopy}`}
          >
            <span className={styles.limitLabel}>
              {limit.window === "fiveHour" ? "5h" : "Week"}
            </span>
            <strong>{limit.percentRemaining}%</strong>
          </span>
        );
      })}
    </div>
  );
}

function ResetLine({
  reset,
  now,
}: {
  reset: UsageCategoryLimit["reset"] | undefined;
  now: number;
}) {
  return (
    <div className={styles.reset}>
      <ClockIcon size={13} aria-hidden />
      <span>{reset ? `Resets ${formatReset(reset, now)}` : "Unavailable"}</span>
    </div>
  );
}

/** A softly tinted overview card: large ring plus reset line. */
export function ProviderCard({ provider, result, now }: ProviderCardProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const meta = PROVIDER_META[provider];
  const ok = result?.status === "ok";
  const snapshot = ok ? result.snapshot : null;
  const categories = snapshot?.usageCategories ?? [];
  const fallbackCategory = defaultCategory(categories);
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? fallbackCategory;
  const fallbackLimit: UsageCategoryLimit[] = snapshot
    ? [
        {
          window: snapshot.limitWindow ?? "fiveHour",
          percentRemaining: snapshot.percentRemaining,
          reset: snapshot.reset,
        },
      ]
    : [];
  const limits = selectedCategory?.limits ?? snapshot?.limits ?? fallbackLimit;
  const selectedLimit = primaryLimit(limits);
  const value = selectedLimit?.percentRemaining ?? snapshot?.percentRemaining ?? null;
  const reset = selectedLimit?.reset ?? snapshot?.reset;
  const windowLabel = selectedLimit?.window === "weekly" ? "Week" : "5h";
  const detailsLabel = selectedCategory?.name ?? meta.name;

  return (
    <GlassSurface variant="card" className={`${styles.card} ${styles[provider]}`}>
      <UsageRing
        provider={provider}
        label={meta.name}
        value={value}
        windowLabel={value === null ? undefined : windowLabel}
        size={144}
        strokeWidth={10}
      />

      <div className={styles.details}>
        <div className={styles.contextRow}>
          {provider === "antigravity" && selectedCategory ? (
            categories.length > 1 ? (
              <UsageCategorySelect
                categories={categories}
                selected={selectedCategory}
                onChange={setSelectedCategoryId}
              />
            ) : (
              <div className={styles.categoryStatic}>
                <span
                  className={styles.usageDot}
                  style={{
                    backgroundColor: usageDotColor(
                      effectiveCategoryLimit(selectedCategory)
                        ?.percentRemaining ?? 0,
                    ),
                  }}
                  aria-hidden
                />
                <span>{selectedCategory.name}</span>
              </div>
            )
          ) : (
            <ResetLine reset={reset} now={now} />
          )}
        </div>
        <LimitSummary
          limits={limits}
          primary={selectedLimit}
          now={now}
          label={detailsLabel}
        />
      </div>
    </GlassSurface>
  );
}
