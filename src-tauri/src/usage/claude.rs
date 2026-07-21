//! Claude Code usage from local session transcripts.
//!
//! Claude Code writes one JSONL file per session under
//! `~/.claude/projects/<project>/…jsonl`; each assistant message line
//! carries `message.usage` token counts and an RFC3339 `timestamp`.
//! Orbit sums the rolling 5-hour window (mirroring Claude's rate-limit
//! window) and reports remaining percentage against a calibratable
//! budget — clearly marked as an estimate, because Anthropic does not
//! publish per-plan token budgets.

use super::{
    collect_recent_jsonl, now_ms, parse_rfc3339_ms, LimitWindow, LiveUsage, UsageCategoryLimit,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

const WINDOW_MS: i64 = 5 * 60 * 60 * 1_000;

/// Filename Orbit's statusline bridge (see `docs/LIVE_PROVIDERS.md`) writes
/// the exact rate-limit snapshot to, alongside the `projects` directory.
const LIVE_CACHE_FILE: &str = "orbit-live-usage.json";

#[derive(Deserialize)]
struct RateWindow {
    used_percentage: Option<f64>,
    /// Epoch seconds, matching Claude Code's own statusline field.
    resets_at: Option<i64>,
}

#[derive(Deserialize)]
struct LiveCache {
    five_hour: Option<RateWindow>,
    seven_day: Option<RateWindow>,
    written_at_ms: i64,
}

struct LiveCacheReading {
    limits: Vec<UsageCategoryLimit>,
    taken_at_ms: i64,
}

/// Read the exact rate-limit windows cached by the statusline bridge. Each
/// window is validated against its own reset so a freshly cached weekly
/// value can survive an expired five-hour value without showing stale data.
fn cache_limit(
    rate_window: Option<RateWindow>,
    window: LimitWindow,
    now: i64,
) -> Option<UsageCategoryLimit> {
    let rate_window = rate_window?;
    let used = rate_window.used_percentage?;
    let reset_at_ms = rate_window.resets_at.map(|seconds| seconds * 1_000);
    reset_at_ms
        .is_some_and(|reset| reset > now)
        .then_some(UsageCategoryLimit {
            window,
            percent_remaining: (100.0 - used).clamp(0.0, 100.0).round(),
            reset_at_ms,
        })
}

fn read_live_cache(roots: &[PathBuf], now: i64) -> Option<LiveCacheReading> {
    for root in roots {
        let path = root.parent()?.join(LIVE_CACHE_FILE);
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(cache) = serde_json::from_str::<LiveCache>(&text) else {
            continue;
        };
        let mut limits = [
            cache_limit(cache.five_hour, LimitWindow::FiveHour, now),
            cache_limit(cache.seven_day, LimitWindow::Weekly, now),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
        if !limits.is_empty() {
            limits.sort_by_key(|limit| match limit.window {
                LimitWindow::FiveHour => 0,
                LimitWindow::Weekly => 1,
            });
            return Some(LiveCacheReading {
                limits,
                taken_at_ms: cache.written_at_ms,
            });
        }
    }
    None
}

/// Rough 5-hour token budget used to turn a token sum into a remaining
/// percentage. Anthropic publishes no per-plan budget, so this is a
/// deliberately generous community-informed default (all token kinds,
/// cache reads included). Tune per plan; see docs/LIVE_PROVIDERS.md.
const CLAUDE_5H_TOKEN_BUDGET: f64 = 60_000_000.0;

pub fn fetch() -> LiveUsage {
    let Some(roots) = config_roots() else {
        return LiveUsage::unavailable("Could not resolve your home directory.");
    };
    let existing: Vec<PathBuf> = roots.into_iter().filter(|p| p.is_dir()).collect();
    if existing.is_empty() {
        return LiveUsage::unavailable(
            "Claude Code data not found (~/.claude). Is Claude Code installed?",
        );
    }

    let now = now_ms();

    // Prefer the exact snapshot from the statusline bridge when it still
    // describes the current window — no guessing at a token budget.
    if let Some(cache) = read_live_cache(&existing, now) {
        let primary = cache
            .limits
            .iter()
            .find(|limit| limit.window == LimitWindow::FiveHour)
            .or_else(|| cache.limits.first())
            .expect("a live cache reading always contains a limit");
        let (percent_remaining, reset_at_ms, limit_window) = (
            primary.percent_remaining,
            primary.reset_at_ms,
            primary.window,
        );
        return LiveUsage::Ok {
            percent_remaining,
            reset_at_ms,
            taken_at_ms: cache.taken_at_ms,
            estimated: false,
            limit_window: Some(limit_window),
            limits: Some(cache.limits),
            usage_categories: None,
        };
    }

    let mut files = Vec::new();
    for root in &existing {
        collect_recent_jsonl(root, now - WINDOW_MS, 6, &mut files);
    }

    let usage = sum_window(&files, now);
    match usage {
        Some(window) if window.total_tokens > 0 => {
            let remaining = (100.0 * (1.0 - window.total_tokens as f64 / CLAUDE_5H_TOKEN_BUDGET))
                .clamp(0.0, 100.0);
            LiveUsage::Ok {
                percent_remaining: remaining.round(),
                // The window slides: the oldest in-window activity ages out
                // five hours after it happened.
                reset_at_ms: window.oldest_ms.map(|t| t + WINDOW_MS),
                taken_at_ms: now,
                estimated: true,
                limit_window: Some(LimitWindow::FiveHour),
                limits: Some(vec![UsageCategoryLimit {
                    window: LimitWindow::FiveHour,
                    percent_remaining: remaining.round(),
                    reset_at_ms: window.oldest_ms.map(|t| t + WINDOW_MS),
                }]),
                usage_categories: None,
            }
        }
        _ => LiveUsage::Ok {
            // No activity in the current window: full budget available.
            percent_remaining: 100.0,
            reset_at_ms: None,
            taken_at_ms: now,
            estimated: true,
            limit_window: Some(LimitWindow::FiveHour),
            limits: Some(vec![UsageCategoryLimit {
                window: LimitWindow::FiveHour,
                percent_remaining: 100.0,
                reset_at_ms: None,
            }]),
            usage_categories: None,
        },
    }
}

fn config_roots() -> Option<Vec<PathBuf>> {
    let mut roots = Vec::new();
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        roots.push(PathBuf::from(dir).join("projects"));
    }
    let home = super::home_dir()?;
    roots.push(home.join(".claude").join("projects"));
    roots.push(home.join(".config").join("claude").join("projects"));
    Some(roots)
}

struct WindowSum {
    total_tokens: u64,
    oldest_ms: Option<i64>,
}

/// Sum de-duplicated assistant-message tokens with timestamps inside
/// the rolling window ending at `now`.
fn sum_window(files: &[PathBuf], now: i64) -> Option<WindowSum> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut total: u64 = 0;
    let mut oldest: Option<i64> = None;

    for path in files {
        let Ok(file) = fs::File::open(path) else {
            continue;
        };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if let Some((ts, tokens, key)) = parse_line(&line) {
                if ts < now - WINDOW_MS || ts > now {
                    continue;
                }
                if let Some(key) = key {
                    if !seen.insert(key) {
                        continue; // retried/duplicated message
                    }
                }
                total += tokens;
                oldest = Some(oldest.map_or(ts, |o: i64| o.min(ts)));
            }
        }
    }

    Some(WindowSum {
        total_tokens: total,
        oldest_ms: oldest,
    })
}

