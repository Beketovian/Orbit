//! Orbit's native shell: tray icon, window management, and plugins.
//!
//! All product logic lives in the frontend; this layer only provides
//! the native affordances a good menu-bar utility needs.

pub mod usage;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_positioner::{Position, WindowExt};

/// Read real usage for one provider from local files or loopback services
/// (see docs/LIVE_PROVIDERS.md). Runs on a blocking thread because readers
/// walk session logs and may briefly query a local process.
#[tauri::command]
async fn get_live_usage(provider: String) -> usage::LiveUsage {
    tauri::async_runtime::spawn_blocking(move || usage::fetch(&provider))
        .await
        .unwrap_or_else(|_| usage::LiveUsage::unavailable("Usage reader crashed."))
}

/// Show and focus the main window, optionally navigating to a section.
#[tauri::command]
fn open_main_window(app: AppHandle, section: Option<String>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(section) = section {
            let _ = app.emit_to("main", "orbit://navigate", section);
        }
    }
    // Opening the main window dismisses the transient panel.
    hide_panel(app);
}

/// Hide the floating tray panel.
#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
}

/// Toggle the floating panel, anchored to the tray icon.
fn toggle_panel(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window("panel") {
        if panel.is_visible().unwrap_or(false) {
            let _ = panel.hide();
        } else {
            let _ = panel.move_window(Position::TrayBottomCenter);
            let _ = panel.show();
            let _ = panel.set_focus();
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Orbit", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh Usage", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Orbit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &refresh, &separator, &quit])?;

    TrayIconBuilder::with_id("orbit-tray")
        .icon(app.default_window_icon().expect("bundled icon").clone())
        .icon_as_template(false)
        .tooltip("Orbit — remaining AI usage")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_main_window(app.clone(), None),
            "refresh" => {
                let _ = app.emit("orbit://refresh", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Keep the positioner informed so the panel can anchor to the tray.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_panel(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            open_main_window,
            hide_panel,
            get_live_usage
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The panel is transient: it dismisses when focus moves away.
            WindowEvent::Focused(false) if window.label() == "panel" => {
                let _ = window.hide();
            }
            // Closing the main window keeps Orbit alive in the tray.
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
