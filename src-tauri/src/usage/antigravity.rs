//! Google Antigravity usage from its local language server.
//!
//! While Antigravity is open, its language-server process exposes a
//! loopback-only Connect RPC endpoint containing the same grouped weekly and
//! five-hour quota buckets shown by the IDE. Orbit discovers that process,
//! reads only its local endpoint, and reports the most constrained active
//! bucket while retaining every group for UI selection. No Google credentials
//! are read or stored.

use super::{now_ms, parse_rfc3339_ms, LimitWindow, LiveUsage, UsageCategory, UsageCategoryLimit};
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Output};

const SERVICE_PREFIX: &str = "/exa.language_server_pb.LanguageServerService";
const QUOTA_SUMMARY_PATH: &str = "/RetrieveUserQuotaSummary";
const USER_STATUS_PATH: &str = "/GetUserStatus";
const REQUEST_BODY: &str =
    r#"{"metadata":{"ideName":"antigravity","extensionName":"antigravity","locale":"en"}}"#;

#[derive(Debug, PartialEq)]
struct LanguageServer {
    pid: u32,
    csrf_token: String,
    declared_ports: Vec<u16>,
}

#[derive(Clone, Debug, PartialEq)]
struct QuotaReading {
    percent_remaining: f64,
    reset_at_ms: Option<i64>,
    limit_window: Option<LimitWindow>,
}

#[derive(Debug, PartialEq)]
struct QuotaSummary {
    effective: QuotaReading,
    categories: Vec<UsageCategory>,
}

pub fn fetch() -> LiveUsage {
    let Some(home) = super::home_dir() else {
        return LiveUsage::unavailable("Could not resolve your home directory.");
    };
    let installed = installation_candidates(&home)
        .iter()
        .any(|path| path.exists());

    let Some(server) = detect_language_server() else {
        return if installed {
            LiveUsage::unavailable("Open Antigravity, then refresh to read its live model quota.")
        } else {
            LiveUsage::unavailable("Antigravity was not found on this machine.")
        };
    };

    let mut ports = discover_listening_ports(server.pid);
    for port in server.declared_ports {
        if port != 0 && !ports.contains(&port) {
            ports.push(port);
        }
    }
    if ports.is_empty() {
        return LiveUsage::unavailable(
            "Antigravity is open, but Orbit could not find its local usage service.",
        );
    }

    for port in ports {
        if let Some(summary) = request_connect(port, &server.csrf_token, QUOTA_SUMMARY_PATH)
            .as_ref()
            .and_then(parse_quota_summary)
        {
            return live_usage(summary.effective, Some(summary.categories));
        }

        // Antigravity 1.x exposed only per-model five-hour fractions. Keep
        // that path as a compatibility fallback when the 2.0 summary RPC is
        // absent or its response shape changes.
        if let Some(quota) = request_connect(port, &server.csrf_token, USER_STATUS_PATH)
            .as_ref()
            .and_then(parse_legacy_quota_response)
        {
            return live_usage(quota, None);
        }
    }

    LiveUsage::unavailable(
        "Antigravity is open, but its local service returned no model quota data.",
    )
}

fn live_usage(quota: QuotaReading, usage_categories: Option<Vec<UsageCategory>>) -> LiveUsage {
    LiveUsage::Ok {
        percent_remaining: quota.percent_remaining.clamp(0.0, 100.0).round(),
        reset_at_ms: quota.reset_at_ms,
        taken_at_ms: now_ms(),
        estimated: false,
        limit_window: quota.limit_window,
        limits: None,
        usage_categories,
    }
}

fn installation_candidates(home: &std::path::Path) -> Vec<PathBuf> {
    vec![
        home.join(".antigravity"),
        home.join(".config").join("Antigravity"),
        home.join(".config").join("antigravity"),
        home.join("Library")
            .join("Application Support")
            .join("Antigravity"),
        home.join("AppData").join("Roaming").join("Antigravity"),
        PathBuf::from("/Applications/Antigravity.app"),
    ]
}

