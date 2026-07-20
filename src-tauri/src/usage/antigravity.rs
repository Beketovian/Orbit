//! Google Antigravity — detection only, for now.
//!
//! No known stable local artifact records remaining Antigravity quota,
//! so this probe reports an honest unavailable state either way. See
//! docs/LIVE_PROVIDERS.md for the investigation plan.

use super::LiveUsage;
use std::path::PathBuf;

pub fn fetch() -> LiveUsage {
    let Some(home) = super::home_dir() else {
        return LiveUsage::unavailable("Could not resolve your home directory.");
    };

    let candidates: Vec<PathBuf> = vec![
        home.join(".antigravity"),
        home.join(".config").join("Antigravity"),
        home.join("Library")
            .join("Application Support")
            .join("Antigravity"),
        home.join("AppData").join("Roaming").join("Antigravity"),
    ];

    if candidates.iter().any(|p| p.is_dir()) {
        LiveUsage::unavailable(
            "Antigravity is installed, but it does not write usage data Orbit can read yet.",
        )
    } else {
        LiveUsage::unavailable("Antigravity was not found on this machine.")
    }
}
