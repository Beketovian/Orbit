# Adding another provider

Orbit treats an integration as a usage-data adapter, not as a logo plus a
scraped percentage. A provider is ready only when it has a reliable source,
clear quota semantics, a fail-soft implementation, and fixture-backed tests.

## 1. Choose an acceptable source

Use the first source the product actually exposes:

1. **Documented local state** — structured session logs, a cache, or a local
   database the provider already maintains.
2. **Documented loopback service** — a read-only endpoint exposed on
   `127.0.0.1` by a running desktop client.
3. **Official cloud API** — only with explicit user opt-in and the narrowest
   read-only credential the provider supports.
4. **Estimated local usage** — only when the consumed amount and a defensible
   budget are known; set `estimated: true` and document the assumption.
5. **Unavailable** — the correct result when none of the above exists.

Do not scrape a web dashboard, reuse browser cookies, copy another app's OAuth
tokens, or silently send local data to a third party. Never turn token counts
into a percentage without a documented or user-configured denominator.

## 2. Map the provider into Orbit's domain

Every successful reading ultimately becomes a `UsageSnapshot`:

- `percentRemaining`: normalized to `0–100`.
- `reset`: an absolute epoch time when known, otherwise `unknown`.
- `takenAt`: the source timestamp, not merely the refresh time.
- `estimated`: true whenever Orbit inferred the budget or limit.
- `limitWindow`: `fiveHour` or `weekly` for the number driving the ring.
- `limits`: account-wide windows such as a five-hour and weekly pair.
- `usageCategories`: model families when the provider meters groups
  independently.

The ring prefers a five-hour window and falls back to weekly. For a provider
with model categories, keep every category and use the most constrained
category for history and notifications. Do not force spend, credits, requests,
and rate limits into the same UI unless they can be represented honestly.

## 3. Implement the adapter

The current registry is intentionally explicit. Adding an ID will make the
TypeScript compiler identify most of the places that need a decision.

1. Add the ID and display metadata in `src/types/usage.ts`.
2. Add a small frontend provider in `src/providers/` and register it in
   `src/providers/index.ts`.
3. Add the native reader in `src-tauri/src/usage/<provider>.rs`, register the
   module and match arm in `src-tauri/src/usage/mod.rs`, and return
   `LiveUsage::Unavailable` for missing, stale, or malformed sources.
4. Add the provider's visual tokens in `src/styles/tokens.css`, its ring
   gradient in `src/components/UsageRing.tsx`, and its restrained card tint in
   `src/components/ProviderCard.module.css`.
5. Update any fixed provider collections in panel, overview, history,
   notification, and persistence tests.
6. Document the source, freshness, privacy boundary, and failure behavior in
   `docs/LIVE_PROVIDERS.md`.

If a cloud API requires a secret, add an explicit setup flow and store the
credential in the OS keychain. Do not put secrets in `orbit.json`, source
control, logs, test fixtures, or frontend state.

## 4. Provider-specific feasibility examples

### Cursor

Cursor's individual plans expose usage and token breakdowns in its dashboard
and limit notifications in the editor. Its documented Admin API exposes team
usage, spend, and event data to team administrators, but the public docs do not
currently describe a read-only individual “remaining quota” endpoint.

That leads to two honest implementation options:

- Prefer a documented local client artifact if Cursor exposes one containing
  the actual quota and reset.
- For Teams, offer an opt-in Admin API integration using a user-supplied key,
  label it as team usage/spend, and derive “remaining” only when the applicable
  team limit is also returned or explicitly configured.

Do not automate `cursor.com/dashboard` or reuse the editor's session tokens.
See Cursor's [models and pricing](https://docs.cursor.com/account/pricing) and
[Admin API](https://docs.cursor.com/en/account/teams/admin-api) documentation.

### Grok and the xAI API

Treat consumer Grok subscriptions and xAI API billing as different products.
The xAI Management API provides billing oversight, usage data, prepaid credit
information, and postpaid spending limits. An xAI API integration should use a
separate, user-supplied management key, keep it in the OS keychain, and display
credits or monthly spend with their real units. The xAI console also exposes a
Usage Explorer for team administrators.

If the consumer Grok app does not expose a documented local source or official
quota API, report it as unavailable rather than estimating from conversation
counts. See xAI's
[Management API](https://docs.x.ai/developers/rest-api-reference/management),
[billing endpoints](https://docs.x.ai/developers/rest-api-reference/management/billing),
and [Usage Explorer](https://docs.x.ai/console/usage).

## 5. Definition of done

- Parser tests cover every supported layout, stale data, malformed input, and
  missing installations.
- Frontend tests cover fallback windows, categories, and unavailable states.
- The live smoke test succeeds on a machine with the provider installed.
- No credential, token, raw prompt, or private path is returned to the
  frontend or written to logs.
- `npm test`, `npm run typecheck`, `npm run build`, `cargo test`,
  `cargo fmt --check`, and `cargo clippy --all-targets -- -D warnings` pass.
