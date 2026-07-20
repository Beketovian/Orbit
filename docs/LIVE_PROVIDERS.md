# Live provider data — plan & status

Orbit's Demo Mode is the default experience. This document is the plan for
showing **real** remaining usage, and the rules every integration must follow.

## Principles

1. **Local-first.** Orbit only reads files the tools already write to the
   user's machine. It never phones home, never scrapes web dashboards, and
   never calls undocumented network APIs.
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
AntigravityProvider ─┘                 antigravity.rs — detection only (for now)
```

File parsing lives in Rust: the webview never gets filesystem permissions,
paths stay out of the frontend, and parsers are unit-tested with fixtures.
The frontend providers fall back to `unavailable` outside the desktop app.

## Claude Code — implemented (estimated)

- **Source:** `~/.claude/projects/**/*.jsonl` (plus `$CLAUDE_CONFIG_DIR` and
  `~/.config/claude` when present). Each assistant message line carries
  `message.usage` token counts and an RFC3339 `timestamp`.
- **Computation:** de-duplicate messages (`message.id` + `requestId`), sum
  input/output/cache tokens over the rolling **5-hour window** that mirrors
  Claude's rate-limit window, and derive the reset from when the oldest
  in-window activity ages out.
- **The catch:** Anthropic does not publish per-plan token budgets, so the
  remaining percentage is computed against a **calibratable budget constant**
  (`CLAUDE_5H_TOKEN_BUDGET` in `claude.rs`, a deliberately generous
  community-informed default) and the snapshot is marked `estimated`.
- **Next steps:** budget presets per plan (Pro / Max 5× / Max 20×) in
  Settings; auto-calibration from the highest observed 5-hour window;
  adopt an official usage endpoint the moment Anthropic documents one.

## OpenAI Codex — implemented (exact, but as-of last session)

- **Source:** `~/.codex/sessions/**/*.jsonl` (and `archived_sessions`).
  Codex CLI records `token_count` events that embed the backend's own
  `rate_limits` snapshot: `used_percent`, `window_minutes`,
  `resets_in_seconds` for the primary (≈5 h) and secondary (weekly) windows.
- **Computation:** take the newest snapshot across recent files; remaining =
  `100 − primary.used_percent`; reset = snapshot time + `resets_in_seconds`.
  Both current nested and older flat field layouts are parsed.
- **The catch:** the number is exact but only as fresh as the last Codex
  session — Orbit reports the snapshot's own timestamp (`takenAt`) honestly.
- **Next steps:** also surface the weekly window; watch for format drift.

## Google Antigravity — investigation

- **Status:** no known stable local artifact records remaining quota.
  Antigravity's editor state directories exist, but usage/quota data has not
  been located in a documented or stable form.
- **Current behavior:** the Rust probe detects whether Antigravity is
  installed and reports a tailored `unavailable` reason either way.
- **Next steps:** inspect state directories for a quota store as the product
  matures; adopt any official local file or API immediately.

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
