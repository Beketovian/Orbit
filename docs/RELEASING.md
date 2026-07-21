# Releasing Orbit

## Local macOS package

From a clean checkout with Node.js and Rust installed:

```sh
npm ci
npm test
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run package:mac
```

The application and DMG are written beneath
`src-tauri/target/release/bundle/`. The repository defaults to ad-hoc signing
so local Apple Silicon builds are valid application bundles even when no Apple
Developer certificate is installed.

Ad-hoc signing does not provide public trust or notarization. A downloaded DMG
may still require approval in macOS Privacy & Security.

## Signed and notarized distribution

For a public macOS release, install a **Developer ID Application** certificate
and provide Tauri with:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` in CI
- either `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`, or App Store
  Connect API-key credentials for notarization

Tauri's current requirements are documented in its
[macOS code-signing guide](https://v2.tauri.app/distribute/sign/macos/).
Environment variables override the ad-hoc identity in `tauri.conf.json`.

## GitHub release

`.github/workflows/release.yml` builds a universal macOS application and DMG
when a tag matching `orbit-v*` is pushed. The workflow deliberately fails
before publishing unless the certificate variables and Apple ID notarization
variables above are configured as repository secrets.

```sh
git tag orbit-v0.1.0
git push origin orbit-v0.1.0
```

The workflow runs the frontend tests and then publishes the bundle assets to
the matching GitHub release.
