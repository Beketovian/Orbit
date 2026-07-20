//! Ignored by default: exercises the real local readers on this
//! machine, whatever tools happen to be installed.
//!
//! Run with: `cargo test --test smoke -- --ignored --nocapture`

#[test]
#[ignore = "depends on local tool installations"]
fn read_real_local_usage() {
    for provider in ["claude", "codex", "antigravity"] {
        println!("{provider}: {:?}", orbit_lib::usage::fetch(provider));
    }
}