#[cfg(unix)]
fn detect_language_server() -> Option<LanguageServer> {
    let output = Command::new("ps")
        .args(["ax", "-ww", "-o", "pid=,command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_process_line)
        .max_by_key(|server| (!server.csrf_token.is_empty(), server.declared_ports.len()))
}

#[cfg(not(unix))]
fn detect_language_server() -> Option<LanguageServer> {
    None
}

fn parse_process_line(line: &str) -> Option<LanguageServer> {
    let mut fields = line.trim().splitn(2, char::is_whitespace);
    let pid = fields.next()?.parse::<u32>().ok()?;
    let command = fields.next()?.trim();
    let lower = command.to_ascii_lowercase();
    if !lower.contains("antigravity")
        || !(lower.contains("language_server") || lower.contains("language-server"))
    {
        return None;
    }

    let csrf_token = extract_argument(command, "--csrf_token")?;
    let declared_ports = ["--https_server_port", "--extension_server_port"]
        .iter()
        .filter_map(|name| extract_argument(command, name))
        .filter_map(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .collect();

    Some(LanguageServer {
        pid,
        csrf_token,
        declared_ports,
    })
}

fn extract_argument(command: &str, name: &str) -> Option<String> {
    let with_equals = format!("{name}=");
    let mut args = command.split_whitespace();
    while let Some(arg) = args.next() {
        if arg == name {
            return args.next().map(trim_argument);
        }
        if let Some(value) = arg.strip_prefix(&with_equals) {
            return Some(trim_argument(value));
        }
    }
    None
}

fn trim_argument(value: &str) -> String {
    value
        .trim_matches(|character| character == '\'' || character == '"')
        .to_string()
}

#[cfg(unix)]
fn discover_listening_ports(pid: u32) -> Vec<u16> {
    let pid = pid.to_string();
    let args = ["-nP", "-a", "-p", pid.as_str(), "-iTCP", "-sTCP:LISTEN"];
    let Some(output) = first_available_output(&["/usr/sbin/lsof", "/usr/bin/lsof", "lsof"], &args)
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    parse_lsof_ports(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(unix))]
fn discover_listening_ports(_pid: u32) -> Vec<u16> {
    Vec::new()
}

fn parse_lsof_ports(output: &str) -> Vec<u16> {
    let mut ports = Vec::new();
    for line in output.lines().filter(|line| line.contains("(LISTEN)")) {
        for field in line.split_whitespace() {
            if !field.contains(':') {
                continue;
            }
            let Some(raw_port) = field.rsplit(':').next() else {
                continue;
            };
            let Ok(port) = raw_port.parse::<u16>() else {
                continue;
            };
            if port != 0 && !ports.contains(&port) {
                ports.push(port);
            }
        }
    }
    ports
}

fn first_available_output(programs: &[&str], args: &[&str]) -> Option<Output> {
    programs
        .iter()
        .find_map(|program| Command::new(program).args(args).output().ok())
}

fn request_connect(port: u16, csrf_token: &str, path: &str) -> Option<Value> {
    let port = port.to_string();
    for scheme in ["https", "http"] {
        let url = format!("{scheme}://127.0.0.1:{port}{SERVICE_PREFIX}{path}");
        let csrf_header = format!("X-Codeium-Csrf-Token: {csrf_token}");
        let args = [
            "--fail",
            "--silent",
            "--show-error",
            "--insecure",
            "--noproxy",
            "*",
            "--connect-timeout",
            "1",
            "--max-time",
            "4",
            "--request",
            "POST",
            "--header",
            "Accept: application/json",
            "--header",
            "Content-Type: application/json",
            "--header",
            "Connect-Protocol-Version: 1",
            "--header",
            &csrf_header,
            "--data",
            REQUEST_BODY,
            &url,
        ];
        let Some(output) =
            first_available_output(&["/usr/bin/curl", "/usr/local/bin/curl", "curl"], &args)
        else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        // Guard against a drifting endpoint returning an unexpectedly large body.
        if output.stdout.len() > 5 * 1024 * 1024 {
            continue;
        }
        if let Ok(value) = serde_json::from_slice(&output.stdout) {
            return Some(value);
        }
    }
    None
}

fn parse_quota_summary(response: &Value) -> Option<QuotaSummary> {
    let groups = response.get("response")?.get("groups")?.as_array()?;
    let mut categories = Vec::new();

    for group in groups {
        let name = group.get("displayName")?.as_str()?.trim();
        let buckets = group.get("buckets")?.as_array()?;
        let mut limits = Vec::new();
        for bucket in buckets {
            let Some(window) = bucket
                .get("window")
                .and_then(Value::as_str)
                .and_then(parse_limit_window)
            else {
                continue;
            };
            let Some(fraction) = bucket.get("remainingFraction").and_then(Value::as_f64) else {
                continue;
            };
            if !fraction.is_finite() {
                continue;
            }
            limits.push(UsageCategoryLimit {
                window,
                percent_remaining: (fraction.clamp(0.0, 1.0) * 100.0).round(),
                reset_at_ms: bucket
                    .get("resetTime")
                    .and_then(Value::as_str)
                    .and_then(parse_rfc3339_ms),
            });
        }
        if limits.is_empty() {
            continue;
        }
        limits.sort_by_key(|limit| match limit.window {
            LimitWindow::FiveHour => 0,
            LimitWindow::Weekly => 1,
        });
        categories.push(UsageCategory {
            id: group_id(group, name),
            name: name.to_string(),
            description: group
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_string),
            limits,
        });
    }

    let effective = categories
        .iter()
        .filter_map(|category| effective_limit(&category.limits))
        .map(reading_from_limit)
        .reduce(|current, candidate| {
            if is_more_constrained(&candidate, &current) {
                candidate
            } else {
                current
            }
        })?;

    Some(QuotaSummary {
        effective,
        categories,
    })
}

fn parse_limit_window(value: &str) -> Option<LimitWindow> {
    match value {
        "5h" | "fiveHour" | "five_hour" => Some(LimitWindow::FiveHour),
        "weekly" => Some(LimitWindow::Weekly),
        _ => None,
    }
}

fn group_id(group: &Value, name: &str) -> String {
    group
        .get("buckets")
        .and_then(Value::as_array)
        .and_then(|buckets| buckets.first())
        .and_then(|bucket| bucket.get("bucketId"))
        .and_then(Value::as_str)
        .and_then(|id| {
            id.strip_suffix("-weekly")
                .or_else(|| id.strip_suffix("-5h"))
        })
        .map(str::to_string)
        .unwrap_or_else(|| slugify(name))
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    slug.trim_end_matches('-').to_string()
}

fn effective_limit(limits: &[UsageCategoryLimit]) -> Option<&UsageCategoryLimit> {
    limits.iter().reduce(|current, candidate| {
        if is_limit_more_constrained(candidate, current) {
            candidate
        } else {
            current
        }
    })
}

fn reading_from_limit(limit: &UsageCategoryLimit) -> QuotaReading {
    QuotaReading {
        percent_remaining: limit.percent_remaining,
        reset_at_ms: limit.reset_at_ms,
        limit_window: Some(limit.window),
    }
}

fn is_limit_more_constrained(candidate: &UsageCategoryLimit, current: &UsageCategoryLimit) -> bool {
    is_more_constrained(&reading_from_limit(candidate), &reading_from_limit(current))
}

fn is_more_constrained(candidate: &QuotaReading, current: &QuotaReading) -> bool {
    if candidate.percent_remaining != current.percent_remaining {
        return candidate.percent_remaining < current.percent_remaining;
    }
    match (candidate.limit_window, current.limit_window) {
        (Some(LimitWindow::FiveHour), Some(LimitWindow::Weekly)) => true,
        (Some(LimitWindow::Weekly), Some(LimitWindow::FiveHour)) => false,
        _ => earlier_reset(candidate.reset_at_ms, current.reset_at_ms),
    }
}

fn parse_legacy_quota_response(response: &Value) -> Option<QuotaReading> {
    let status = response.get("userStatus").unwrap_or(response);
    let models = status
        .get("cascadeModelConfigData")
        .and_then(|data| data.get("clientModelConfigs"))
        .and_then(Value::as_array);

    let mut strictest: Option<QuotaReading> = None;
    if let Some(models) = models {
        for model in models {
            let Some(quota) = model.get("quotaInfo") else {
                continue;
            };
            let Some(fraction) = quota.get("remainingFraction").and_then(Value::as_f64) else {
                continue;
            };
            if !fraction.is_finite() {
                continue;
            }
            let reading = QuotaReading {
                percent_remaining: fraction.clamp(0.0, 1.0) * 100.0,
                reset_at_ms: quota
                    .get("resetTime")
                    .and_then(Value::as_str)
                    .and_then(parse_rfc3339_ms),
                limit_window: Some(LimitWindow::FiveHour),
            };
            let replace = strictest
                .as_ref()
                .is_none_or(|current| is_more_constrained(&reading, current));
            if replace {
                strictest = Some(reading);
            }
        }
    }
    if strictest.is_some() {
        return strictest;
    }

    // Some account types expose prompt credits but no model fractions. They
    // have no model reset timestamp, but remaining credit is still exact.
    let plan = status.get("planStatus")?;
    let available = plan.get("availablePromptCredits")?.as_f64()?;
    let monthly = plan
        .get("planInfo")?
        .get("monthlyPromptCredits")?
        .as_f64()?;
    (monthly > 0.0).then_some(QuotaReading {
        percent_remaining: (available / monthly).clamp(0.0, 1.0) * 100.0,
        reset_at_ms: None,
        limit_window: None,
    })
}

fn earlier_reset(candidate: Option<i64>, current: Option<i64>) -> bool {
    match (candidate, current) {
        (Some(candidate), Some(current)) => candidate < current,
        (Some(_), None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_language_server_process_and_declared_port() {
        let line = "8851 /Applications/Antigravity.app/Contents/Resources/bin/language_server --standalone --https_server_port=43123 --csrf_token secret-value";
        assert_eq!(
            parse_process_line(line),
            Some(LanguageServer {
                pid: 8851,
                csrf_token: "secret-value".into(),
                declared_ports: vec![43123],
            })
        );
    }

    #[test]
    fn parses_unique_listening_ports() {
        let output = "language 8851 user 10u IPv4 0 0t0 TCP 127.0.0.1:43123 (LISTEN)\n\
                      language 8851 user 11u IPv6 0 0t0 TCP *:43123 (LISTEN)\n\
                      language 8851 user 12u IPv4 0 0t0 TCP 127.0.0.1:43124 (LISTEN)";
        assert_eq!(parse_lsof_ports(output), vec![43123, 43124]);
    }

    #[test]
    fn selects_the_most_constrained_model_quota() {
        let response: Value = serde_json::from_str(
            r#"{"userStatus":{"cascadeModelConfigData":{"clientModelConfigs":[
                {"quotaInfo":{"remainingFraction":0.8,"resetTime":"2026-07-21T03:00:00Z"}},
                {"quotaInfo":{"remainingFraction":0.35,"resetTime":"2026-07-21T04:00:00Z"}},
                {"quotaInfo":{"remainingFraction":0.6,"resetTime":"2026-07-21T02:00:00Z"}}
            ]}}}"#,
        )
        .unwrap();
        assert_eq!(
            parse_legacy_quota_response(&response),
            Some(QuotaReading {
                percent_remaining: 35.0,
                reset_at_ms: parse_rfc3339_ms("2026-07-21T04:00:00Z"),
                limit_window: Some(LimitWindow::FiveHour),
            })
        );
    }

    #[test]
    fn parses_grouped_weekly_and_five_hour_limits() {
        let response: Value = serde_json::from_str(
            r#"{"response":{"groups":[
                {"displayName":"Gemini Models","description":"Gemini Flash, Gemini Pro","buckets":[
                    {"bucketId":"gemini-weekly","window":"weekly","remainingFraction":1,"resetTime":"2026-07-27T22:49:05Z"},
                    {"bucketId":"gemini-5h","window":"5h","remainingFraction":1,"resetTime":"2026-07-21T03:49:05Z"}
                ]},
                {"displayName":"Claude and GPT models","description":"Claude Opus, Claude Sonnet, GPT-OSS","buckets":[
                    {"bucketId":"3p-weekly","window":"weekly","remainingFraction":0.8647133,"resetTime":"2026-07-27T07:05:58Z"},
                    {"bucketId":"3p-5h","window":"5h","remainingFraction":1,"resetTime":"2026-07-21T03:49:05Z"}
                ]}
            ]}}"#,
        )
        .unwrap();

        let summary = parse_quota_summary(&response).unwrap();
        assert_eq!(summary.categories.len(), 2);
        assert_eq!(summary.categories[0].id, "gemini");
        assert_eq!(
            summary.categories[0].limits[0].window,
            LimitWindow::FiveHour
        );
        assert_eq!(summary.categories[1].id, "3p");
        assert_eq!(summary.categories[1].limits[1].percent_remaining, 86.0);
        assert_eq!(summary.effective.percent_remaining, 86.0);
        assert_eq!(summary.effective.limit_window, Some(LimitWindow::Weekly));
        assert_eq!(
            summary.effective.reset_at_ms,
            parse_rfc3339_ms("2026-07-27T07:05:58Z")
        );
    }

    #[test]
    fn falls_back_to_prompt_credits_when_models_are_absent() {
        let response: Value = serde_json::from_str(
            r#"{"userStatus":{"planStatus":{"availablePromptCredits":500,"planInfo":{"monthlyPromptCredits":50000}}}}"#,
        )
        .unwrap();
        assert_eq!(
            parse_legacy_quota_response(&response),
            Some(QuotaReading {
                percent_remaining: 1.0,
                reset_at_ms: None,
                limit_window: None,
            })
        );
    }
}
