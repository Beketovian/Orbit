//! Local, read-only usage readers for the live providers.
//!
//! Everything here follows the rules in `docs/LIVE_PROVIDERS.md`:
//! read-only access to local files and loopback services, honest
//! `Unavailable` results when nothing reliable exists, and estimates
//! clearly marked as such.

mod antigravity;
mod claude;
mod codex;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Mirror of the frontend `ProviderResult`, produced natively.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LimitWindow {
    FiveHour,
    Weekly,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageCategoryLimit {
    pub window: LimitWindow,
    pub percent_remaining: f64,
    pub reset_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageCategory {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub limits: Vec<UsageCategoryLimit>,
}

/// Mirror of the frontend `ProviderResult`, produced natively.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LiveUsage {
    #[serde(rename_all = "camelCase")]
    Ok {
        /// Remaining usage, 0–100.
        percent_remaining: f64,
        /// Epoch millis of the next reset, when known.
        reset_at_ms: Option<i64>,
        /// Epoch millis of when the underlying data was produced.
        taken_at_ms: i64,
        /// True when the value is computed against an estimated limit.
        estimated: bool,
        /// Which provider limit window this snapshot represents, when known.
        limit_window: Option<LimitWindow>,
        /// Every account-wide limit window exposed by the provider.
        limits: Option<Vec<UsageCategoryLimit>>,
        /// Provider-specific usage groups, when the source exposes them.
        usage_categories: Option<Vec<UsageCategory>>,
    },
    #[serde(rename_all = "camelCase")]
    Unavailable { reason: String },
}

impl LiveUsage {
    pub fn unavailable(reason: impl Into<String>) -> Self {
        LiveUsage::Unavailable {
            reason: reason.into(),
        }
    }
}

/// Entry point used by the `get_live_usage` Tauri command.
pub fn fetch(provider: &str) -> LiveUsage {
    match provider {
        "claude" => claude::fetch(),
        "codex" => codex::fetch(),
        "antigravity" => antigravity::fetch(),
        other => LiveUsage::unavailable(format!("Unknown provider \"{other}\".")),
    }
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as i64
}

pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Recursively collect `.jsonl` files modified after `min_mtime_ms`,
/// bounded so a huge log directory can't stall a refresh.
pub(crate) fn collect_recent_jsonl(
    dir: &Path,
    min_mtime_ms: i64,
    max_depth: usize,
    out: &mut Vec<PathBuf>,
) {
    if max_depth == 0 || out.len() >= 4096 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_recent_jsonl(&path, min_mtime_ms, max_depth - 1, out);
        } else if path.extension().is_some_and(|e| e == "jsonl") {
            let fresh = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .is_some_and(|d| d.as_millis() as i64 >= min_mtime_ms);
            if fresh {
                out.push(path);
            }
        }
    }
}

/// Parse an RFC3339 timestamp (`2026-07-20T09:15:00.123Z` or with a
/// numeric offset) into epoch milliseconds. Tolerant of missing
/// fractional seconds; returns `None` for anything else.
pub(crate) fn parse_rfc3339_ms(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20 {
        return None;
    }
    let num =
        |range: std::ops::Range<usize>| -> Option<i64> { value.get(range)?.parse::<i64>().ok() };
    let (year, month, day) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hour, min, sec) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut rest = &value[19..];
    let mut millis: i64 = 0;
    if let Some(stripped) = rest.strip_prefix('.') {
        let digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        let frac: i64 = digits.get(0..3.min(digits.len()))?.parse().ok()?;
        millis = match digits.len().min(3) {
            1 => frac * 100,
            2 => frac * 10,
            _ => frac,
        };
        rest = &stripped[digits.len()..];
    }
    let offset_min: i64 = match rest.chars().next() {
        Some('Z') | Some('z') => 0,
        Some(sign @ ('+' | '-')) => {
            let h: i64 = rest.get(1..3)?.parse().ok()?;
            let m: i64 = rest.get(4..6)?.parse().ok()?;
            let total = h * 60 + m;
            if sign == '-' {
                -total
            } else {
                total
            }
        }
        _ => return None,
    };

    // Days since Unix epoch (civil-from-days algorithm, Howard Hinnant).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    let secs = days * 86_400 + hour * 3_600 + min * 60 + sec - offset_min * 60;
    Some(secs * 1_000 + millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_variants() {
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339_ms("1970-01-02T00:00:00Z"), Some(86_400_000));
        assert_eq!(
            parse_rfc3339_ms("2026-07-20T12:30:45.500Z"),
            Some(1_784_550_645_500)
        );
        // Offset form: 12:00 at +02:00 is 10:00 UTC.
        assert_eq!(
            parse_rfc3339_ms("1970-01-01T12:00:00+02:00"),
            Some(10 * 3_600_000)
        );
        assert_eq!(parse_rfc3339_ms("not a date"), None);
        assert_eq!(parse_rfc3339_ms(""), None);
    }

    #[test]
    fn serializes_limit_window_for_the_frontend() {
        let value = serde_json::to_value(LiveUsage::Ok {
            percent_remaining: 47.0,
            reset_at_ms: Some(1_785_109_319_000),
            taken_at_ms: 1_784_588_800_000,
            estimated: false,
            limit_window: Some(LimitWindow::Weekly),
            limits: None,
            usage_categories: None,
        })
        .unwrap();

        assert_eq!(value["status"], "ok");
        assert_eq!(value["limitWindow"], "weekly");
        assert_eq!(value["resetAtMs"], 1_785_109_319_000_i64);
    }
}
