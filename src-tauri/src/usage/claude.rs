//! Claude Code usage from local session transcripts.
//!
//! Claude Code writes one JSONL file per session under
//! `~/.claude/projects/<project>/…jsonl`; each assistant message line
//! carries `message.usage` token counts and an RFC3339 `timestamp`.
//! Orbit sums the rolling 5-hour window (mirroring Claude's rate-limit
//! window) and reports remaining percentage against a calibratable
//! budget — clearly marked as an estimate, because Anthropic does not
//! publish per-plan token budgets.

use super::{collect_recent_jsonl, now_ms, parse_rfc3339_ms, LiveUsage};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

const WINDOW_MS: i64 = 5 * 60 * 60 * 1_000;

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
            }
        }
        _ => LiveUsage::Ok {
            // No activity in the current window: full budget available.
            percent_remaining: 100.0,
            reset_at_ms: None,
            taken_at_ms: now,
            estimated: true,
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
}
