//! OpenAI Codex usage from local session rollout files.
//!
//! Codex CLI writes rollout JSONL files under `~/.codex/sessions/…`.
//! Its `token_count` events embed the backend's own `rate_limits`
//! snapshot — `used_percent`, `window_minutes`, and either `resets_at` or
//! `resets_in_seconds` for its active windows. Orbit prefers a 5-hour
//! window wherever it appears, then falls back to the weekly window. The
//! number is exact but only as fresh as the last Codex session, so
//! `taken_at` carries the snapshot's own timestamp.

use super::{
    collect_recent_jsonl, now_ms, parse_rfc3339_ms, LimitWindow, LiveUsage, UsageCategoryLimit,
};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// How far back to look for a session before declaring no data.
const LOOKBACK_MS: i64 = 7 * 24 * 60 * 60 * 1_000;

pub fn fetch() -> LiveUsage {
    let Some(home) = super::home_dir() else {
        return LiveUsage::unavailable("Could not resolve your home directory.");
    };
    let codex = home.join(".codex");
    if !codex.is_dir() {
        return LiveUsage::unavailable("Codex CLI data not found (~/.codex). Is Codex installed?");
    }

    let now = now_ms();
    let mut files = Vec::new();
    for sub in ["sessions", "archived_sessions"] {
        let dir = codex.join(sub);
        if dir.is_dir() {
            collect_recent_jsonl(&dir, now - LOOKBACK_MS, 6, &mut files);
        }
    }
    if files.is_empty() {
        return LiveUsage::unavailable(
            "No recent Codex sessions found. Run Codex once, then refresh.",
        );
    }

    match newest_snapshots(&files) {
        Some(windows) => {
            let snap = preferred_snapshot(&windows)
                .expect("a parsed Codex rate-limit event always contains a window");
            let limits = windows
                .iter()
                .map(|window| UsageCategoryLimit {
                    window: window.limit_window,
                    percent_remaining: (100.0 - window.used_percent).clamp(0.0, 100.0).round(),
                    reset_at_ms: window.reset_at_ms,
                })
                .collect();
            LiveUsage::Ok {
                percent_remaining: (100.0 - snap.used_percent).clamp(0.0, 100.0).round(),
                reset_at_ms: snap.reset_at_ms,
                taken_at_ms: snap.taken_at_ms,
                estimated: false,
                limit_window: Some(snap.limit_window),
                limits: Some(limits),
                usage_categories: None,
            }
        }
        None => LiveUsage::unavailable("Recent Codex sessions contain no rate-limit snapshots."),
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Snapshot {
    pub taken_at_ms: i64,
    pub used_percent: f64,
    pub reset_at_ms: Option<i64>,
    pub limit_window: LimitWindow,
}

fn preferred_snapshot(windows: &[Snapshot]) -> Option<&Snapshot> {
    windows
        .iter()
        .find(|window| window.limit_window == LimitWindow::FiveHour)
        .or_else(|| {
            windows
                .iter()
                .find(|window| window.limit_window == LimitWindow::Weekly)
        })
        .or_else(|| windows.first())
}

fn newest_snapshots(files: &[PathBuf]) -> Option<Vec<Snapshot>> {
    let mut newest: Option<Vec<Snapshot>> = None;
    for path in files {
        let Ok(file) = fs::File::open(path) else {
            continue;
        };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if let Some(snapshots) = parse_line_windows(&line) {
                if newest
                    .as_ref()
                    .is_none_or(|current| snapshots[0].taken_at_ms > current[0].taken_at_ms)
                {
                    newest = Some(snapshots);
                }
            }
        }
    }
    newest
}

/// Extract the preferred rate-limit snapshot from one rollout line. Window
/// duration wins over the `primary`/`secondary` slot because Codex can put a
/// weekly-only limit in `primary`. Handles both nested and older flat layouts.
#[cfg(test)]
fn parse_line(line: &str) -> Option<Snapshot> {
    let windows = parse_line_windows(line)?;
    preferred_snapshot(&windows).cloned()
}

fn parse_line_windows(line: &str) -> Option<Vec<Snapshot>> {
    if !line.contains("rate_limits") {
        return None;
    }
    let value: Value = serde_json::from_str(line).ok()?;
    let ts = parse_rfc3339_ms(value.get("timestamp")?.as_str()?)?;

    let rate_limits = value
        .get("payload")
        .and_then(|p| p.get("rate_limits"))
        .or_else(|| value.get("rate_limits"))?;

    let mut windows = Vec::new();
    if let Some(window) = rate_limits.get("primary") {
        if let Some(snapshot) = parse_nested_window(window, ts, LimitWindow::FiveHour) {
            windows.push(snapshot);
        }
    }
    if let Some(window) = rate_limits.get("secondary") {
        if let Some(snapshot) = parse_nested_window(window, ts, LimitWindow::Weekly) {
            windows.push(snapshot);
        }
    }

    // Older rollouts flattened the two windows onto `rate_limits`.
    if windows.is_empty() {
        if let Some(snapshot) = parse_flat_window(rate_limits, "primary", ts, LimitWindow::FiveHour)
        {
            windows.push(snapshot);
        }
        if let Some(snapshot) = parse_flat_window(rate_limits, "secondary", ts, LimitWindow::Weekly)
        {
            windows.push(snapshot);
        }
    }

    windows.sort_by_key(|window| match window.limit_window {
        LimitWindow::FiveHour => 0,
        LimitWindow::Weekly => 1,
    });
    windows.dedup_by_key(|window| window.limit_window);
    (!windows.is_empty()).then_some(windows)
}

fn parse_nested_window(
    value: &Value,
    taken_at_ms: i64,
    default_window: LimitWindow,
) -> Option<Snapshot> {
    let used_percent = value.get("used_percent")?.as_f64()?;
    let window_minutes = value.get("window_minutes").and_then(Value::as_i64);
    let limit_window = match window_minutes {
        Some(300) => LimitWindow::FiveHour,
        Some(10_080) => LimitWindow::Weekly,
        _ => default_window,
    };

    Some(Snapshot {
        taken_at_ms,
        used_percent,
        reset_at_ms: parse_reset(value, taken_at_ms),
        limit_window,
    })
}

fn parse_flat_window(
    rate_limits: &Value,
    prefix: &str,
    taken_at_ms: i64,
    default_window: LimitWindow,
) -> Option<Snapshot> {
    let used_percent = rate_limits
        .get(format!("{prefix}_used_percent"))?
        .as_f64()?;
    let window_minutes = rate_limits
        .get(format!("{prefix}_window_minutes"))
        .and_then(Value::as_i64);
    let limit_window = match window_minutes {
        Some(300) => LimitWindow::FiveHour,
        Some(10_080) => LimitWindow::Weekly,
        _ => default_window,
    };
    let reset_at_ms = rate_limits
        .get(format!("{prefix}_resets_at"))
        .and_then(Value::as_i64)
        .and_then(epoch_to_ms)
        .or_else(|| {
            rate_limits
                .get(format!("{prefix}_reset_after_seconds"))
                .and_then(Value::as_i64)
                .and_then(|seconds| seconds.checked_mul(1_000))
                .and_then(|duration| taken_at_ms.checked_add(duration))
        });

    Some(Snapshot {
        taken_at_ms,
        used_percent,
        reset_at_ms,
        limit_window,
    })
}

fn parse_reset(value: &Value, taken_at_ms: i64) -> Option<i64> {
    value
        .get("resets_at")
        .and_then(Value::as_i64)
        .and_then(epoch_to_ms)
        .or_else(|| {
            value
                .get("resets_in_seconds")
                .and_then(Value::as_i64)
                .and_then(|seconds| seconds.checked_mul(1_000))
                .and_then(|duration| taken_at_ms.checked_add(duration))
        })
}

fn epoch_to_ms(timestamp: i64) -> Option<i64> {
    // Current Codex snapshots use epoch seconds. Tolerate milliseconds in
    // case the backend makes that unit explicit in a future format.
    if timestamp >= 1_000_000_000_000 {
        Some(timestamp)
    } else {
        timestamp.checked_mul(1_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const NESTED: &str = r#"{"timestamp":"2026-07-20T12:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":7.5,"window_minutes":300,"resets_in_seconds":9000},"secondary":{"used_percent":21.0,"window_minutes":10080}}}}"#;
    const WEEKLY_ONLY: &str = r#"{"timestamp":"2026-07-20T12:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":53.0,"window_minutes":10080,"resets_at":1785109319},"secondary":null}}}"#;
    const FLAT: &str = r#"{"timestamp":"2026-07-19T09:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary_used_percent":40.0,"primary_reset_after_seconds":1200}}}"#;

    #[test]
    fn parses_nested_layout() {
        let snap = parse_line(NESTED).unwrap();
        assert_eq!(snap.used_percent, 7.5);
        assert_eq!(snap.reset_at_ms, Some(1_784_557_800_000));
        assert_eq!(snap.limit_window, LimitWindow::FiveHour);
    }

    #[test]
    fn retains_both_nested_windows() {
        let windows = parse_line_windows(NESTED).unwrap();
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0].limit_window, LimitWindow::FiveHour);
        assert_eq!(windows[0].used_percent, 7.5);
        assert_eq!(windows[1].limit_window, LimitWindow::Weekly);
        assert_eq!(windows[1].used_percent, 21.0);
    }

    #[test]
    fn parses_flat_layout() {
        let snap = parse_line(FLAT).unwrap();
        assert_eq!(snap.used_percent, 40.0);
        assert_eq!(snap.reset_at_ms, Some(1_784_452_800_000));
        assert_eq!(snap.limit_window, LimitWindow::FiveHour);
    }

    #[test]
    fn falls_back_to_a_weekly_only_primary_window() {
        let snap = parse_line(WEEKLY_ONLY).unwrap();
        assert_eq!(snap.used_percent, 53.0);
        assert_eq!(snap.reset_at_ms, Some(1_785_109_319_000));
        assert_eq!(snap.limit_window, LimitWindow::Weekly);
    }

    #[test]
    fn prefers_five_hour_even_when_it_is_secondary() {
        let line = r#"{"timestamp":"2026-07-20T12:00:00Z","payload":{"rate_limits":{"primary":{"used_percent":60,"window_minutes":10080},"secondary":{"used_percent":25,"window_minutes":300}}}}"#;
        let snap = parse_line(line).unwrap();
        assert_eq!(snap.used_percent, 25.0);
        assert_eq!(snap.limit_window, LimitWindow::FiveHour);
    }

    #[test]
    fn picks_the_newest_snapshot_across_files() {
        let dir = std::env::temp_dir().join(format!("orbit-codex-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let old = dir.join("old.jsonl");
        let new = dir.join("new.jsonl");
        writeln!(fs::File::create(&old).unwrap(), "{FLAT}").unwrap();
        let mut f = fs::File::create(&new).unwrap();
        writeln!(f, "not json").unwrap();
        writeln!(f, "{NESTED}").unwrap();

        let snapshots = newest_snapshots(&[old, new]).unwrap();
        let snap = preferred_snapshot(&snapshots).unwrap();
        assert_eq!(snap.used_percent, 7.5);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ignores_lines_without_rate_limits() {
        assert!(parse_line(r#"{"timestamp":"2026-07-20T12:00:00Z","payload":{}}"#).is_none());
        assert!(parse_line("garbage").is_none());
    }
}
