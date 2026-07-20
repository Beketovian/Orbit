//! OpenAI Codex usage from local session rollout files.
//!
//! Codex CLI writes rollout JSONL files under `~/.codex/sessions/…`.
//! Its `token_count` events embed the backend's own `rate_limits`
//! snapshot — `used_percent`, `window_minutes`, `resets_in_seconds` for
//! the primary (≈5 h) and secondary (weekly) windows. Orbit reports the
//! newest primary snapshot; the number is exact but only as fresh as
//! the last Codex session, so `taken_at` carries the snapshot's own
//! timestamp.

use super::{collect_recent_jsonl, now_ms, parse_rfc3339_ms, LiveUsage};
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

    match newest_snapshot(&files) {
        Some(snap) => LiveUsage::Ok {
            percent_remaining: (100.0 - snap.used_percent).clamp(0.0, 100.0).round(),
            reset_at_ms: snap.resets_in_seconds.map(|s| snap.taken_at_ms + s * 1_000),
            taken_at_ms: snap.taken_at_ms,
            estimated: false,
        },
        None => LiveUsage::unavailable("Recent Codex sessions contain no rate-limit snapshots."),
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct Snapshot {
    pub taken_at_ms: i64,
    pub used_percent: f64,
    pub resets_in_seconds: Option<i64>,
}

fn newest_snapshot(files: &[PathBuf]) -> Option<Snapshot> {
    let mut newest: Option<Snapshot> = None;
    for path in files {
        let Ok(file) = fs::File::open(path) else {
            continue;
        };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if let Some(snap) = parse_line(&line) {
                if newest
                    .as_ref()
                    .is_none_or(|n| snap.taken_at_ms > n.taken_at_ms)
                {
                    newest = Some(snap);
                }
            }
        }
    }
    newest
}

/// Extract the primary-window rate-limit snapshot from one rollout line.
/// Handles both the current nested layout
/// (`rate_limits.primary.used_percent`) and the older flat layout
/// (`rate_limits.primary_used_percent`).
pub(crate) fn parse_line(line: &str) -> Option<Snapshot> {
    if !line.contains("rate_limits") {
        return None;
    }
    let value: Value = serde_json::from_str(line).ok()?;
    let ts = parse_rfc3339_ms(value.get("timestamp")?.as_str()?)?;

    let rate_limits = value
        .get("payload")
        .and_then(|p| p.get("rate_limits"))
        .or_else(|| value.get("rate_limits"))?;

    let (used, resets) = if let Some(primary) = rate_limits.get("primary") {
        (
            primary.get("used_percent")?.as_f64()?,
            primary.get("resets_in_seconds").and_then(Value::as_i64),
        )
    } else {
        (
            rate_limits.get("primary_used_percent")?.as_f64()?,
            rate_limits
                .get("primary_reset_after_seconds")
                .and_then(Value::as_i64),
        )
    };

    Some(Snapshot {
        taken_at_ms: ts,
        used_percent: used,
        resets_in_seconds: resets,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const NESTED: &str = r#"{"timestamp":"2026-07-20T12:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":7.5,"window_minutes":300,"resets_in_seconds":9000},"secondary":{"used_percent":21.0,"window_minutes":10080}}}}"#;
    const FLAT: &str = r#"{"timestamp":"2026-07-19T09:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary_used_percent":40.0,"primary_reset_after_seconds":1200}}}"#;

    #[test]
    fn parses_nested_layout() {
        let snap = parse_line(NESTED).unwrap();
        assert_eq!(snap.used_percent, 7.5);
        assert_eq!(snap.resets_in_seconds, Some(9000));
    }

    #[test]
    fn parses_flat_layout() {
        let snap = parse_line(FLAT).unwrap();
        assert_eq!(snap.used_percent, 40.0);
        assert_eq!(snap.resets_in_seconds, Some(1200));
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

        let snap = newest_snapshot(&[old, new]).unwrap();
        assert_eq!(snap.used_percent, 7.5);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ignores_lines_without_rate_limits() {
        assert!(parse_line(r#"{"timestamp":"2026-07-20T12:00:00Z","payload":{}}"#).is_none());
        assert!(parse_line("garbage").is_none());
    }
}