/// Extract (timestamp, token total, dedupe key) from one transcript line.
fn parse_line(line: &str) -> Option<(i64, u64, Option<String>)> {
    // Cheap pre-filter before paying for JSON parsing.
    if !line.contains("\"usage\"") || !line.contains("\"timestamp\"") {
        return None;
    }
    let value: Value = serde_json::from_str(line).ok()?;
    let ts = parse_rfc3339_ms(value.get("timestamp")?.as_str()?)?;
    let usage = value.get("message")?.get("usage")?;

    let token = |name: &str| usage.get(name).and_then(Value::as_u64).unwrap_or(0);
    let total = token("input_tokens")
        + token("output_tokens")
        + token("cache_creation_input_tokens")
        + token("cache_read_input_tokens");
    if total == 0 {
        return None;
    }

    let message_id = value
        .get("message")
        .and_then(|m| m.get("id"))
        .and_then(Value::as_str);
    let request_id = value.get("requestId").and_then(Value::as_str);
    let key = match (message_id, request_id) {
        (Some(m), Some(r)) => Some(format!("{m}:{r}")),
        (Some(m), None) => Some(m.to_string()),
        _ => None,
    };

    Some((ts, total, key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn line(ts: &str, id: &str, req: &str, input: u64, output: u64) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{ts}","requestId":"{req}","message":{{"id":"{id}","usage":{{"input_tokens":{input},"output_tokens":{output},"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}}}}"#
        )
    }

    #[test]
    fn sums_window_and_dedupes() {
        let dir = std::env::temp_dir().join(format!("orbit-claude-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("session.jsonl");
        let mut f = fs::File::create(&path).unwrap();
        // In-window, duplicated (same message id + request id), and stale lines.
        writeln!(f, "{}", line("2026-07-20T11:00:00Z", "m1", "r1", 1000, 200)).unwrap();
        writeln!(f, "{}", line("2026-07-20T11:00:00Z", "m1", "r1", 1000, 200)).unwrap();
        writeln!(f, "{}", line("2026-07-20T12:00:00Z", "m2", "r2", 500, 100)).unwrap();
        writeln!(f, "{}", line("2026-07-20T01:00:00Z", "m3", "r3", 9999, 1)).unwrap();
        writeln!(f, "not json at all").unwrap();

        let now = parse_rfc3339_ms("2026-07-20T13:00:00Z").unwrap();
        let sum = sum_window(std::slice::from_ref(&path), now).unwrap();
        assert_eq!(sum.total_tokens, 1000 + 200 + 500 + 100);
        assert_eq!(sum.oldest_ms, parse_rfc3339_ms("2026-07-20T11:00:00Z"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ignores_lines_without_usage() {
        assert!(parse_line(r#"{"type":"user","timestamp":"2026-07-20T11:00:00Z"}"#).is_none());
        assert!(parse_line("garbage").is_none());
    }

    fn cache_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "orbit-claude-cache-test-{name}-{}",
            std::process::id()
        ));
        fs::create_dir_all(dir.join("projects")).unwrap();
        dir
    }

    #[test]
    fn prefers_live_cache_within_its_window() {
        let dir = cache_dir("fresh");
        let now = parse_rfc3339_ms("2026-07-20T13:00:00Z").unwrap();
        let resets_at_s = (now + 60 * 60 * 1_000) / 1_000; // resets in 1h, still current
        fs::write(
            dir.join(LIVE_CACHE_FILE),
            format!(
                r#"{{"five_hour":{{"used_percentage":51,"resets_at":{resets_at_s}}},"written_at_ms":{now}}}"#
            ),
        )
        .unwrap();

        let roots = vec![dir.join("projects")];
        let cached = read_live_cache(&roots, now).unwrap();
        assert_eq!(cached.taken_at_ms, now);
        assert_eq!(cached.limits.len(), 1);
        assert_eq!(cached.limits[0].window, LimitWindow::FiveHour);
        assert_eq!(cached.limits[0].percent_remaining, 49.0);
        assert_eq!(cached.limits[0].reset_at_ms, Some(resets_at_s * 1_000));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ignores_live_cache_once_its_window_has_reset() {
        let dir = cache_dir("stale");
        let written_at = parse_rfc3339_ms("2026-07-20T01:00:00Z").unwrap();
        let resets_at_s = (written_at + 60 * 60 * 1_000) / 1_000; // long since reset by "now"
        fs::write(
            dir.join(LIVE_CACHE_FILE),
            format!(
                r#"{{"five_hour":{{"used_percentage":51,"resets_at":{resets_at_s}}},"written_at_ms":{written_at}}}"#
            ),
        )
        .unwrap();

        let now = parse_rfc3339_ms("2026-07-20T13:00:00Z").unwrap();
        let roots = vec![dir.join("projects")];
        assert!(read_live_cache(&roots, now).is_none());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_five_hour_and_weekly_cache_windows() {
        let dir = cache_dir("both-windows");
        let now = parse_rfc3339_ms("2026-07-20T13:00:00Z").unwrap();
        let five_reset = (now + 2 * 60 * 60 * 1_000) / 1_000;
        let weekly_reset = (now + 6 * 24 * 60 * 60 * 1_000) / 1_000;
        fs::write(
            dir.join(LIVE_CACHE_FILE),
            format!(
                r#"{{"five_hour":{{"used_percentage":71,"resets_at":{five_reset}}},"seven_day":{{"used_percentage":7,"resets_at":{weekly_reset}}},"written_at_ms":{now}}}"#
            ),
        )
        .unwrap();

        let cached = read_live_cache(&[dir.join("projects")], now).unwrap();
        assert_eq!(cached.limits.len(), 2);
        assert_eq!(cached.limits[0].window, LimitWindow::FiveHour);
        assert_eq!(cached.limits[0].percent_remaining, 29.0);
        assert_eq!(cached.limits[1].window, LimitWindow::Weekly);
        assert_eq!(cached.limits[1].percent_remaining, 93.0);

        fs::remove_dir_all(&dir).ok();
    }
}
