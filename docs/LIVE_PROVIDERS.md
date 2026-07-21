# Live provider data — plan & status

Orbit shows **real** remaining usage from local provider sources. This document
records the current integrations and the rules every reader must follow.

## Principles

1. **Local-first.** Orbit reads files the tools already write and, where
   available, loopback-only services they expose on the user's machine. It
   never calls provider cloud APIs or scrapes web dashboards.
2. **Honest numbers.** If a value is computed against an estimated limit, it
   is marked `estimated` and surfaced as such in the UI. If nothing reliable
   is available, the provider reports `unavailable` with a reason.
3. **Read-only.** Provider readers never write to, lock, or modify another
   tool's data directory.
4. **Fail soft.** Missing directories, malformed lines, or format drift must
   degrade to `unavailable`, never crash or block the UI.

## Architecture

```
frontend (src/providers/*)            rust (src-tauri/src/usage/*)
────────────────────────────          ─────────────────────────────
ClaudeProvider ─┐                      claude.rs  — JSONL token sums
CodexProvider  ─┼─ invoke("get_live_usage", …) ─▶ codex.rs   — rate-limit snapshots
AntigravityProvider ─┘                 antigravity.rs — local language-server quota
```

Local parsing and probing live in Rust: the webview never gets filesystem or
process access, sensitive local details stay out of the frontend, and readers
are unit-tested with fixtures. The frontend providers fall back to
`unavailable` outside the desktop app.

## Claude Code — implemented (exact, via statusline bridge; falls back to estimated)

- **Primary source (exact):** Claude Code's statusline input already carries
  the real `rate_limits.five_hour` and `rate_limits.seven_day` percentages
  and reset times your account gets from the API — the same numbers Claude
  Code's own statusline renders. Nothing exposes this on disk by default, so
  Orbit's install adds
  a small, safe append to `~/.claude/statusline-command.sh` (see the
  `# --- Orbit bridge ---` block) that caches that JSON to
  `~/.claude/orbit-live-usage.json` on every render. `claude.rs` reads it
  and uses both windows as-is (`estimated: false`) as long as each window's
  own `resets_at` hasn't passed — stale windows are ignored independently.
  The five-hour window drives the ring and weekly appears as its quieter
  companion value. This requires an active/recent Claude Code session to have
  populated the cache; the bridge is additive and never changes the
  statusline's visible output.
- **Fallback source (estimated):** if the cache is missing or stale,
  `~/.claude/projects/**/*.jsonl` (plus `$CLAUDE_CONFIG_DIR` and
  `~/.config/claude` when present). Each assistant message line carries
  `message.usage` token counts and an RFC3339 `timestamp`; Orbit de-duplicates
  messages (`message.id` + `requestId`) and sums tokens over the rolling
  **5-hour window**, then computes remaining percentage against a
  **calibratable budget constant** (`CLAUDE_5H_TOKEN_BUDGET` in `claude.rs`,
  a deliberately generous community-informed default not tied to any real
  account data) — marked `estimated` since Anthropic doesn't publish
  per-plan token budgets.
- **Next steps:** if Anthropic ever writes this snapshot to disk directly,
  drop the statusline bridge in favor of reading it.

## OpenAI Codex — implemented (exact, but as-of last session)

- **Source:** `~/.codex/sessions/**/*.jsonl` (and `archived_sessions`).
  Codex CLI records `token_count` events that embed the backend's own
  `rate_limits` snapshot: `used_percent`, `window_minutes`, and either an
  absolute `resets_at` or relative `resets_in_seconds` reset.
- **Computation:** take the newest rate-limit event across recent files and
  retain both its **5-hour** (`300` minute) and **weekly** (`10,080` minute)
  windows. The five-hour value drives the ring when present; weekly is shown
  beside it and becomes the explicitly labeled fallback when no five-hour
  window exists. Remaining is `100 − used_percent`.
  This duration-based selection matters because a weekly-only limit can be
  stored in `primary`, with `secondary` empty. Both current nested and older
  flat field layouts are parsed.
- **The catch:** the number is exact but only as fresh as the last Codex
  session — Orbit reports the snapshot's own timestamp (`takenAt`) honestly.
- **Next steps:** watch for format drift and support additional named windows
  if Codex introduces them.

## Google Antigravity — implemented (exact, while the IDE is open)

- **Source:** Antigravity's running `language_server` exposes a loopback-only
  Connect RPC `RetrieveUserQuotaSummary` endpoint. It returns the same Gemini
  and Claude/GPT groups shown by the IDE, each with exact weekly and five-hour
  `remainingFraction` and `resetTime` buckets. Orbit discovers the process and
  listening port locally, authenticates with the process's CSRF token, and
  makes a read-only request to `127.0.0.1`. The older per-model
  `GetUserStatus` response remains as a compatibility fallback.
- **Computation:** retain every group and bucket for the overview selector;
  use the lowest remaining bucket as the group's ring value and the lowest
  bucket across all groups for history, notifications, and the tray panel. A
  five-hour bucket wins a percentage tie because it is the nearer operational
  limit. If an older account exposes only prompt credits, use their exact
  remaining fraction with an unknown reset.
- **Privacy:** Orbit never reads or stores Google OAuth credentials and never
  calls a Google endpoint itself. Antigravity must be open; otherwise the UI
  gives the actionable “Open Antigravity, then refresh” unavailable state.
- **Next steps:** retain the last exact snapshot while Antigravity is closed,
  bounded by its reset time, if users need an offline view.

## Testing

- Rust: fixture-based unit tests per parser (`cargo test` in `src-tauri`),
  covering happy paths, malformed lines, empty windows, and both Codex
  layouts.
- Frontend: providers keep returning `unavailable` in the browser; the
  store and UI treat `estimated` snapshots like any other (with a hint in
  Settings → Provider status).

## Risks

| Risk | Mitigation |
| --- | --- |
| Log formats drift with tool updates | tolerant parsers, fixture tests, fail-soft to `unavailable` |
| Claude budget constant is wrong for a plan | value is marked `estimated`; budget is one constant, future setting |
| Stale Codex data after days without sessions | snapshot timestamp reported as `takenAt`; UI shows freshness |
| Large log directories | only files modified within the relevant window are read |
| Antigravity local service changes | tolerant response parsing, short loopback timeouts, fail-soft unavailable state |
