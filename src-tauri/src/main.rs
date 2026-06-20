#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod discord;
mod minecraft;
mod server;

use minecraft::auth::{self, AuthAccount, AuthState};
use minecraft::{
    BedrockVersionInfo, DragonVersionInfo, FabricVersionInfo, ForgeVersionInfo, LaunchOptions,
    MinecraftLauncher, QuiltVersionInfo, VersionInfo,
};
use server::{MinecraftServer, ServerManager};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

// Global flag to prevent multiple launches
static IS_LAUNCHING: AtomicBool = AtomicBool::new(false);

struct AppState {
    launcher: Arc<Mutex<MinecraftLauncher>>,
    auth_state: Arc<Mutex<AuthState>>,
    server_manager: Arc<Mutex<ServerManager>>,
}

#[cfg(target_os = "macos")]
fn apply_platform_main_window_frame(window: &tauri::WebviewWindow) {
    use tauri::LogicalSize;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let scale_factor = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_width = monitor_size.width as f64 / scale_factor;
    let monitor_height = monitor_size.height as f64 / scale_factor;

    // Keep a little more desktop visible so the window feels like a native
    // Mac app instead of sitting too tall edge-to-edge.
    let target_width = (monitor_width * 0.965).clamp(1320.0, 1720.0);
    let target_height = (monitor_height * 0.8).clamp(720.0, 860.0);

    let _ = window.set_size(LogicalSize::new(target_width, target_height));
    let _ = window.center();
}

#[cfg(not(target_os = "macos"))]
fn apply_platform_main_window_frame(_window: &tauri::WebviewWindow) {}

fn looks_like_modded_version(version_id: &str) -> bool {
    let lower = version_id.to_ascii_lowercase();
    lower.starts_with("dragon-")
        || lower.starts_with("lapetus-")
        || lower.starts_with("fabric-loader-")
        || lower.starts_with("quilt-loader-")
        || lower.contains("forge")
}

fn ends_with_ignore_ascii_case(value: &str, suffix: &str) -> bool {
    value
        .to_ascii_lowercase()
        .ends_with(&suffix.to_ascii_lowercase())
}

fn is_numeric_version_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment.contains('.')
        && segment.chars().all(|c| c.is_ascii_digit() || c == '.')
}

fn extract_mc_version_from_id(version_id: &str) -> String {
    let lower = version_id.to_ascii_lowercase();

    if lower.starts_with("fabric-loader-")
        || lower.starts_with("quilt-loader-")
        || lower.starts_with("lapetus-")
    {
        return version_id
            .rsplit('-')
            .next()
            .unwrap_or(version_id)
            .to_string();
    }

    if lower.starts_with("dragon-client-") {
        let parts: Vec<&str> = version_id.split('-').collect();
        if parts.len() >= 3 && is_numeric_version_segment(parts[2]) {
            return parts[2].to_string();
        }
        return version_id
            .rsplit('-')
            .next()
            .unwrap_or(version_id)
            .to_string();
    }

    if lower.starts_with("dragon-") {
        return version_id
            .strip_prefix("dragon-")
            .unwrap_or(version_id)
            .to_string();
    }

    if lower.starts_with("forge-") {
        let parts: Vec<&str> = version_id.split('-').collect();
        if parts.len() >= 2 {
            return parts[1].to_string();
        }
        return version_id.to_string();
    }

    if let Some(index) = lower.find("-forge") {
        return version_id[..index].to_string();
    }

    if let Some(segment) = version_id
        .split('-')
        .rev()
        .find(|segment| is_numeric_version_segment(segment))
    {
        return segment.to_string();
    }

    version_id.to_string()
}

fn strip_mod_file_suffix(name: &str) -> String {
    if ends_with_ignore_ascii_case(name, ".jar.disabled") {
        return name[..name.len() - ".jar.disabled".len()].to_string();
    }
    if ends_with_ignore_ascii_case(name, ".jar") {
        return name[..name.len() - ".jar".len()].to_string();
    }
    name.to_string()
}

fn strip_inline_toml_comment(value: &str) -> &str {
    let mut in_single_quotes = false;
    let mut in_double_quotes = false;
    let mut escaped = false;

    for (index, ch) in value.char_indices() {
        match ch {
            '\\' if in_double_quotes => {
                escaped = !escaped;
                continue;
            }
            '"' if !in_single_quotes && !escaped => {
                in_double_quotes = !in_double_quotes;
            }
            '\'' if !in_double_quotes => {
                in_single_quotes = !in_single_quotes;
            }
            '#' if !in_single_quotes && !in_double_quotes => {
                return value[..index].trim_end();
            }
            _ => {}
        }

        escaped = false;
    }

    value.trim_end()
}

fn sanitize_mod_metadata_value(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'').trim();

    if trimmed.is_empty() {
        return None;
    }

    if trimmed.contains("${") && trimmed.contains('}') {
        return None;
    }

    Some(trimmed.to_string())
}

fn parse_toml_assignment_value(line: &str) -> Option<String> {
    let (_, raw_value) = line.split_once('=')?;
    let without_comment = strip_inline_toml_comment(raw_value).trim();
    sanitize_mod_metadata_value(without_comment)
}

fn run_command_output_hidden(
    cmd: &mut std::process::Command,
) -> std::io::Result<std::process::Output> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.output()
}

#[tauri::command]
async fn get_versions(state: State<'_, AppState>) -> Result<Vec<VersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_versions().await
}

#[tauri::command]
async fn get_installed_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_versions()
}

#[tauri::command]
async fn get_minecraft_dir(state: State<'_, AppState>) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    Ok(launcher.game_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn install_version(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_version(&version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn launch_game(
    version_id: String,
    username: String,
    uuid: Option<String>,
    access_token: Option<String>,
    oder_id: Option<String>,
    tier: Option<String>,
    dragon_mod_source: Option<String>,
    cursor_image_base64: Option<String>,
    pointer_image_base64: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Prevent multiple simultaneous launches
    if IS_LAUNCHING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Game is already launching. Please wait.".to_string());
    }

    // Helper to emit to all windows (main + game console)
    let emit_log = |app: &tauri::AppHandle, line: &str| {
        let _ = app.emit(
            "game-log",
            serde_json::json!({
                "line": line
            }),
        );
    };

    let app_clone = app.clone();
    let result = async {
        // Refresh Microsoft token if needed (for online play)
        let mut updated_access_token = access_token.clone();
        if access_token.is_some() && uuid.is_some() {
            let mut auth_state = state.auth_state.lock().await;
            let mut token_refreshed = false;
            
            if let Some(account_uuid) = &uuid {
                if let Some(account) = auth_state.accounts.iter_mut().find(|a| &a.uuid == account_uuid) {
                    if !account.is_offline {
                        emit_log(&app_clone, "[AUTH] Checking Microsoft token...");
                        match auth::refresh_token_if_needed(account).await {
                            Ok(true) => {
                                emit_log(&app_clone, "[AUTH] ✓ Token refreshed successfully");
                                // Use the new token for game launch
                                updated_access_token = Some(account.access_token.clone());
                                token_refreshed = true;
                            }
                            Ok(false) => {
                                emit_log(&app_clone, "[AUTH] ✓ Token still valid");
                            }
                            Err(e) => {
                                IS_LAUNCHING.store(false, Ordering::SeqCst);
                                return Err(format!("Authentication failed: {}. Please re-login to your Microsoft account.", e));
                            }
                        }
                    }
                }
            }
            
            // Save updated token after releasing mutable borrow
            if token_refreshed {
                auth::save_auth_state(&auth_state).ok();
            }
        }
        
        let launcher = state.launcher.lock().await;
        
        // Check if this is a modpack (has metadata file)
        let modpack_version_dir = launcher.versions_dir.join(&version_id);
        let metadata_path = modpack_version_dir.join("modpack-metadata.json");
        let is_modpack = metadata_path.exists();
        
        println!("===========================================");
        println!("[MODPACK CHECK] Version: {}", version_id);
        println!("[MODPACK CHECK] Is modpack: {}", is_modpack);
        println!("[MODPACK CHECK] Metadata path: {:?}", metadata_path);
        println!("===========================================");
        
        // Verify modpacks before launch, but keep repeat launches fast.
        if is_modpack {
            emit_log(&app_clone, "[INFO] ⚠️ AUTO-REPAIR SYSTEM ACTIVE - Checking modpack...");
            
            let force_full_verify = std::env::var("LAPETUS_FORCE_FULL_VERIFY")
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            
            // Check for recent crashes and auto-repair if found
            let crash_reports_dir = launcher.game_dir.join("crash-reports");
            let mut has_recent_crash = false;
            
            if crash_reports_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&crash_reports_dir) {
                    let now = std::time::SystemTime::now();
                    for entry in entries.flatten() {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                // Check if crash is within last 5 minutes
                                if let Ok(duration) = now.duration_since(modified) {
                                    if duration.as_secs() < 300 {
                                        has_recent_crash = true;
                                        emit_log(&app_clone, "[WARN] ⚠️ Recent crash detected - running full repair...");
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            let mut quick_verify_passed = false;
            if !has_recent_crash && !force_full_verify {
                emit_log(
                    &app_clone,
                    "[INFO] Running quick modpack integrity check for faster launch...",
                );
                let base_files_ready = launcher.quick_verify(&version_id);
                let modpack_needs_verification = launcher.needs_verification(&version_id);
                quick_verify_passed = base_files_ready && !modpack_needs_verification;
                if quick_verify_passed {
                    emit_log(
                        &app_clone,
                        "[INFO] ✓ Quick check passed - skipping full repair this launch",
                    );
                } else {
                    emit_log(
                        &app_clone,
                        "[WARN] Quick check found missing or invalid modpack files - running full repair verification...",
                    );
                }
            }

            let should_run_full_verify =
                force_full_verify || has_recent_crash || !quick_verify_passed;
            if should_run_full_verify {
                if force_full_verify && !has_recent_crash {
                    emit_log(
                        &app_clone,
                        "[INFO] Full modpack verification forced by LAPETUS_FORCE_FULL_VERIFY",
                    );
                } else if !has_recent_crash {
                    emit_log(&app_clone, "[INFO] Verifying modpack installation...");
                }

                match launcher
                    .verify_and_repair_modpack(&version_id, |progress, status| {
                        emit_log(&app_clone, &format!("[VERIFY] {}", status));
                        let _ = app_clone.emit(
                            "install-progress",
                            serde_json::json!({
                                "progress": progress,
                                "status": status
                            }),
                        );
                    })
                    .await
                {
                    Ok(_) => {
                        if has_recent_crash {
                            emit_log(
                                &app_clone,
                                "[INFO] ✓ Auto-repair complete - corrupted mods fixed!",
                            );
                        } else {
                            emit_log(&app_clone, "[INFO] ✓ Modpack verification complete");
                        }
                    }
                    Err(e) => {
                        emit_log(&app_clone, &format!("[WARN] Verification failed: {}", e));
                        // Continue anyway - some mods might still work
                    }
                }
            }
        } else {
            println!("[MODPACK CHECK] Not a modpack, skipping verification");
        }
        
        // Setup skin for offline accounts before launching.
        // Keep these in launch options too so the client can apply skins without resource packs.
        let mut launch_skin_username: Option<String> = None;
        let mut launch_is_offline = false;

        // Setup skin for offline accounts before launching
        // Also write skin config for the mod to read
        {
            let auth_state = state.auth_state.lock().await;
            if let Some(active_uuid) = &auth_state.active_account {
                if let Some(account) = auth_state.accounts.iter().find(|a| &a.uuid == active_uuid) {
                    launch_is_offline = account.is_offline;
                    launch_skin_username = account.skin_username.clone();

                    // Determine the game directory for this version
                    let instance_game_dir = launcher.game_dir.join("instances").join(&version_id);
                    let game_dir = if instance_game_dir.exists() || looks_like_modded_version(&version_id) {
                        instance_game_dir
                    } else {
                        launcher.game_dir.clone()
                    };
                    
                    // Create lapetus config directory
                    let lapetus_config_dir = game_dir.join("config").join("lapetus");
                    std::fs::create_dir_all(&lapetus_config_dir).ok();
                    
                    // Write skin config for the mod
                    let skin_config = serde_json::json!({
                        "username": account.username,
                        "uuid": account.uuid,
                        "is_offline": account.is_offline,
                        "skin_username": account.skin_username,
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    });
                    
                    let skin_config_path = lapetus_config_dir.join("skin_config.json");
                    if let Ok(config_str) = serde_json::to_string_pretty(&skin_config) {
                        std::fs::write(&skin_config_path, config_str).ok();
                        println!("[Lapetus] Wrote skin config to: {}", skin_config_path.display());
                    }
                    
                    if account.is_offline {
                        // Setup offline skin (downloads to skins folder)
                        if let Err(e) = auth::setup_offline_skin(&game_dir, account).await {
                            println!("[WARN] Failed to setup offline skin: {}", e);
                        }
                    }
                }
            }
        }
        
        // Clone version_id before moving it into LaunchOptions
        let version_id_for_monitor = version_id.clone();
        let requested_dragon_mod_source = dragon_mod_source.unwrap_or_else(|| "github".to_string());
        let mut dragon_mod_source = requested_dragon_mod_source;
        
        // Verify Dragon Client mod for Dragon loader versions (dragon-*)
        if version_id_for_monitor.starts_with("dragon-") {
            if dragon_mod_source.eq_ignore_ascii_case("local") {
                emit_log(&app_clone, "[Dragon] Using local Dragon Client jar only...");
                match launcher.use_local_dev_dragon_mod(&version_id_for_monitor) {
                    Ok(filename) => {
                        emit_log(&app_clone, &format!("[Dragon] ✓ Local jar synced: {}", filename));
                    }
                    Err(e) => {
                        emit_log(
                            &app_clone,
                            &format!(
                                "[Dragon] Local jar unavailable ({}). Falling back to GitHub release...",
                                e
                            ),
                        );
                        dragon_mod_source = "github".to_string();
                    }
                }
            }

            if dragon_mod_source.eq_ignore_ascii_case("github") {
                emit_log(&app_clone, "[Dragon] Verifying Dragon Client mod from GitHub...");
                match launcher.verify_dragon_mod(&version_id_for_monitor, |_progress, status| {
                    emit_log(&app_clone, &format!("[Dragon] {}", status));
                }).await {
                    Ok(true) => {
                        emit_log(&app_clone, "[Dragon] ✓ Dragon Client mod installed");
                    }
                    Ok(false) => {
                        emit_log(&app_clone, "[Dragon] ✓ Dragon Client mod verified");
                    }
                    Err(e) => {
                        emit_log(&app_clone, &format!("[Dragon] Warning: {}", e));
                        // Continue anyway - game can still launch without the mod
                    }
                }
            }
            
            // All mods (including Dragon Client) are now installed directly in the mods folder
            // No copying needed
            emit_log(&app_clone, "[Dragon] ✓ All mods ready for launch");
        }
        
        let cursor_agent_jar_path = match app.path().resource_dir() {
            Ok(dir) => Some(dir.join("resources").join("dragon-cursor-agent.jar").to_string_lossy().to_string()),
            Err(_) => None,
        };

        let options = LaunchOptions {
            version_id,
            username,
            uuid,
            access_token: updated_access_token, // Use refreshed token
            memory_max: 4096,
            memory_min: 1024,
            java_path: None,
            oder_id,
            tier,
            prefer_local_dragon_mod: dragon_mod_source.eq_ignore_ascii_case("local"),
            is_offline: launch_is_offline,
            skin_username: launch_skin_username,
            cursor_image_base64,
            pointer_image_base64,
            cursor_agent_jar_path,
        };
        
        // Verify DragonSkins mod for Dragon Loader versions only
        if version_id_for_monitor.starts_with("lapetus-") {
            // Extract MC version from version_id
            // Format: lapetus-12.0.0-alpha.8-1.21.4
            let mc_version = version_id_for_monitor.rsplit('-').next().unwrap_or("");
            
            // Ensure instances folder exists BEFORE verifying DragonSkins
            let instances_dir = launcher.game_dir.join("instances").join(&version_id_for_monitor);
            let mods_dir = instances_dir.join("mods");
            if let Err(e) = std::fs::create_dir_all(&mods_dir) {
                emit_log(&app_clone, &format!("[DragonSkins] Warning: Failed to create instances folder: {}", e));
            } else {
                emit_log(&app_clone, &format!("[DragonSkins] Instances folder ready: {}", instances_dir.display()));
            }
            
            emit_log(&app_clone, "[DragonSkins] Verifying mod installation...");
            match launcher.verify_dragonskins_mod(mc_version, &version_id_for_monitor, |_progress, status| {
                emit_log(&app_clone, &format!("[DragonSkins] {}", status));
            }).await {
                Ok(true) => {
                    emit_log(&app_clone, "[DragonSkins] ✓ Mod verified");
                }
                Ok(false) => {
                    // Not supported for this version, skip silently
                }
                Err(e) => {
                    emit_log(&app_clone, &format!("[DragonSkins] Warning: {}", e));
                    // Continue anyway - game can still launch
                }
            }
        }
        
        emit_log(
            &app_clone,
            "[Dragon Skins] Skin server will be ensured during launch",
        );
        
        // Create splash screen window
        let (loader_key, game_version_for_splash, modpack_name) = if version_id_for_monitor.starts_with("lapetus-") {
            ("dragon", version_id_for_monitor.rsplit('-').next().unwrap_or(&version_id_for_monitor).to_string(), None)
        } else if version_id_for_monitor.starts_with("fabric-loader-") {
            ("fabric", version_id_for_monitor.rsplit('-').next().unwrap_or(&version_id_for_monitor).to_string(), None)
        } else if version_id_for_monitor.starts_with("quilt-loader-") {
            ("quilt", version_id_for_monitor.rsplit('-').next().unwrap_or(&version_id_for_monitor).to_string(), None)
        } else if version_id_for_monitor.starts_with("dragon-") {
            ("dragon", version_id_for_monitor.strip_prefix("dragon-").unwrap_or(&version_id_for_monitor).to_string(), None)
        } else if version_id_for_monitor.contains("-forge") {
            ("forge", version_id_for_monitor.replace("-forge", ""), None)
        } else if version_id_for_monitor.contains("-fabric") {
            ("fabric", version_id_for_monitor.replace("-fabric", ""), None)
        } else if version_id_for_monitor.contains("-quilt") {
            ("quilt", version_id_for_monitor.replace("-quilt", ""), None)
        } else if version_id_for_monitor.contains("fabulously-optimized") 
            || version_id_for_monitor.contains("simply-optimized")
            || version_id_for_monitor.contains("adrenaline")
            || version_id_for_monitor.contains("additive")
            || (version_id_for_monitor.contains('-') && !version_id_for_monitor.starts_with("1.")) {
            // Detect misc/modpack versions - extract modpack name
            let mc_version = version_id_for_monitor.rsplit('-').next().unwrap_or(&version_id_for_monitor).to_string();
            let name_parts: Vec<&str> = version_id_for_monitor.rsplitn(2, '-').collect();
            let modpack_name_raw = if name_parts.len() > 1 { name_parts[1] } else { &version_id_for_monitor };
            let modpack_display = modpack_name_raw
                .split('-')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    }
                })
                .collect::<Vec<String>>()
                .join(" ");
            ("misc", mc_version, Some(modpack_display))
        } else {
            ("vanilla", version_id_for_monitor.clone(), None)
        };
        let splash_url = if let Some(modpack) = modpack_name {
            format!(
                "splash.html?version={}&loader={}&gameVersion={}&modpackName={}",
                app_clone.package_info().version,
                loader_key,
                game_version_for_splash,
                urlencoding::encode(&modpack)
            )
        } else {
            format!(
                "splash.html?version={}&loader={}&gameVersion={}",
                app_clone.package_info().version,
                loader_key,
                game_version_for_splash
            )
        };
        let splash_window = tauri::WebviewWindowBuilder::new(
            &app_clone,
            "splash",
            tauri::WebviewUrl::App(splash_url.into())
        )
        .title("Starting Minecraft")
        .inner_size(920.0, 520.0)
        .resizable(false)
        .decorations(false)
        .center()
        .always_on_top(true)
        .build();

        match splash_window {
            Ok(_) => {
                if let Some(main_window) = app_clone.get_webview_window("main") {
                    if let Err(e) = main_window.hide() {
                        println!("[Splash] Failed to hide main launcher window: {}", e);
                    }
                }
            }
            Err(e) => {
                println!("[Splash] Failed to create splash window: {}", e);
            }
        }
        
        let app_for_launch = app_clone.clone();
        let launch_result = launcher.launch(&options, move |log_line| {
            let _ = app_for_launch.emit("game-log", serde_json::json!({
                "line": log_line
            }));
        }).await;
        
        // If launch was successful, start monitoring the game process
        if launch_result.is_ok() {
            // Update Discord RPC with playing status
            let (minecraft_version, loader_type) = if version_id_for_monitor.starts_with("lapetus-") {
                // Lapetus version format: lapetus-1.20.1-fabric
                let parts: Vec<&str> = version_id_for_monitor.split('-').collect();
                if parts.len() >= 3 {
                    (parts[1].to_string(), Some("lapetus"))
                } else {
                    (version_id_for_monitor.clone(), Some("lapetus"))
                }
            } else if version_id_for_monitor.contains("-forge") {
                let version = version_id_for_monitor.replace("-forge", "");
                (version, Some("forge"))
            } else if version_id_for_monitor.contains("-fabric") {
                let version = version_id_for_monitor.replace("-fabric", "");
                (version, Some("fabric"))
            } else if version_id_for_monitor.contains("-quilt") {
                let version = version_id_for_monitor.replace("-quilt", "");
                (version, Some("quilt"))
            } else if version_id_for_monitor.contains("-neoforge") {
                let version = version_id_for_monitor.replace("-neoforge", "");
                (version, Some("neoforge"))
            } else {
                (version_id_for_monitor.clone(), Some("vanilla"))
            };
            
            if let Err(e) = discord::update_playing_status(&minecraft_version, None, loader_type) {
                println!("[Discord] Failed to set playing status: {}", e);
            } else {
                println!("[Discord] Set playing status: {} ({})", minecraft_version, loader_type.unwrap_or("vanilla"));
            }
            
            // Clone variables for the monitoring task
            let app_for_monitor = app.clone();
            let launcher_arc = Arc::clone(&state.launcher);
            
            // Spawn a background task to monitor the game and clear Discord when it exits
            tokio::spawn(async move {
                // Keep splash visible until the Minecraft/Java window is actually visible.
                // Add focus-handoff and startup heuristic fallbacks so splash never gets stuck.
                let splash_wait_started = tokio::time::Instant::now();
                let splash_wait_timeout = tokio::time::Duration::from_secs(180);
                let splash_focus_handoff_grace = tokio::time::Duration::from_secs(4);
                let splash_startup_heuristic_timeout = tokio::time::Duration::from_secs(45);

                loop {
                    tokio::time::sleep(tokio::time::Duration::from_millis(700)).await;
                    let elapsed = splash_wait_started.elapsed();

                    let is_running = is_game_running().await.unwrap_or(false);
                    if !is_running {
                        if let Some(splash) = app_for_monitor.get_webview_window("splash") {
                            let _ = splash.close();
                            println!("[Splash] Closed splash screen because game process exited");
                        }
                        break;
                    }

                    if is_minecraft_window_visible() {
                        if let Some(splash) = app_for_monitor.get_webview_window("splash") {
                            let _ = splash.close();
                            println!("[Splash] Closed splash screen after Minecraft window appeared");
                        }
                        break;
                    }

                    // If splash lost focus after launch has progressed, assume Minecraft window took focus.
                    if elapsed >= splash_focus_handoff_grace {
                        if let Some(splash) = app_for_monitor.get_webview_window("splash") {
                            if let Ok(is_focused) = splash.is_focused() {
                                if !is_focused {
                                    let _ = splash.close();
                                    println!("[Splash] Closed splash screen after focus handoff to game");
                                    break;
                                }
                            }
                        }
                    }

                    // Last-resort heuristic so splash never stays forever on top when OS visibility APIs fail.
                    if elapsed >= splash_startup_heuristic_timeout {
                        if let Some(splash) = app_for_monitor.get_webview_window("splash") {
                            let _ = splash.close();
                            println!("[Splash] Closed splash screen after startup heuristic timeout");
                        }
                        break;
                    }

                    if elapsed >= splash_wait_timeout {
                        if let Some(splash) = app_for_monitor.get_webview_window("splash") {
                            let _ = splash.close();
                            println!("[Splash] Closed splash screen after fallback timeout");
                        }
                        break;
                    }
                }
                
                // Monitor the game process
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    
                    // Check if game is still running
                    let is_running = is_game_running().await.unwrap_or(false);
                    
                    if !is_running {
                        // Game has exited - clear Discord presence
                        println!("[Discord] Game exited, clearing Discord presence");
                        if let Err(e) = discord::update_launcher_status() {
                            println!("[Discord] Failed to set launcher status on game exit: {}", e);
                        }

                        // Restore launcher window when the game exits
                        if let Some(main_window) = app_for_monitor.get_webview_window("main") {
                            let _ = main_window.show();
                            let _ = main_window.set_focus();
                        }
                        
                        // Check for crashes and auto-repair if needed
                        let version_id_clone = version_id_for_monitor.clone();
                        let app_clone2 = app_for_monitor.clone();
                        let launcher_arc2 = Arc::clone(&launcher_arc);
                        
                        tokio::spawn(async move {
                            // Wait a bit for crash report to be written
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                            
                            let launcher = launcher_arc2.lock().await;
                            let crash_reports_dir = launcher.game_dir.join("crash-reports");
                            
                            if crash_reports_dir.exists() {
                                if let Ok(entries) = std::fs::read_dir(&crash_reports_dir) {
                                    let now = std::time::SystemTime::now();
                                    let mut has_crash = false;
                                    
                                    for entry in entries.flatten() {
                                        if let Ok(metadata) = entry.metadata() {
                                            if let Ok(modified) = metadata.modified() {
                                                // Check if crash is within last 30 seconds
                                                if let Ok(duration) = now.duration_since(modified) {
                                                    if duration.as_secs() < 30 {
                                                        has_crash = true;
                                                        
                                                        // Read crash report to check for mod issues
                                                        if let Ok(crash_content) = std::fs::read_to_string(entry.path()) {
                                                            let lower = crash_content.to_lowercase();
                                                            
                                                            // Check for common mod corruption indicators
                                                            if lower.contains("zipexception") || 
                                                               lower.contains("zip end header not found") ||
                                                               lower.contains("nullpointerexception") ||
                                                               lower.contains("classnotfoundexception") ||
                                                               lower.contains("mod discovery failed") {
                                                                println!("[AUTO-REPAIR] Crash detected with mod corruption indicators");
                                                                let _ = app_clone2.emit("game-log", serde_json::json!({
                                                                    "line": "[AUTO-REPAIR] ⚠️ Crash detected - running automatic repair..."
                                                                }));
                                                                
                                                                // Run verification and repair
                                                                match launcher.verify_and_repair_modpack(&version_id_clone, |progress, status| {
                                                                    let _ = app_clone2.emit("game-log", serde_json::json!({
                                                                        "line": format!("[AUTO-REPAIR] {}", status)
                                                                    }));
                                                                    let _ = app_clone2.emit("install-progress", serde_json::json!({
                                                                        "progress": progress,
                                                                        "status": status
                                                                    }));
                                                                }).await {
                                                                    Ok(_) => {
                                                                        let _ = app_clone2.emit("game-log", serde_json::json!({
                                                                            "line": "[AUTO-REPAIR] ✓ Repair complete! Please try launching again."
                                                                        }));
                                                                    }
                                                                    Err(e) => {
                                                                        let _ = app_clone2.emit("game-log", serde_json::json!({
                                                                            "line": format!("[AUTO-REPAIR] ✗ Repair failed: {}", e)
                                                                        }));
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    if !has_crash {
                                        println!("[AUTO-REPAIR] No recent crashes detected");
                                    }
                                }
                            }
                        });
                        
                        break;
                    }
                }
            });
        } else {
            // Launch failed: close splash and bring launcher back
            if let Some(splash) = app_clone.get_webview_window("splash") {
                let _ = splash.close();
            }
            if let Some(main_window) = app_clone.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }
        }
        
        launch_result
    }.await;

    // Reset the flag after launch completes (success or failure)
    IS_LAUNCHING.store(false, Ordering::SeqCst);

    result
}

#[tauri::command]
async fn is_game_running() -> Result<bool, String> {
    // Cross-platform check for Minecraft process
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq javaw.exe", "/FO", "CSV"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;

        let output_str = String::from_utf8_lossy(&output.stdout);
        if output_str.contains("javaw.exe") {
            return Ok(true);
        }

        // Also check java.exe
        let output2 = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq java.exe", "/FO", "CSV"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;

        let output_str2 = String::from_utf8_lossy(&output2.stdout);
        Ok(output_str2.contains("java.exe"))
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("pgrep")
            .args(["-f", "net.minecraft"])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            return Ok(true);
        }

        let output2 = std::process::Command::new("pgrep")
            .args(["-f", "minecraft_launcher"])
            .output()
            .map_err(|e| e.to_string())?;

        Ok(output2.status.success())
    }

    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("pgrep")
            .args(["-f", "net.minecraft"])
            .output()
            .map_err(|e| e.to_string())?;

        Ok(output.status.success())
    }
}

fn is_minecraft_window_visible() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let script = r#"$p = Get-Process java,javaw -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' }; if ($p) { exit 0 } else { exit 1 }"#;

        return std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }

    #[cfg(target_os = "macos")]
    {
        let script = r#"tell application "System Events"
set mcProcs to (every process whose ((name contains "Minecraft") or (name contains "java")))
repeat with p in mcProcs
    try
        if (count of windows of p) > 0 then
            return true
        end if
    on error
        try
            if frontmost of p is true then
                return true
            end if
        end try
    end try
end repeat
return false
end tell"#;

        return std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .eq_ignore_ascii_case("true")
            })
            .unwrap_or(false);
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = std::process::Command::new("wmctrl").arg("-lx").output() {
            if output.status.success() {
                let windows = String::from_utf8_lossy(&output.stdout).to_lowercase();
                return windows.contains("minecraft") || windows.contains("java");
            }
        }
        return false;
    }
}

#[tauri::command]
async fn stop_game() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Kill Java processes (Minecraft runs on Java)
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "javaw.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "java.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "net.minecraft"])
            .output();

        let _ = std::process::Command::new("pkill")
            .args(["-f", "minecraft_launcher"])
            .output();

        let _ = std::process::Command::new("pkill")
            .args(["-f", "Minecraft-.*\\.app"])
            .output();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "net.minecraft"])
            .output();
    }

    // Clear Discord presence when game is stopped
    if let Err(e) = discord::update_launcher_status() {
        println!(
            "[Discord] Failed to set launcher status on manual stop: {}",
            e
        );
    }

    Ok(())
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    // Normalize path for the current OS
    let normalized_path = if cfg!(target_os = "windows") {
        // Convert forward slashes to backslashes for Windows
        path.replace("/", "\\")
    } else {
        path
    };

    #[cfg(target_os = "windows")]
    {
        // Use explorer with /select to open and highlight the folder
        std::process::Command::new("explorer")
            .arg(&normalized_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder on Windows: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&normalized_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder on macOS: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&normalized_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder on Linux: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use explorer directly to avoid cmd.exe console flash.
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn read_server_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn write_server_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
async fn get_version_info(
    version_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;
    let versions_dir = launcher.game_dir.join("versions").join(&version_id);

    // Check if it's a modded version or modpack.
    let instance_dir = launcher.game_dir.join("instances").join(&version_id);
    let is_modded = instance_dir.exists() || looks_like_modded_version(&version_id);

    // All modded versions and modpacks use instances directory for isolation
    // This prevents mod conflicts between different MC versions
    let is_lapetus = version_id.starts_with("lapetus-");
    let mods_dir = if is_modded {
        // Create the instance mods directory if it doesn't exist
        let instance_mods = instance_dir.join("mods");
        std::fs::create_dir_all(&instance_mods).ok();
        instance_mods
    } else {
        launcher.game_dir.join("mods")
    };

    // Get base MC version from version ID.
    let base_version = extract_mc_version_from_id(&version_id);

    // Get loader type
    let lower_version_id = version_id.to_ascii_lowercase();
    let loader = if lower_version_id.contains("forge") {
        "forge"
    } else if lower_version_id.starts_with("dragon-") {
        "dragon"
    } else if lower_version_id.contains("fabric") {
        "fabric"
    } else if lower_version_id.contains("quilt") {
        "quilt"
    } else if lower_version_id.contains("lapetus") {
        "lapetus"
    } else {
        "vanilla"
    };

    // Get mods list from the version-specific mods folder
    let mut mods: Vec<serde_json::Value> = Vec::new();
    if mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    continue;
                }

                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let name_lower = name.to_ascii_lowercase();

                // Include both .jar (enabled) and .jar.disabled (disabled) mods
                let is_jar = name_lower.ends_with(".jar");
                let is_disabled = name_lower.ends_with(".jar.disabled");

                if is_jar || is_disabled {
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let enabled = !is_disabled;
                    mods.push(serde_json::json!({
                        "name": name,
                        "path": path.to_string_lossy(),
                        "size": size,
                        "enabled": enabled
                    }));
                }
            }
        }
    }

    // Get worlds list (shared across all versions)
    let saves_dir = launcher.game_dir.join("saves");
    let mut worlds: Vec<serde_json::Value> = Vec::new();
    if saves_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&saves_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    // Check for level.dat to confirm it's a world
                    if path.join("level.dat").exists() {
                        worlds.push(serde_json::json!({
                            "name": name,
                            "path": path.to_string_lossy()
                        }));
                    }
                }
            }
        }
    }

    // Instance directory for modded versions
    // For Lapetus, show the visible instances directory (for saves, screenshots)
    // but the actual game runs from hidden .trapgaint-data directory
    let instance_dir = if is_modded {
        launcher.game_dir.join("instances").join(&version_id)
    } else {
        launcher.game_dir.clone()
    };

    // For Lapetus versions, show mods list so users can manage them
    let mods_response = mods;

    // Return the actual mods directory path
    let mods_dir_response = mods_dir.to_string_lossy().to_string();

    Ok(serde_json::json!({
        "version_id": version_id,
        "base_version": base_version,
        "loader": loader,
        "is_modded": is_modded,
        "is_lapetus": is_lapetus,
        "version_dir": versions_dir.to_string_lossy(),
        "mods_dir": mods_dir_response,
        "saves_dir": saves_dir.to_string_lossy(),
        "game_dir": instance_dir.to_string_lossy(),
        "mods": mods_response,
        "worlds": worlds
    }))
}

#[tauri::command]
async fn repair_version(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .repair_version(&version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn quick_verify(version_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    Ok(launcher.quick_verify(&version_id))
}

// Auto-repair and issue detection commands
#[tauri::command]
async fn detect_installation_issues(
    version_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;
    let mut issues: Vec<String> = Vec::new();

    // Determine the correct directory based on version type
    let version_dir = if version_id.starts_with("lapetus-") {
        launcher.game_dir.join("instances").join(&version_id)
    } else {
        launcher.game_dir.join("versions").join(&version_id)
    };

    // Check if version directory exists
    if !version_dir.exists() {
        issues.push("version_missing: Version directory does not exist".to_string());
        return Ok(serde_json::json!({
            "issues": issues,
            "canRepair": true
        }));
    }

    // Check for Lapetus-specific issues
    if version_id.starts_with("lapetus-") {
        let mods_dir = version_dir.join("mods");

        // Check if mods directory exists
        if !mods_dir.exists() {
            issues.push("mod_missing: Mods directory does not exist".to_string());
        } else {
            // Check for lapetus-client mod
            let has_lapetus_mod = std::fs::read_dir(&mods_dir)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        e.file_name()
                            .to_string_lossy()
                            .to_lowercase()
                            .contains("lapetus-client")
                    })
                })
                .unwrap_or(false);

            if !has_lapetus_mod {
                issues.push("mod_missing: Dragon client mod not found".to_string());
            }

            // Check for Fabric API
            let has_fabric_api = std::fs::read_dir(&mods_dir)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        let name = e.file_name().to_string_lossy().to_lowercase();
                        name.contains("fabric-api") || name.contains("fabric_api")
                    })
                })
                .unwrap_or(false);

            if !has_fabric_api {
                issues.push("mod_missing: Fabric API not found".to_string());
            }
        }
    }

    // Check assets directory
    let assets_dir = launcher.game_dir.join("assets");
    if !assets_dir.exists() {
        issues.push("asset_missing: Assets directory does not exist".to_string());
    } else {
        // Check for indexes
        let indexes_dir = assets_dir.join("indexes");
        if !indexes_dir.exists()
            || std::fs::read_dir(&indexes_dir)
                .map(|d| d.count())
                .unwrap_or(0)
                == 0
        {
            issues.push("asset_missing: Asset indexes missing".to_string());
        }

        // Check for objects (fonts, sounds, etc.)
        let objects_dir = assets_dir.join("objects");
        if !objects_dir.exists() {
            issues.push("asset_missing: Asset objects directory missing".to_string());
        } else {
            // Quick check - should have many subdirectories
            let subdir_count = std::fs::read_dir(&objects_dir)
                .map(|d| d.count())
                .unwrap_or(0);
            if subdir_count < 10 {
                issues.push("asset_corrupted: Asset objects appear incomplete".to_string());
            }
        }
    }

    // Check libraries directory
    let libraries_dir = launcher.game_dir.join("libraries");
    if !libraries_dir.exists() {
        issues.push("library_missing: Libraries directory does not exist".to_string());
    } else {
        // Check for essential libraries by counting JAR files in top-level subdirs
        let mut lib_count = 0;
        if let Ok(entries) = std::fs::read_dir(&libraries_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    // Count JARs in subdirectories
                    fn count_jars(dir: &std::path::Path) -> usize {
                        let mut count = 0;
                        if let Ok(entries) = std::fs::read_dir(dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    count += count_jars(&path);
                                } else if path.extension().map(|e| e == "jar").unwrap_or(false) {
                                    count += 1;
                                }
                            }
                        }
                        count
                    }
                    lib_count += count_jars(&entry.path());
                }
            }
        }

        if lib_count < 50 {
            issues.push("library_missing: Libraries appear incomplete".to_string());
        }
    }

    // Check natives directory
    let natives_dir = launcher.game_dir.join("natives");
    if !natives_dir.exists() {
        // Also check version-specific natives
        let version_natives = version_dir.join("natives");
        if !version_natives.exists() {
            issues.push("native_missing: Native libraries not found".to_string());
        }
    }

    // Check version JAR
    let version_jar = if version_id.starts_with("lapetus-") {
        // For Lapetus, check the base MC version
        let mc_version = version_id.split('-').last().unwrap_or(&version_id);
        launcher
            .game_dir
            .join("versions")
            .join(mc_version)
            .join(format!("{}.jar", mc_version))
    } else {
        version_dir.join(format!("{}.jar", version_id))
    };

    if !version_jar.exists() {
        issues.push("jar_missing: Game JAR file not found".to_string());
    } else {
        // Check JAR file size (should be > 10MB for Minecraft)
        if let Ok(metadata) = std::fs::metadata(&version_jar) {
            if metadata.len() < 10_000_000 {
                issues
                    .push("jar_corrupted: Game JAR file appears corrupted (too small)".to_string());
            }
        }
    }

    Ok(serde_json::json!({
        "issues": issues,
        "canRepair": true,
        "versionDir": version_dir.to_string_lossy(),
        "issueCount": issues.len()
    }))
}

#[tauri::command]
async fn repair_installation(
    version_id: String,
    full_repair: bool,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let emit_progress = |step: u32, total: u32, message: &str| {
        let _ = window.emit(
            "repair-progress",
            serde_json::json!({
                "step": step,
                "total": total,
                "message": message,
                "progress": (step as f32 / total as f32) * 100.0
            }),
        );
    };

    let total_steps = if full_repair { 5 } else { 3 };
    let mut current_step = 0;

    // Step 1: Clean temporary files
    current_step += 1;
    emit_progress(current_step, total_steps, "Cleaning temporary files...");

    {
        let launcher = state.launcher.lock().await;

        if version_id.starts_with("lapetus-") {
            let instance_dir = launcher.game_dir.join("instances").join(&version_id);

            // Clean crash reports older than 7 days
            let crash_dir = instance_dir.join("crash-reports");
            if crash_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&crash_dir) {
                    let week_ago = std::time::SystemTime::now()
                        - std::time::Duration::from_secs(7 * 24 * 60 * 60);
                    for entry in entries.flatten() {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                if modified < week_ago {
                                    std::fs::remove_file(entry.path()).ok();
                                }
                            }
                        }
                    }
                }
            }

            // Clean .fabric directory (can be regenerated)
            let fabric_dir = instance_dir.join(".fabric");
            if fabric_dir.exists() {
                std::fs::remove_dir_all(&fabric_dir).ok();
            }
        }
    }

    // Step 2: Repair base version (downloads assets and libraries)
    current_step += 1;
    emit_progress(current_step, total_steps, "Repairing game files...");

    // For Lapetus, we need to repair the base MC version
    let mc_version = if version_id.starts_with("lapetus-") {
        version_id
            .split('-')
            .last()
            .unwrap_or(&version_id)
            .to_string()
    } else {
        version_id.clone()
    };

    {
        let launcher = state.launcher.lock().await;

        // Use the existing repair_version method which handles assets and libraries
        if let Err(e) = launcher.repair_version(&mc_version, |progress, status| {
            let _ = window.emit("repair-progress", serde_json::json!({
                "step": current_step,
                "total": total_steps,
                "message": status,
                "progress": ((current_step as f32 - 1.0 + progress / 100.0) / total_steps as f32) * 100.0
            }));
        }).await {
            println!("[Repair] Version repair warning: {}", e);
            // Continue anyway - some files might already exist
        }
    }

    // Step 3: Reinstall Fabric (for Lapetus)
    if version_id.starts_with("lapetus-") {
        current_step += 1;
        emit_progress(current_step, total_steps, "Reinstalling Fabric loader...");

        {
            let launcher = state.launcher.lock().await;

            // Ensure Fabric is installed for the MC version
            let fabric_version = format!("fabric-loader-0.16.14-{}", mc_version);
            let fabric_dir = launcher.game_dir.join("versions").join(&fabric_version);

            // Remove existing Fabric to force reinstall
            if fabric_dir.exists() {
                std::fs::remove_dir_all(&fabric_dir).ok();
            }
        }

        // Reinstall Fabric using the proper method
        let launcher = state.launcher.lock().await;

        // Create FabricVersionInfo struct
        let fabric_info = minecraft::fabric::FabricVersionInfo {
            id: format!("fabric-loader-0.16.14-{}", mc_version),
            mc_version: mc_version.clone(),
            loader_version: "0.16.14".to_string(),
            stable: true,
        };

        if let Err(e) = launcher.install_fabric(&fabric_info, |progress, status| {
            let _ = window.emit("repair-progress", serde_json::json!({
                "step": current_step,
                "total": total_steps,
                "message": status,
                "progress": ((current_step as f32 - 1.0 + progress / 100.0) / total_steps as f32) * 100.0
            }));
        }).await {
            println!("[Repair] Fabric install warning: {}", e);
        }
        drop(launcher);
    }

    // Step 4: Reinstall mods (for Lapetus)
    if full_repair && version_id.starts_with("lapetus-") {
        current_step += 1;
        emit_progress(current_step, total_steps, "Reinstalling mods...");

        {
            let launcher = state.launcher.lock().await;
            let instance_dir = launcher.game_dir.join("instances").join(&version_id);
            let mods_dir = instance_dir.join("mods");

            // Remove existing lapetus mod to force redownload
            if mods_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_lowercase();
                        if name.contains("lapetus-client") {
                            std::fs::remove_file(entry.path()).ok();
                        }
                    }
                }
            }
        }

        // Dragon uses standard Fabric - no special mod installation needed
    }

    // Step 5: Verify installation
    current_step += 1;
    emit_progress(current_step, total_steps, "Verifying installation...");

    // Run quick verify
    let launcher = state.launcher.lock().await;
    let is_valid = launcher.quick_verify(&version_id);

    if !is_valid {
        return Err(
            "Installation verification failed. Some files may still be missing.".to_string(),
        );
    }

    emit_progress(total_steps, total_steps, "Repair complete!");

    Ok(serde_json::json!({
        "success": true,
        "message": "Installation repaired successfully"
    }))
}

// Dependency check commands
#[tauri::command]
async fn check_java() -> Result<serde_json::Value, String> {
    // Platform-specific Java paths
    #[cfg(target_os = "windows")]
    let java_paths: Vec<&str> = vec![
        "C:\\Program Files\\Java\\jdk-25\\bin\\java.exe",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe",
        "C:\\Program Files\\Zulu\\zulu-25\\bin\\java.exe",
        "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe",
        "C:\\Program Files\\Zulu\\zulu-21\\bin\\java.exe",
        "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
        "C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin\\java.exe",
        "C:\\Program Files\\Zulu\\zulu-17\\bin\\java.exe",
        "C:\\Program Files\\Java\\jre-21\\bin\\java.exe",
        "C:\\Program Files\\Java\\jre-17\\bin\\java.exe",
    ];

    #[cfg(target_os = "macos")]
    let java_paths: Vec<&str> = vec![
        "/opt/homebrew/opt/openjdk@25/bin/java",
        "/opt/homebrew/opt/openjdk@21/bin/java",
        "/opt/homebrew/opt/openjdk@17/bin/java",
        "/opt/homebrew/opt/openjdk/bin/java",
        "/usr/bin/java",
        "/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java",
        "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java",
        "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java",
        "/Library/Java/JavaVirtualMachines/zulu-25.jdk/Contents/Home/bin/java",
        "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home/bin/java",
        "/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home/bin/java",
    ];

    #[cfg(target_os = "linux")]
    let java_paths: Vec<&str> = vec![
        "/usr/lib/jvm/java-25-openjdk/bin/java",
        "/usr/lib/jvm/java-21-openjdk/bin/java",
        "/usr/lib/jvm/java-17-openjdk/bin/java",
        "/usr/lib/jvm/temurin-25-jdk/bin/java",
        "/usr/lib/jvm/temurin-21-jdk/bin/java",
        "/usr/lib/jvm/temurin-17-jdk/bin/java",
        "/usr/bin/java",
    ];

    for path in java_paths {
        if std::path::Path::new(path).exists() {
            let mut cmd = std::process::Command::new(path);
            cmd.args(["-version"]);
            let output = run_command_output_hidden(&mut cmd);

            if let Ok(out) = output {
                let version_str = String::from_utf8_lossy(&out.stderr);
                let version = version_str.lines().next().map(|s| s.to_string());

                return Ok(serde_json::json!({
                    "installed": true,
                    "version": version,
                    "path": path
                }));
            }
        }
    }

    // Try system java
    let java_cmd = if cfg!(target_os = "windows") {
        "java.exe"
    } else {
        "java"
    };
    let mut cmd = std::process::Command::new(java_cmd);
    cmd.args(["-version"]);
    let output = run_command_output_hidden(&mut cmd);

    match output {
        Ok(out) if out.status.success() || !out.stderr.is_empty() => {
            let version_str = String::from_utf8_lossy(&out.stderr);
            let version = version_str.lines().next().map(|s| s.to_string());

            Ok(serde_json::json!({
                "installed": true,
                "version": version,
                "path": java_cmd
            }))
        }
        _ => Ok(serde_json::json!({
            "installed": false
        })),
    }
}

#[tauri::command]
async fn install_dependency(id: String, window: tauri::Window) -> Result<(), String> {
    match id.as_str() {
        "java" => {
            #[cfg(target_os = "windows")]
            {
                // Download and install Adoptium JDK 21 silently
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 10,
                        "status": "Downloading Java 21..."
                    }),
                );

                let client = reqwest::Client::new();
                let download_url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.msi";

                let response = client
                    .get(download_url)
                    .send()
                    .await
                    .map_err(|e| format!("Failed to download Java: {}", e))?;

                if !response.status().is_success() {
                    return Err(format!("Download failed: {}", response.status()));
                }

                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 50,
                        "status": "Saving installer..."
                    }),
                );

                let bytes = response.bytes().await.map_err(|e| e.to_string())?;
                let temp_dir = std::env::temp_dir();
                let installer_path = temp_dir.join("java21_installer.msi");
                std::fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 70,
                        "status": "Installing Java 21..."
                    }),
                );

                // Run MSI installer silently
                let status = std::process::Command::new("msiexec")
                    .args(["/i", installer_path.to_str().unwrap(), "/quiet", "/norestart", "ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome"])
                    .status()
                    .map_err(|e| e.to_string())?;

                // Clean up
                let _ = std::fs::remove_file(&installer_path);

                if status.success() {
                    let _ = window.emit(
                        "install-progress",
                        serde_json::json!({
                            "progress": 100,
                            "status": "Java 21 installed!"
                        }),
                    );
                    return Ok(());
                } else {
                    return Err(
                        "Java installation failed. Please install manually from adoptium.net"
                            .to_string(),
                    );
                }
            }

            #[cfg(target_os = "macos")]
            {
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 10,
                        "status": "Checking Homebrew..."
                    }),
                );

                // Try to install Java via Homebrew first
                let brew_check = std::process::Command::new("brew")
                    .args(["--version"])
                    .output();

                if brew_check.is_ok() && brew_check.unwrap().status.success() {
                    let _ = window.emit(
                        "install-progress",
                        serde_json::json!({
                            "progress": 30,
                            "status": "Installing Java via Homebrew..."
                        }),
                    );

                    let status = std::process::Command::new("brew")
                        .args(["install", "openjdk@21"])
                        .status()
                        .map_err(|e| e.to_string())?;

                    if status.success() {
                        let _ = window.emit(
                            "install-progress",
                            serde_json::json!({
                                "progress": 100,
                                "status": "Java 21 installed!"
                            }),
                        );
                        return Ok(());
                    }
                }

                // Fallback: Download DMG directly
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 20,
                        "status": "Downloading Java 21..."
                    }),
                );

                let client = reqwest::Client::new();
                let arch = if cfg!(target_arch = "aarch64") {
                    "aarch64"
                } else {
                    "x64"
                };
                let download_url = format!(
                    "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_{}_mac_hotspot_21.0.5_11.pkg",
                    arch
                );

                let response = client
                    .get(&download_url)
                    .send()
                    .await
                    .map_err(|e| format!("Failed to download Java: {}", e))?;

                if !response.status().is_success() {
                    return Err(format!("Download failed: {}", response.status()));
                }

                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 60,
                        "status": "Saving installer..."
                    }),
                );

                let bytes = response.bytes().await.map_err(|e| e.to_string())?;
                let temp_dir = std::env::temp_dir();
                let installer_path = temp_dir.join("java21_installer.pkg");
                std::fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 80,
                        "status": "Installing Java 21 (may require password)..."
                    }),
                );

                // Run PKG installer (will prompt for admin password)
                let status = std::process::Command::new("sudo")
                    .args([
                        "installer",
                        "-pkg",
                        installer_path.to_str().unwrap(),
                        "-target",
                        "/",
                    ])
                    .status()
                    .map_err(|e| e.to_string())?;

                // Clean up
                let _ = std::fs::remove_file(&installer_path);

                if status.success() {
                    let _ = window.emit(
                        "install-progress",
                        serde_json::json!({
                            "progress": 100,
                            "status": "Java 21 installed!"
                        }),
                    );
                    return Ok(());
                } else {
                    return Err(
                        "Java installation failed. Please install manually from adoptium.net"
                            .to_string(),
                    );
                }
            }

            #[cfg(target_os = "linux")]
            {
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": 10,
                        "status": "Checking package manager..."
                    }),
                );

                // Try apt-get first (Debian/Ubuntu)
                let apt_check = std::process::Command::new("which")
                    .args(["apt-get"])
                    .output();

                if apt_check.is_ok() && apt_check.unwrap().status.success() {
                    let _ = window.emit(
                        "install-progress",
                        serde_json::json!({
                            "progress": 30,
                            "status": "Installing Java via apt..."
                        }),
                    );

                    // Update package list first
                    let _ = std::process::Command::new("sudo")
                        .args(["apt-get", "update"])
                        .status();

                    let status = std::process::Command::new("sudo")
                        .args(["apt-get", "install", "-y", "openjdk-21-jdk"])
                        .status()
                        .map_err(|e| e.to_string())?;

                    if status.success() {
                        let _ = window.emit(
                            "install-progress",
                            serde_json::json!({
                                "progress": 100,
                                "status": "Java 21 installed!"
                            }),
                        );
                        return Ok(());
                    }
                }

                // Try dnf (Fedora/RHEL)
                let dnf_check = std::process::Command::new("which").args(["dnf"]).output();

                if dnf_check.is_ok() && dnf_check.unwrap().status.success() {
                    let _ = window.emit(
                        "install-progress",
                        serde_json::json!({
                            "progress": 30,
                            "status": "Installing Java via dnf..."
                        }),
                    );

                    let status = std::process::Command::new("sudo")
                        .args(["dnf", "install", "-y", "java-21-openjdk"])
                        .status()
                        .map_err(|e| e.to_string())?;

                    if status.success() {
                        let _ = window.emit(
                            "install-progress",
                            serde_json::json!({
                                "progress": 100,
                                "status": "Java 21 installed!"
                            }),
                        );
                        return Ok(());
                    }
                }

                return Err(
                    "Could not install Java automatically. Please install openjdk-21-jdk manually."
                        .to_string(),
                );
            }
        }
        _ => Err(format!("Unknown dependency: {}", id)),
    }
}

// Forge commands
#[tauri::command]
async fn get_forge_versions(state: State<'_, AppState>) -> Result<Vec<ForgeVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_forge_versions().await
}

#[tauri::command]
async fn get_installed_forge_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_forge_versions()
}

#[tauri::command]
async fn get_forge_versions_for_mc(
    mc_version: String,
    state: State<'_, AppState>,
) -> Result<Vec<ForgeVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_forge_versions_for_mc(&mc_version).await
}

#[tauri::command]
async fn install_forge(
    forge_version: ForgeVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_forge(&forge_version, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

// Fabric commands
#[tauri::command]
async fn get_fabric_versions(state: State<'_, AppState>) -> Result<Vec<FabricVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_fabric_versions().await
}

#[tauri::command]
async fn get_installed_fabric_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_fabric_versions()
}

#[tauri::command]
async fn get_installed_modpack_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_modpack_versions()
}

#[tauri::command]
async fn is_version_installed(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;

    // Check if profile exists in state with Installed stage
    if let Ok(Some(profile)) = launcher.state.get_profile(&version_id) {
        if profile.install_stage == crate::minecraft::state::InstallStage::Installed {
            // Verify files actually exist before returning true
            let versions_dir = launcher.game_dir.join("versions");
            let version_dir = versions_dir.join(&version_id);
            let json_path = version_dir.join(format!("{}.json", version_id));

            // If JSON doesn't exist, the installation is stale - update state
            if !json_path.exists() {
                println!(
                    "[State] Version {} marked as installed but files missing, updating state",
                    version_id
                );
                launcher
                    .state
                    .update_install_stage(
                        &version_id,
                        crate::minecraft::state::InstallStage::NotInstalled,
                    )
                    .ok();
                return Ok(false);
            }

            // For modpacks, also check instance folder
            if let Ok(json_content) = std::fs::read_to_string(&json_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_content) {
                    if json.get("inheritsFrom").is_some() {
                        // This is a modpack - check instance folder
                        let instances_dir = launcher.game_dir.join("instances");
                        let instance_path = instances_dir.join(&version_id);
                        if !instance_path.exists() {
                            println!(
                                "[State] Modpack {} instance folder missing, updating state",
                                version_id
                            );
                            launcher
                                .state
                                .update_install_stage(
                                    &version_id,
                                    crate::minecraft::state::InstallStage::NotInstalled,
                                )
                                .ok();
                            return Ok(false);
                        }
                    }
                }
            }

            return Ok(true);
        }
    }

    // Fallback: check if version exists in any of the installed lists
    let is_vanilla = launcher.get_installed_versions()?.contains(&version_id);
    let is_forge = launcher
        .get_installed_forge_versions()?
        .contains(&version_id);
    let is_fabric = launcher
        .get_installed_fabric_versions()?
        .contains(&version_id);
    let is_quilt = launcher
        .get_installed_quilt_versions()?
        .contains(&version_id);

    Ok(is_vanilla || is_forge || is_fabric || is_quilt)
}

#[tauri::command]
async fn get_installed_game_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;

    // Get all profiles with Installed stage and extract their game_version
    let profiles = launcher.state.get_profiles()?;
    let game_versions: Vec<String> = profiles
        .into_iter()
        .filter(|p| p.install_stage == crate::minecraft::state::InstallStage::Installed)
        .map(|p| p.game_version)
        .collect();

    Ok(game_versions)
}

#[tauri::command]
async fn get_fabric_versions_for_mc(
    mc_version: String,
    state: State<'_, AppState>,
) -> Result<Vec<FabricVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_fabric_versions_for_mc(&mc_version).await
}

#[tauri::command]
async fn install_fabric(
    fabric_version: FabricVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_fabric(&fabric_version, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

// Quilt commands
#[tauri::command]
async fn get_quilt_versions(state: State<'_, AppState>) -> Result<Vec<QuiltVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_quilt_versions().await
}

#[tauri::command]
async fn get_installed_quilt_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_quilt_versions()
}

#[tauri::command]
async fn get_quilt_versions_for_mc(
    mc_version: String,
    state: State<'_, AppState>,
) -> Result<Vec<QuiltVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_quilt_versions_for_mc(&mc_version).await
}

#[tauri::command]
async fn install_quilt(
    quilt_version: QuiltVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_quilt(&quilt_version, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

// DragonSkins mod installation
#[tauri::command]
async fn install_fabric_with_dragonskins(
    fabric_version: FabricVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_with_dragonskins(
            "fabric",
            &fabric_version.mc_version,
            &fabric_version.loader_version,
            |progress, status| {
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": progress,
                        "status": status
                    }),
                );
            },
        )
        .await
}

#[tauri::command]
async fn install_quilt_with_dragonskins(
    quilt_version: QuiltVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_with_dragonskins(
            "quilt",
            &quilt_version.mc_version,
            &quilt_version.loader_version,
            |progress, status| {
                let _ = window.emit(
                    "install-progress",
                    serde_json::json!({
                        "progress": progress,
                        "status": status
                    }),
                );
            },
        )
        .await
}

#[tauri::command]
async fn verify_dragonskins_mod(
    mc_version: String,
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .verify_dragonskins_mod(&mc_version, &version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

// Dragon (Fabric-based) commands
#[tauri::command]
async fn get_dragon_versions(state: State<'_, AppState>) -> Result<Vec<DragonVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_dragon_versions().await
}

#[tauri::command]
async fn get_installed_dragon_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_dragon_versions()
}

#[tauri::command]
async fn install_dragon(
    dragon_version: DragonVersionInfo,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_dragon(&dragon_version, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn uninstall_dragon(version_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    // Dragon uses fabric-loader prefix, just remove the version directory
    let version_dir = launcher.game_dir.join("versions").join(&version_id);
    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn install_dragon_mod(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_dragon_mod(&version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn update_dragon_mod(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .update_dragon_mod(&version_id, |_progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": 0.5,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn verify_dragon_mod(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    launcher
        .verify_dragon_mod(&version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn is_dragon_mod_installed(
    version_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    Ok(launcher.is_dragon_mod_installed(&version_id))
}

#[tauri::command]
async fn copy_local_mod(state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;

    // Get the workspace directory (where the launcher source code is)
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;

    // Look for the built mod JAR in lunar-agent/build/libs/
    let build_dir = current_dir.join("lunar-agent").join("build").join("libs");

    if !build_dir.exists() {
        return Err(format!("Build directory not found: {:?}", build_dir));
    }

    // Find the latest dragon-client JAR
    let mut latest_jar: Option<std::path::PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&build_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let filename = path.file_name().unwrap_or_default().to_string_lossy();
            if filename.starts_with("dragon-client")
                && filename.ends_with(".jar")
                && !filename.contains("sources")
            {
                latest_jar = Some(path);
                break;
            }
        }
    }

    let source_jar =
        latest_jar.ok_or_else(|| "No dragon-client JAR found in build/libs".to_string())?;

    // Get the mods directory
    let mods_dir = launcher.game_dir.join("mods");
    let dest_jar = mods_dir.join("dragon-client-latest.jar");

    // Copy the JAR
    std::fs::copy(&source_jar, &dest_jar).map_err(|e| format!("Failed to copy mod: {}", e))?;

    println!(
        "[Dragon] Copied local mod from {:?} to {:?}",
        source_jar, dest_jar
    );

    Ok(())
}

// Bedrock Edition commands
#[tauri::command]
async fn get_bedrock_versions(
    state: State<'_, AppState>,
) -> Result<Vec<BedrockVersionInfo>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_bedrock_versions().await
}

#[tauri::command]
async fn get_installed_bedrock_versions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_installed_bedrock_versions()
}

#[tauri::command]
async fn install_bedrock(
    version_id: String,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher
        .install_bedrock(&version_id, |progress, status| {
            let _ = window.emit(
                "install-progress",
                serde_json::json!({
                    "progress": progress,
                    "status": status
                }),
            );
        })
        .await
}

#[tauri::command]
async fn launch_bedrock(version_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.launch_bedrock(&version_id).await
}

const MARKETPLACE_USER_AGENT: &str = "CraftLauncher/1.0";
const CURSE_TOOLS_API_URL: &str = "https://api.curse.tools/v1";

fn normalize_marketplace_loader(loader: Option<&String>) -> Option<String> {
    let normalized = loader?.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }

    match normalized.as_str() {
        "lapetus" | "dragon" => Some("fabric".to_string()),
        _ => Some(normalized),
    }
}

fn extract_marketplace_slug_from_query(query: &str) -> Option<String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return None;
    }

    let prefixes = [
        "https://modrinth.com/modpack/",
        "http://modrinth.com/modpack/",
        "https://www.modrinth.com/modpack/",
        "http://www.modrinth.com/modpack/",
        "https://modrinth.com/mod/",
        "http://modrinth.com/mod/",
        "https://www.modrinth.com/mod/",
        "http://www.modrinth.com/mod/",
        "https://www.curseforge.com/minecraft/modpacks/",
        "http://www.curseforge.com/minecraft/modpacks/",
        "https://curseforge.com/minecraft/modpacks/",
        "http://curseforge.com/minecraft/modpacks/",
        "https://www.curseforge.com/minecraft/mc-mods/",
        "http://www.curseforge.com/minecraft/mc-mods/",
        "https://curseforge.com/minecraft/mc-mods/",
        "http://curseforge.com/minecraft/mc-mods/",
    ];

    for prefix in prefixes {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let slug = rest
                .split(['?', '#', '/'])
                .next()
                .unwrap_or_default()
                .trim();
            if !slug.is_empty() {
                return Some(slug.to_string());
            }
        }
    }

    None
}

fn normalize_marketplace_search_query(query: &str) -> String {
    extract_marketplace_slug_from_query(query)
        .unwrap_or_else(|| query.trim().to_string())
}

fn normalize_search_words(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_space = true;

    for ch in value.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch);
            last_was_space = false;
        } else if !last_was_space {
            normalized.push(' ');
            last_was_space = true;
        }
    }

    normalized.trim().to_string()
}

fn normalize_search_slug(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_dash = true;

    for ch in value.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch);
            last_was_dash = false;
        } else if !last_was_dash {
            normalized.push('-');
            last_was_dash = true;
        }
    }

    normalized.trim_matches('-').to_string()
}

fn marketplace_result_match_score(hit: &serde_json::Value, raw_query: &str) -> i32 {
    let effective_query = normalize_marketplace_search_query(raw_query);
    if effective_query.is_empty() {
        return 0;
    }

    let query_words = normalize_search_words(&effective_query);
    let query_slug = normalize_search_slug(&effective_query);
    if query_words.is_empty() && query_slug.is_empty() {
        return 0;
    }

    let slug = normalize_search_slug(hit["slug"].as_str().unwrap_or_default());
    let title_words = normalize_search_words(hit["title"].as_str().unwrap_or_default());
    let title_slug = normalize_search_slug(hit["title"].as_str().unwrap_or_default());

    if !query_slug.is_empty() && slug == query_slug {
        return 600;
    }

    if !query_words.is_empty() && title_words == query_words {
        return 560;
    }

    if !query_slug.is_empty() && title_slug == query_slug {
        return 540;
    }

    if !query_slug.is_empty() && (slug.starts_with(&query_slug) || title_slug.starts_with(&query_slug))
    {
        return 420;
    }

    if !query_words.is_empty() && title_words.contains(&query_words) {
        return 320;
    }

    if !query_slug.is_empty() && (slug.contains(&query_slug) || title_slug.contains(&query_slug)) {
        return 260;
    }

    0
}

fn curseforge_loader_id(loader: &str) -> Option<u32> {
    match loader {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

fn is_marketplace_mc_version(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.contains('.')
        && trimmed.chars().all(|c| c.is_ascii_digit() || c == '.')
}

fn compare_marketplace_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let a_parts: Vec<u32> = a
        .split('.')
        .filter_map(|segment| segment.parse::<u32>().ok())
        .collect();
    let b_parts: Vec<u32> = b
        .split('.')
        .filter_map(|segment| segment.parse::<u32>().ok())
        .collect();
    let max_len = a_parts.len().max(b_parts.len());

    for index in 0..max_len {
        let a_value = *a_parts.get(index).unwrap_or(&0);
        let b_value = *b_parts.get(index).unwrap_or(&0);

        match a_value.cmp(&b_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    std::cmp::Ordering::Equal
}

fn latest_marketplace_mc_version(values: &[String]) -> Option<String> {
    let mut versions: Vec<String> = values
        .iter()
        .filter(|value| is_marketplace_mc_version(value))
        .cloned()
        .collect();

    versions.sort_by(|a, b| compare_marketplace_versions(b, a));
    versions.into_iter().next()
}

fn extract_modrinth_gallery_url(value: &serde_json::Value) -> Option<String> {
    if let Some(url) = value.as_str() {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    for key in ["raw_url", "url"] {
        if let Some(url) = value.get(key).and_then(serde_json::Value::as_str) {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

fn extract_modrinth_banner_url(hit: &serde_json::Value) -> String {
    if let Some(gallery) = hit["gallery"].as_array() {
        if let Some(featured_url) = gallery
            .iter()
            .find(|entry| {
                entry
                    .get("featured")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false)
            })
            .and_then(extract_modrinth_gallery_url)
        {
            return featured_url;
        }

        if let Some(first_url) = gallery.iter().find_map(extract_modrinth_gallery_url) {
            return first_url;
        }
    }

    hit["icon_url"].as_str().unwrap_or_default().to_string()
}

fn modrinth_project_matches_filters(
    project: &serde_json::Value,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> bool {
    if project["project_type"].as_str().unwrap_or_default() != "modpack" {
        return false;
    }

    let project_versions = project["game_versions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let project_loaders = project["loaders"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let version_matches = game_version
        .map(|version| project_versions.iter().any(|value| *value == version))
        .unwrap_or(true);
    let loader_matches = loader
        .and_then(|value| normalize_marketplace_loader(Some(value)))
        .map(|normalized_loader| {
            project_loaders
                .iter()
                .any(|value| value.eq_ignore_ascii_case(&normalized_loader))
        })
        .unwrap_or(true);

    version_matches && loader_matches
}

fn modrinth_project_to_search_hit(project: &serde_json::Value) -> serde_json::Value {
    let versions = project["game_versions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .filter(|value| is_marketplace_mc_version(value))
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let banner_url = extract_modrinth_banner_url(project);

    serde_json::json!({
        "project_id": project["id"].as_str().unwrap_or_default(),
        "slug": project["slug"].as_str().unwrap_or_default(),
        "title": project["title"].as_str().unwrap_or("Unknown Modpack"),
        "description": project["description"].as_str().unwrap_or_default(),
        "icon_url": project["icon_url"].as_str().unwrap_or_default(),
        "banner_url": banner_url,
        "downloads": project["downloads"].as_u64().unwrap_or(0),
        "versions": versions.clone(),
        "mc_version": latest_marketplace_mc_version(&versions).unwrap_or_default(),
        "date_modified": project["updated"]
            .as_str()
            .or_else(|| project["date_modified"].as_str())
            .unwrap_or_default(),
        "website_url": if project["slug"].as_str().unwrap_or_default().is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(format!(
                "https://modrinth.com/modpack/{}",
                project["slug"].as_str().unwrap_or_default()
            ))
        },
        "source": "modrinth",
    })
}

async fn fetch_modrinth_modpack_by_slug(
    query: &str,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> Result<Option<serde_json::Value>, String> {
    let slug = normalize_search_slug(&normalize_marketplace_search_query(query));
    if slug.is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!("https://api.modrinth.com/v2/project/{}", slug))
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Modrinth direct modpack lookup failed: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!(
            "Modrinth direct modpack lookup failed with status {}",
            response.status()
        ));
    }

    let project: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Modrinth direct modpack lookup JSON parse failed: {}", e))?;

    if !modrinth_project_matches_filters(&project, game_version, loader) {
        return Ok(None);
    }

    Ok(Some(modrinth_project_to_search_hit(&project)))
}

fn modrinth_mod_matches_filters(
    project: &serde_json::Value,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> bool {
    if project["project_type"].as_str().unwrap_or_default() != "mod" {
        return false;
    }

    let project_versions = project["game_versions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let project_loaders = project["loaders"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let version_matches = game_version
        .map(|version| project_versions.iter().any(|value| *value == version))
        .unwrap_or(true);
    let loader_matches = loader
        .and_then(|value| normalize_marketplace_loader(Some(value)))
        .map(|normalized_loader| {
            project_loaders
                .iter()
                .any(|value| value.eq_ignore_ascii_case(&normalized_loader))
        })
        .unwrap_or(true);

    version_matches && loader_matches
}

fn modrinth_mod_to_search_hit(project: &serde_json::Value) -> serde_json::Value {
    let versions = project["game_versions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .filter(|value| is_marketplace_mc_version(value))
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let categories = project["categories"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    serde_json::json!({
        "project_id": project["id"].as_str().unwrap_or_default(),
        "slug": project["slug"].as_str().unwrap_or_default(),
        "title": project["title"].as_str().unwrap_or("Unknown Mod"),
        "description": project["description"].as_str().unwrap_or_default(),
        "categories": categories,
        "downloads": project["downloads"].as_u64().unwrap_or(0),
        "icon_url": project["icon_url"].as_str().unwrap_or_default(),
        "author": project["author"].as_str().unwrap_or_default(),
        "versions": versions,
        "date_modified": project["updated"]
            .as_str()
            .or_else(|| project["date_modified"].as_str())
            .unwrap_or_default(),
        "website_url": if project["slug"].as_str().unwrap_or_default().is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(format!(
                "https://modrinth.com/mod/{}",
                project["slug"].as_str().unwrap_or_default()
            ))
        },
        "source": "modrinth",
    })
}

async fn fetch_modrinth_mod_by_slug(
    query: &str,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> Result<Option<serde_json::Value>, String> {
    let slug = normalize_search_slug(&normalize_marketplace_search_query(query));
    if slug.is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!("https://api.modrinth.com/v2/project/{}", slug))
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Modrinth direct mod lookup failed: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!(
            "Modrinth direct mod lookup failed with status {}",
            response.status()
        ));
    }

    let project: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Modrinth direct mod lookup JSON parse failed: {}", e))?;

    if !modrinth_mod_matches_filters(&project, game_version, loader) {
        return Ok(None);
    }

    Ok(Some(modrinth_mod_to_search_hit(&project)))
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();

    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value);
        }
    }

    deduped
}

fn extract_curseforge_game_versions(file: &serde_json::Value) -> Vec<String> {
    let values = file["gameVersions"]
        .as_array()
        .map(|versions| {
            versions
                .iter()
                .filter_map(|value| value.as_str())
                .filter(|value| is_marketplace_mc_version(value))
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    dedupe_strings(values)
}

fn extract_curseforge_loaders(file: &serde_json::Value) -> Vec<String> {
    let values = file["gameVersions"]
        .as_array()
        .map(|versions| {
            versions
                .iter()
                .filter_map(|value| value.as_str())
                .filter_map(|value| {
                    let normalized = value.to_ascii_lowercase();
                    match normalized.as_str() {
                        "fabric" => Some("fabric".to_string()),
                        "forge" => Some("forge".to_string()),
                        "quilt" => Some("quilt".to_string()),
                        "neoforge" | "neo forge" => Some("neoforge".to_string()),
                        _ => None,
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    dedupe_strings(values)
}

fn curseforge_file_is_installable(file: &serde_json::Value) -> bool {
    let file_name = file["fileName"].as_str().unwrap_or_default();
    let download_url = file["downloadUrl"].as_str().unwrap_or_default();

    !file_name.is_empty()
        && !download_url.is_empty()
        && file_name.to_ascii_lowercase().ends_with(".jar")
}

fn curseforge_modpack_file_is_installable(file: &serde_json::Value) -> bool {
    let file_name = file["fileName"].as_str().unwrap_or_default();
    let download_url = file["downloadUrl"].as_str().unwrap_or_default();

    !file_name.is_empty()
        && !download_url.is_empty()
        && file_name.to_ascii_lowercase().ends_with(".zip")
}

fn curseforge_file_matches(
    file: &serde_json::Value,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> bool {
    if !curseforge_file_is_installable(file) {
        return false;
    }

    let file_game_versions = extract_curseforge_game_versions(file);
    let file_loaders = extract_curseforge_loaders(file);

    let version_matches = game_version
        .map(|version| file_game_versions.iter().any(|value| value == version))
        .unwrap_or(true);

    let loader_matches = loader
        .and_then(|value| normalize_marketplace_loader(Some(value)))
        .map(|normalized_loader| {
            file_loaders
                .iter()
                .any(|value| value.eq_ignore_ascii_case(&normalized_loader))
        })
        .unwrap_or(true);

    version_matches && loader_matches
}

fn curseforge_modpack_file_matches(
    file: &serde_json::Value,
    game_version: Option<&String>,
    loader: Option<&String>,
) -> bool {
    if !curseforge_modpack_file_is_installable(file) {
        return false;
    }

    let file_game_versions = extract_curseforge_game_versions(file);
    let file_loaders = extract_curseforge_loaders(file);

    let version_matches = game_version
        .map(|version| file_game_versions.iter().any(|value| value == version))
        .unwrap_or(true);

    let loader_matches = loader
        .and_then(|value| normalize_marketplace_loader(Some(value)))
        .map(|normalized_loader| {
            file_loaders
                .iter()
                .any(|value| value.eq_ignore_ascii_case(&normalized_loader))
        })
        .unwrap_or(true);

    version_matches && loader_matches
}

fn annotate_modrinth_hits_with_source(data: &mut serde_json::Value) {
    if let Some(hits) = data["hits"].as_array_mut() {
        for hit in hits {
            if let Some(object) = hit.as_object_mut() {
                object.insert(
                    "source".to_string(),
                    serde_json::Value::String("modrinth".to_string()),
                );
            }
        }
    }
}

async fn search_modrinth_modpacks(
    query: &str,
    game_version: Option<String>,
    loader: Option<String>,
    limit: u32,
    offset: u32,
) -> Result<serde_json::Value, String> {
    let normalized_loader = normalize_marketplace_loader(loader.as_ref());
    let client = reqwest::Client::new();

    let mut facets = vec!["[\"project_type:modpack\"]".to_string()];

    if let Some(ref version) = game_version {
        facets.push(format!("[\"versions:{}\"]", version));
    }

    if let Some(ref loader_name) = normalized_loader {
        facets.push(format!("[\"categories:{}\"]", loader_name.to_lowercase()));
    }

    let mut url = format!(
        "https://api.modrinth.com/v2/search?facets={}&limit={}&offset={}&index=downloads",
        urlencoding::encode(&format!("[{}]", facets.join(","))),
        limit,
        offset
    );

    if !query.trim().is_empty() {
        url.push_str(&format!("&query={}", urlencoding::encode(query)));
    }

    println!("[Modpack Search][Modrinth] URL: {}", url);

    let response = client
        .get(&url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Modrinth modpack search failed: {}", e))?;

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Modrinth modpack search JSON parse failed: {}", e))?;

    let hits = data["hits"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|hit| {
            let versions = hit["versions"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|value| value.as_str())
                        .filter(|value| is_marketplace_mc_version(value))
                        .map(|value| value.to_string())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let banner_url = extract_modrinth_banner_url(&hit);

            serde_json::json!({
                "project_id": hit["project_id"].as_str().unwrap_or_default(),
                "slug": hit["slug"].as_str().unwrap_or_default(),
                "title": hit["title"].as_str().unwrap_or("Unknown Modpack"),
                "description": hit["description"].as_str().unwrap_or_default(),
                "icon_url": hit["icon_url"].as_str().unwrap_or_default(),
                "banner_url": banner_url,
                "downloads": hit["downloads"].as_u64().unwrap_or(0),
                "versions": versions.clone(),
                "mc_version": latest_marketplace_mc_version(&versions).unwrap_or_default(),
                "date_modified": hit["date_modified"].as_str().unwrap_or_default(),
                "website_url": if hit["slug"].as_str().unwrap_or_default().is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::Value::String(format!("https://modrinth.com/modpack/{}", hit["slug"].as_str().unwrap_or_default()))
                },
                "source": "modrinth",
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "hits": hits,
        "total_hits": data["total_hits"].as_u64().unwrap_or(0),
    }))
}

async fn search_curseforge_mods(
    query: &str,
    game_version: Option<String>,
    loader: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<serde_json::Value, String> {
    let normalized_loader = normalize_marketplace_loader(loader.as_ref());
    let page_size = limit.unwrap_or(20);
    let page_index = offset.unwrap_or(0);

    let mut url = format!(
        "{}/mods/search?gameId=432&classId=6&searchFilter={}&pageSize={}&index={}",
        CURSE_TOOLS_API_URL,
        urlencoding::encode(query),
        page_size,
        page_index
    );

    if let Some(ref version) = game_version {
        url.push_str(&format!("&gameVersion={}", urlencoding::encode(version)));
    }

    if let Some(ref loader_name) = normalized_loader {
        if let Some(loader_id) = curseforge_loader_id(loader_name) {
            url.push_str(&format!("&modLoaderType={}", loader_id));
        }
    }

    println!("[CurseForge Search] URL: {}", url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("CurseForge search failed: {}", e))?;

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("CurseForge search JSON parse failed: {}", e))?;

    let mut hits = Vec::new();

    if let Some(mods) = data["data"].as_array() {
        for mod_item in mods {
            let latest_files = mod_item["latestFiles"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let matching_files: Vec<serde_json::Value> = latest_files
                .into_iter()
                .filter(|file| {
                    curseforge_file_matches(file, game_version.as_ref(), normalized_loader.as_ref())
                })
                .collect();

            if matching_files.is_empty() {
                continue;
            }

            let project_id = mod_item["id"]
                .as_i64()
                .map(|id| id.to_string())
                .unwrap_or_default();

            if project_id.is_empty() {
                continue;
            }

            let versions = dedupe_strings(
                matching_files
                    .iter()
                    .flat_map(extract_curseforge_game_versions)
                    .collect(),
            );

            let categories = mod_item["categories"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|category| category["slug"].as_str())
                        .map(|category| category.to_string())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let author = mod_item["authors"]
                .as_array()
                .and_then(|authors| authors.first())
                .and_then(|author| author["name"].as_str())
                .unwrap_or("Unknown");

            let icon_url = mod_item["logo"]["thumbnailUrl"]
                .as_str()
                .or_else(|| mod_item["logo"]["url"].as_str())
                .unwrap_or_default();

            hits.push(serde_json::json!({
                "project_id": project_id,
                "slug": mod_item["slug"].as_str().unwrap_or_default(),
                "title": mod_item["name"].as_str().unwrap_or("Unknown Mod"),
                "description": mod_item["summary"].as_str().unwrap_or_default(),
                "categories": categories,
                "downloads": mod_item["downloadCount"].as_u64().unwrap_or(0),
                "icon_url": icon_url,
                "author": author,
                "versions": versions,
                "date_modified": mod_item["dateModified"].as_str().unwrap_or_default(),
                "source": "curseforge",
            }));
        }
    }

    println!("[CurseForge Search] Results: {} hits", hits.len());

    Ok(serde_json::json!({
        "hits": hits,
        "total_hits": hits.len(),
    }))
}

async fn search_curseforge_modpacks(
    query: &str,
    game_version: Option<String>,
    loader: Option<String>,
    limit: u32,
    offset: u32,
) -> Result<serde_json::Value, String> {
    let normalized_loader = normalize_marketplace_loader(loader.as_ref());

    let mut url = format!(
        "{}/mods/search?gameId=432&classId=4471&pageSize={}&index={}",
        CURSE_TOOLS_API_URL, limit, offset
    );

    if !query.trim().is_empty() {
        url.push_str(&format!("&searchFilter={}", urlencoding::encode(query)));
    }

    if let Some(ref version) = game_version {
        url.push_str(&format!("&gameVersion={}", urlencoding::encode(version)));
    }

    if let Some(ref loader_name) = normalized_loader {
        if let Some(loader_id) = curseforge_loader_id(loader_name) {
            url.push_str(&format!("&modLoaderType={}", loader_id));
        }
    }

    println!("[Modpack Search][CurseForge] URL: {}", url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("CurseForge modpack search failed: {}", e))?;

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("CurseForge modpack search JSON parse failed: {}", e))?;

    let mut hits = Vec::new();

    if let Some(modpacks) = data["data"].as_array() {
        for modpack in modpacks {
            let latest_files = modpack["latestFiles"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let matching_files: Vec<serde_json::Value> = latest_files
                .into_iter()
                .filter(|file| {
                    curseforge_modpack_file_matches(
                        file,
                        game_version.as_ref(),
                        normalized_loader.as_ref(),
                    )
                })
                .collect();

            if matching_files.is_empty() {
                continue;
            }

            let versions = dedupe_strings(
                matching_files
                    .iter()
                    .flat_map(extract_curseforge_game_versions)
                    .collect(),
            );

            let slug = modpack["slug"].as_str().unwrap_or_default();
            hits.push(serde_json::json!({
                "project_id": modpack["id"].as_i64().map(|id| id.to_string()).unwrap_or_default(),
                "slug": slug,
                "title": modpack["name"].as_str().unwrap_or("Unknown Modpack"),
                "description": modpack["summary"].as_str().unwrap_or_default(),
                "icon_url": modpack["logo"]["thumbnailUrl"].as_str().or_else(|| modpack["logo"]["url"].as_str()).unwrap_or_default(),
                "downloads": modpack["downloadCount"].as_u64().unwrap_or(0),
                "versions": versions.clone(),
                "mc_version": latest_marketplace_mc_version(&versions).unwrap_or_default(),
                "date_modified": modpack["dateModified"].as_str().unwrap_or_default(),
                "website_url": if slug.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::Value::String(format!("https://www.curseforge.com/minecraft/modpacks/{}", slug))
                },
                "source": "curseforge",
            }));
        }
    }

    Ok(serde_json::json!({
        "hits": hits,
        "total_hits": data["pagination"]["totalCount"].as_u64().unwrap_or(0),
    }))
}

#[tauri::command]
async fn search_modpacks(
    query: String,
    game_version: Option<String>,
    loader: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<serde_json::Value, String> {
    let page_size = limit.unwrap_or(20);
    let page_offset = offset.unwrap_or(0);
    let effective_query = normalize_marketplace_search_query(&query);
    let has_query = !effective_query.trim().is_empty();
    let fetch_size = page_size
        .saturating_add(page_offset)
        .max(page_size)
        .max(if has_query { 24 } else { page_size });

    let (modrinth_result, curseforge_result) = tokio::join!(
        search_modrinth_modpacks(
            &effective_query,
            game_version.clone(),
            loader.clone(),
            fetch_size,
            0
        ),
        search_curseforge_modpacks(
            &effective_query,
            game_version.clone(),
            loader.clone(),
            fetch_size,
            0
        )
    );

    let modrinth_data = match modrinth_result {
        Ok(data) => data,
        Err(error) => {
            eprintln!("[Modpack Search] Modrinth search failed: {}", error);
            serde_json::json!({
                "hits": [],
                "total_hits": 0,
            })
        }
    };
    let curseforge_data = match curseforge_result {
        Ok(data) => data,
        Err(error) => {
            eprintln!("[Modpack Search] CurseForge search failed: {}", error);
            serde_json::json!({
                "hits": [],
                "total_hits": 0,
            })
        }
    };

    let mut combined_hits = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for data in [&modrinth_data, &curseforge_data] {
        if let Some(hits) = data["hits"].as_array() {
            for hit in hits {
                let source = hit["source"].as_str().unwrap_or("modrinth");
                let project_id = hit["project_id"].as_str().unwrap_or_default();
                let dedupe_key = format!("{}:{}", source, project_id);

                if seen.insert(dedupe_key) {
                    combined_hits.push(hit.clone());
                }
            }
        }
    }

    if has_query {
        if let Some(exact_modrinth_hit) = fetch_modrinth_modpack_by_slug(
            &query,
            game_version.as_ref(),
            loader.as_ref(),
        )
        .await?
        {
            let source = exact_modrinth_hit["source"].as_str().unwrap_or("modrinth");
            let project_id = exact_modrinth_hit["project_id"].as_str().unwrap_or_default();
            let dedupe_key = format!("{}:{}", source, project_id);
            if seen.insert(dedupe_key) {
                combined_hits.push(exact_modrinth_hit);
            }
        }
    }

    combined_hits.sort_by(|a, b| {
        let b_score = marketplace_result_match_score(b, &query);
        let a_score = marketplace_result_match_score(a, &query);

        b_score
            .cmp(&a_score)
            .then_with(|| {
                b["downloads"]
                    .as_u64()
                    .unwrap_or(0)
                    .cmp(&a["downloads"].as_u64().unwrap_or(0))
            })
            .then_with(|| {
                b["date_modified"]
                    .as_str()
                    .unwrap_or_default()
                    .cmp(a["date_modified"].as_str().unwrap_or_default())
            })
    });

    let start = page_offset as usize;
    let end = start.saturating_add(page_size as usize);
    let paged_hits = if start >= combined_hits.len() {
        Vec::new()
    } else {
        combined_hits[start..combined_hits.len().min(end)].to_vec()
    };

    Ok(serde_json::json!({
        "hits": paged_hits,
        "total_hits": modrinth_data["total_hits"].as_u64().unwrap_or(0)
            + curseforge_data["total_hits"].as_u64().unwrap_or(0),
    }))
}

// Modrinth API commands for mod marketplace
#[tauri::command]
async fn search_mods(
    query: String,
    game_version: Option<String>,
    loader: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<serde_json::Value, String> {
    println!("[Mod Search] Query: {}", query);
    println!("[Mod Search] Game Version: {:?}", game_version);
    println!("[Mod Search] Loader: {:?}", loader);
    println!("[Mod Search] Limit: {:?}, Offset: {:?}", limit, offset);

    let normalized_loader = normalize_marketplace_loader(loader.as_ref());
    let client = reqwest::Client::new();
    let page_size = limit.unwrap_or(20);
    let page_offset = offset.unwrap_or(0);
    let effective_query = normalize_marketplace_search_query(&query);
    let has_query = !effective_query.trim().is_empty();
    let fetch_size = page_size
        .saturating_add(page_offset)
        .max(page_size)
        .max(if has_query { 24 } else { page_size });

    let mut facets = vec!["[\"project_type:mod\"]".to_string()];
    if let Some(ref version) = game_version {
        facets.push(format!("[\"versions:{}\"]", version));
    }
    if let Some(ref loader_name) = normalized_loader {
        facets.push(format!("[\"categories:{}\"]", loader_name.to_lowercase()));
    }

    let facets_str = format!("[{}]", facets.join(","));
    let modrinth_url = format!(
        "https://api.modrinth.com/v2/search?query={}&facets={}&limit={}&offset={}",
        urlencoding::encode(&effective_query),
        urlencoding::encode(&facets_str),
        fetch_size,
        0
    );

    println!("[Mod Search] Modrinth URL: {}", modrinth_url);

    let modrinth_response = client
        .get(&modrinth_url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| {
            println!("[Mod Search] Modrinth request error: {}", e);
            e.to_string()
        })?;

    let mut modrinth_data: serde_json::Value = modrinth_response.json().await.map_err(|e| {
        println!("[Mod Search] Modrinth JSON parse error: {}", e);
        e.to_string()
    })?;
    annotate_modrinth_hits_with_source(&mut modrinth_data);

    let curseforge_data = search_curseforge_mods(
        &effective_query,
        game_version.clone(),
        loader.clone(),
        Some(fetch_size),
        Some(0),
    )
    .await?;

    let mut combined_hits = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for data in [&modrinth_data, &curseforge_data] {
        if let Some(hits) = data["hits"].as_array() {
            for hit in hits {
                let source = hit["source"].as_str().unwrap_or("modrinth");
                let project_id = hit["project_id"].as_str().unwrap_or_default();
                let dedupe_key = format!("{}:{}", source, project_id);

                if seen.insert(dedupe_key) {
                    combined_hits.push(hit.clone());
                }
            }
        }
    }

    if has_query {
        if let Some(exact_modrinth_hit) =
            fetch_modrinth_mod_by_slug(&query, game_version.as_ref(), loader.as_ref()).await?
        {
            let source = exact_modrinth_hit["source"].as_str().unwrap_or("modrinth");
            let project_id = exact_modrinth_hit["project_id"].as_str().unwrap_or_default();
            let dedupe_key = format!("{}:{}", source, project_id);
            if seen.insert(dedupe_key) {
                combined_hits.push(exact_modrinth_hit);
            }
        }
    }

    combined_hits.sort_by(|a, b| {
        let b_score = marketplace_result_match_score(b, &query);
        let a_score = marketplace_result_match_score(a, &query);

        b_score
            .cmp(&a_score)
            .then_with(|| {
                b["downloads"]
                    .as_u64()
                    .unwrap_or(0)
                    .cmp(&a["downloads"].as_u64().unwrap_or(0))
            })
            .then_with(|| {
                b["date_modified"]
                    .as_str()
                    .unwrap_or_default()
                    .cmp(a["date_modified"].as_str().unwrap_or_default())
            })
    });

    let start = page_offset as usize;
    let end = start.saturating_add(page_size as usize);
    let paged_hits = if start >= combined_hits.len() {
        Vec::new()
    } else {
        combined_hits[start..combined_hits.len().min(end)].to_vec()
    };

    Ok(serde_json::json!({
        "hits": paged_hits,
        "total_hits": modrinth_data["total_hits"].as_u64().unwrap_or(0)
            + curseforge_data["total_hits"].as_u64().unwrap_or(0),
    }))
}

#[tauri::command]
async fn get_mod_details(
    project_id: String,
    source: Option<String>,
) -> Result<serde_json::Value, String> {
    let normalized_source = source.unwrap_or_else(|| "modrinth".to_string());
    let client = reqwest::Client::new();

    if normalized_source.eq_ignore_ascii_case("curseforge") {
        let response = client
            .get(&format!("{}/mods/{}", CURSE_TOOLS_API_URL, project_id))
            .header("User-Agent", MARKETPLACE_USER_AGENT)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let mod_data = &data["data"];

        let gallery = mod_data["screenshots"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item["url"].as_str())
                    .map(|url| serde_json::json!({ "url": url }))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let discord_url = mod_data["socialLinks"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["type"].as_i64() == Some(2))
                    .and_then(|item| item["url"].as_str())
            })
            .unwrap_or_default();

        let project_id_for_response = project_id.clone();

        return Ok(serde_json::json!({
            "id": project_id_for_response,
            "project_id": project_id,
            "slug": mod_data["slug"].as_str().unwrap_or_default(),
            "title": mod_data["name"].as_str().unwrap_or("Unknown Mod"),
            "description": mod_data["summary"].as_str().unwrap_or_default(),
            "body": mod_data["summary"].as_str().unwrap_or_default(),
            "categories": mod_data["categories"].as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|item| item["slug"].as_str())
                    .map(|item| item.to_string())
                    .collect::<Vec<_>>()
            }).unwrap_or_default(),
            "downloads": mod_data["downloadCount"].as_u64().unwrap_or(0),
            "icon_url": mod_data["logo"]["url"].as_str().or_else(|| mod_data["logo"]["thumbnailUrl"].as_str()).unwrap_or_default(),
            "source_url": mod_data["links"]["sourceUrl"].as_str(),
            "wiki_url": mod_data["links"]["wikiUrl"].as_str(),
            "discord_url": if discord_url.is_empty() { None::<String> } else { Some(discord_url.to_string()) },
            "gallery": gallery,
            "website_url": mod_data["links"]["websiteUrl"].as_str(),
            "source": "curseforge",
        }));
    }

    let response = client
        .get(&format!(
            "https://api.modrinth.com/v2/project/{}",
            project_id
        ))
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if let Some(object) = data.as_object_mut() {
        object.insert(
            "source".to_string(),
            serde_json::Value::String("modrinth".to_string()),
        );
    }
    Ok(data)
}

#[tauri::command]
async fn get_mod_versions(
    project_id: String,
    source: Option<String>,
) -> Result<serde_json::Value, String> {
    let normalized_source = source.unwrap_or_else(|| "modrinth".to_string());
    let client = reqwest::Client::new();

    if normalized_source.eq_ignore_ascii_case("curseforge") {
        let response = client
            .get(&format!("{}/mods/{}", CURSE_TOOLS_API_URL, project_id))
            .header("User-Agent", MARKETPLACE_USER_AGENT)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let project_id_for_files = project_id.clone();
        let versions = data["data"]["latestFiles"]
            .as_array()
            .map(|files| {
                files
                    .iter()
                    .filter(|file| curseforge_file_is_installable(file))
                    .map(|file| {
                        serde_json::json!({
                            "id": file["id"].as_i64().map(|id| id.to_string()).unwrap_or_default(),
                            "project_id": project_id_for_files.clone(),
                            "name": file["displayName"].as_str().or_else(|| file["fileName"].as_str()).unwrap_or_default(),
                            "version_number": file["displayName"].as_str().or_else(|| file["fileName"].as_str()).unwrap_or_default(),
                            "game_versions": extract_curseforge_game_versions(file),
                            "loaders": extract_curseforge_loaders(file),
                            "downloads": file["downloadCount"].as_u64().unwrap_or(0),
                            "date_published": file["fileDate"].as_str().unwrap_or_default(),
                            "files": [{
                                "url": file["downloadUrl"].as_str().unwrap_or_default(),
                                "filename": file["fileName"].as_str().unwrap_or_default(),
                                "size": file["fileLength"].as_u64().unwrap_or(0),
                            }],
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        return Ok(serde_json::Value::Array(versions));
    }

    let response = client
        .get(&format!(
            "https://api.modrinth.com/v2/project/{}/version",
            project_id
        ))
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
async fn get_featured_mods(
    limit: Option<u32>,
    loader: Option<String>,
    game_version: Option<String>,
    offset: Option<u32>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    // Build facets array
    let mut facets = vec!["[\"project_type:mod\"]".to_string()];

    // Add game version filter
    if let Some(ref version) = game_version {
        facets.push(format!("[\"versions:{}\"]", version));
    }

    // Add loader filter
    if let Some(ref ldr) = loader {
        // Map lapetus to fabric since Lapetus uses Fabric loader
        let loader_name = if ldr == "lapetus" { "fabric" } else { ldr };
        facets.push(format!("[\"categories:{}\"]", loader_name.to_lowercase()));
    }

    let facets_str = format!("[{}]", facets.join(","));
    let url = format!(
        "https://api.modrinth.com/v2/search?facets={}&limit={}&offset={}&index=downloads",
        urlencoding::encode(&facets_str),
        limit.unwrap_or(12),
        offset.unwrap_or(0)
    );

    let response = client
        .get(&url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    annotate_modrinth_hits_with_source(&mut data);
    Ok(data)
}

// Get mod icon URL from Modrinth by mod slug/id
#[tauri::command]
async fn get_mod_icon_from_modrinth(mod_id: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();

    // Try to get project by slug first (most common case)
    let url = format!(
        "https://api.modrinth.com/v2/project/{}",
        urlencoding::encode(&mod_id)
    );

    let response = client
        .get(&url)
        .header("User-Agent", MARKETPLACE_USER_AGENT)
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(icon_url) = data["icon_url"].as_str() {
                    return Ok(Some(icon_url.to_string()));
                }
            }
        }
        _ => {}
    }

    Ok(None)
}

// Batch get mod icons from Modrinth for multiple mod IDs
#[tauri::command]
async fn get_mod_icons_batch(
    mod_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let client = reqwest::Client::new();
    let mut icons: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    // Filter out empty mod_ids
    let valid_ids: Vec<String> = mod_ids
        .iter()
        .filter(|id| !id.is_empty())
        .map(|id| id.to_lowercase().replace("_", "-")) // Normalize: fabric_api -> fabric-api
        .collect();

    if valid_ids.is_empty() {
        return Ok(icons);
    }

    println!(
        "[INFO] Fetching icons for {} mods from Modrinth",
        valid_ids.len()
    );

    // Try individual lookups for each mod (more reliable than batch)
    for mod_id in &valid_ids {
        // Try direct project lookup by slug
        let url = format!(
            "https://api.modrinth.com/v2/project/{}",
            urlencoding::encode(mod_id)
        );
        if let Ok(resp) = client
            .get(&url)
            .header("User-Agent", "CraftLauncher/1.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(icon_url) = data["icon_url"].as_str() {
                        if !icon_url.is_empty() {
                            // Store with original mod_id (before normalization)
                            let original_id = mod_ids
                                .iter()
                                .find(|id| id.to_lowercase().replace("_", "-") == *mod_id)
                                .cloned()
                                .unwrap_or_else(|| mod_id.clone());
                            icons.insert(original_id, icon_url.to_string());
                            println!("[INFO] Found icon for mod: {}", mod_id);
                        }
                    }
                }
            }
        }

        // Small delay to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }

    println!(
        "[INFO] Found icons for {} out of {} mods",
        icons.len(),
        valid_ids.len()
    );

    Ok(icons)
}

#[tauri::command]
async fn download_mod(
    _project_id: String,
    _version_id: String,
    filename: String,
    download_url: String,
    game_version: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;

    // Determine the correct mods directory based on version type
    // Check if this version has an instance directory (modpacks and modded versions)
    let instance_dir = launcher.game_dir.join("instances").join(&game_version);
    let is_modded_target = instance_dir.exists() || looks_like_modded_version(&game_version);

    let mods_dir = if is_modded_target {
        // Use instance-specific mods directory for modpacks and modded versions
        instance_dir.join("mods")
    } else {
        // Vanilla uses global mods folder (though vanilla doesn't support mods)
        launcher.game_dir.join("mods")
    };

    // Create mods directory if it doesn't exist
    if !mods_dir.exists() {
        std::fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;
    }

    let mod_path = mods_dir.join(&filename);

    println!(
        "[INFO] Downloading mod {} to {} (version: {})",
        filename,
        mod_path.display(),
        game_version
    );

    // Download the mod file
    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header("User-Agent", "Lapetus/1.0 (contact@lapetus.dev)")
        .send()
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if bytes.is_empty() {
        return Err("Downloaded file is empty".to_string());
    }

    std::fs::write(&mod_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    println!(
        "[INFO] Successfully downloaded {} ({} bytes) to {}",
        filename,
        bytes.len(),
        mods_dir.display()
    );

    Ok(mod_path.to_string_lossy().to_string())
}

// Get all mods from the mods folder for a specific version
#[tauri::command]
async fn get_all_mods(
    version_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;

    // Determine the correct mods directory based on version
    // All modded versions and modpacks use instances directory for isolation
    let mods_dir = if let Some(ref version) = version_id {
        // Check if this version has an instance directory (modpacks and modded versions)
        let instance_dir = launcher.game_dir.join("instances").join(version);

        if instance_dir.exists() || looks_like_modded_version(version) {
            // Use instance-specific mods directory for modpacks and modded versions
            instance_dir.join("mods")
        } else {
            // Fallback to global mods directory for vanilla
            launcher.game_dir.join("mods")
        }
    } else {
        launcher.game_dir.join("mods")
    };

    let icons_cache_dir = launcher.game_dir.join("mod-icons");

    // Create mods directory if it doesn't exist
    let _ = std::fs::create_dir_all(&mods_dir);
    // Create icons cache directory
    let _ = std::fs::create_dir_all(&icons_cache_dir);

    println!(
        "[INFO] Loading mods from: {} (version: {:?})",
        mods_dir.display(),
        version_id
    );

    let mut mods: Vec<serde_json::Value> = Vec::new();

    if mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();

                // Skip directories and non-jar files
                if path.is_dir() {
                    continue;
                }

                let path_str = path.to_string_lossy().to_string();
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let name_lower = name.to_ascii_lowercase();

                // Include both .jar (enabled) and .jar.disabled (disabled) mods
                let is_jar = name_lower.ends_with(".jar");
                let is_disabled = name_lower.ends_with(".jar.disabled");

                if is_jar || is_disabled {
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let enabled = !is_disabled;

                    // Try to extract mod info from filename
                    let display_name = strip_mod_file_suffix(&name);

                    // Try to extract icon from JAR and get mod metadata
                    let (icon_path, mod_id, mod_name, mod_version, mod_author) =
                        extract_mod_info(&path, &icons_cache_dir);

                    println!(
                        "[INFO] Found mod: {} (id: {:?}, version: {:?})",
                        mod_name.as_ref().unwrap_or(&display_name),
                        mod_id,
                        mod_version
                    );

                    mods.push(serde_json::json!({
                        "name": name,
                        "display_name": mod_name.unwrap_or(display_name),
                        "mod_id": mod_id,
                        "version": mod_version,
                        "author": mod_author,
                        "path": path_str,
                        "size": size,
                        "enabled": enabled,
                        "icon_path": icon_path
                    }));
                }
            }
        } else {
            println!(
                "[WARN] Failed to read mods directory: {}",
                mods_dir.display()
            );
        }
    } else {
        println!(
            "[WARN] Mods directory does not exist: {}",
            mods_dir.display()
        );
    }

    // Sort by name
    mods.sort_by(|a, b| {
        let name_a = a["display_name"].as_str().unwrap_or("");
        let name_b = b["display_name"].as_str().unwrap_or("");
        name_a.to_lowercase().cmp(&name_b.to_lowercase())
    });

    println!("[INFO] Found {} mods total", mods.len());

    Ok(mods)
}

// Extract mod info and icon from JAR file
fn extract_mod_info(
    jar_path: &std::path::Path,
    icons_cache_dir: &std::path::Path,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let file = match std::fs::File::open(jar_path) {
        Ok(f) => f,
        Err(_) => return (None, None, None, None, None),
    };

    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return (None, None, None, None, None),
    };

    let mut icon_path: Option<String> = None;
    let mut mod_id: Option<String> = None;
    let mut mod_name: Option<String> = None;
    let mut mod_version: Option<String> = None;
    let mut mod_author: Option<String> = None;

    // Try to read fabric.mod.json for Fabric mods
    let mut icon_field: Option<String> = None;

    if let Ok(mut file) = archive.by_name("fabric.mod.json") {
        let mut contents = String::new();
        if file.read_to_string(&mut contents).is_ok() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                mod_id = json["id"].as_str().map(|s| s.to_string());
                mod_name = json["name"].as_str().map(|s| s.to_string());
                mod_version = json["version"].as_str().map(|s| s.to_string());
                icon_field = json["icon"].as_str().map(|s| s.to_string());

                // Get author(s)
                if let Some(authors) = json["authors"].as_array() {
                    let author_names: Vec<String> = authors
                        .iter()
                        .filter_map(|a| {
                            if let Some(s) = a.as_str() {
                                Some(s.to_string())
                            } else if let Some(obj) = a.as_object() {
                                obj.get("name")
                                    .and_then(|n| n.as_str())
                                    .map(|s| s.to_string())
                            } else {
                                None
                            }
                        })
                        .collect();
                    if !author_names.is_empty() {
                        mod_author = Some(author_names.join(", "));
                    }
                }
            }
        }
    }

    // Try to read quilt.mod.json for Quilt mods
    if mod_id.is_none() {
        if let Ok(mut file) = archive.by_name("quilt.mod.json") {
            let mut contents = String::new();
            if file.read_to_string(&mut contents).is_ok() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    if let Some(loader) = json["quilt_loader"].as_object() {
                        mod_id = loader
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        mod_version = loader
                            .get("version")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        icon_field = json["icon"].as_str().map(|s| s.to_string());

                        if let Some(metadata) = loader.get("metadata").and_then(|m| m.as_object()) {
                            mod_name = metadata
                                .get("name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                    }
                }
            }
        }
    }

    // Try to read mods.toml for Forge mods
    if mod_id.is_none() {
        if let Ok(mut file) = archive.by_name("META-INF/mods.toml") {
            let mut contents = String::new();
            if file.read_to_string(&mut contents).is_ok() {
                // Simple TOML parsing for mod info
                for line in contents.lines() {
                    let line = line.trim();
                    if line.starts_with("modId") {
                        mod_id = parse_toml_assignment_value(line);
                    } else if line.starts_with("displayName") {
                        mod_name = parse_toml_assignment_value(line);
                    } else if line.starts_with("version") && mod_version.is_none() {
                        mod_version = parse_toml_assignment_value(line);
                    } else if line.starts_with("authors") {
                        mod_author = parse_toml_assignment_value(line);
                    } else if line.starts_with("logoFile") {
                        icon_field = parse_toml_assignment_value(line);
                    }
                }
            }
        }
    }

    mod_id = mod_id.and_then(|value| sanitize_mod_metadata_value(&value));
    mod_name = mod_name.and_then(|value| sanitize_mod_metadata_value(&value));
    mod_version = mod_version.and_then(|value| sanitize_mod_metadata_value(&value));
    mod_author = mod_author.and_then(|value| sanitize_mod_metadata_value(&value));
    icon_field = icon_field.and_then(|value| sanitize_mod_metadata_value(&value));

    // Generate a safe filename for the icon cache
    let jar_name = jar_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .map(|name| strip_mod_file_suffix(&name))
        .unwrap_or_default();
    let icon_cache_path = icons_cache_dir.join(format!("{}.png", jar_name));

    // Check if icon is already cached
    if icon_cache_path.exists() {
        // Use forward slashes for cross-platform compatibility with Tauri asset protocol
        let path_str = icon_cache_path.to_string_lossy().to_string();
        #[cfg(windows)]
        let path_str = path_str.replace("\\", "/");
        icon_path = Some(path_str);
        println!("[INFO] Using cached icon: {}", icon_cache_path.display());
    } else {
        // Ensure icons cache directory exists
        if let Err(e) = std::fs::create_dir_all(icons_cache_dir) {
            println!("[ERROR] Failed to create icons cache directory: {}", e);
            return (None, mod_id, mod_name, mod_version, mod_author);
        }

        // Re-open archive for icon extraction
        if let Ok(file) = std::fs::File::open(jar_path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                println!(
                    "[INFO] Attempting to extract icon from JAR: {}",
                    jar_path.display()
                );

                // First try the icon field from mod metadata (most reliable)
                if let Some(ref icon_name) = icon_field {
                    println!("[INFO] Trying icon from metadata: {}", icon_name);
                    // Handle paths like "assets/modid/icon.png" or just "icon.png"
                    let icon_paths_to_try = vec![
                        icon_name.clone(),
                        icon_name.trim_start_matches('/').to_string(),
                    ];

                    for path in icon_paths_to_try {
                        match archive.by_name(&path) {
                            Ok(mut icon_file) => {
                                let mut icon_data = Vec::new();
                                match icon_file.read_to_end(&mut icon_data) {
                                    Ok(_) if !icon_data.is_empty() => {
                                        match std::fs::write(&icon_cache_path, &icon_data) {
                                            Ok(_) => {
                                                // Use forward slashes for cross-platform compatibility
                                                let path_str =
                                                    icon_cache_path.to_string_lossy().to_string();
                                                #[cfg(windows)]
                                                let path_str = path_str.replace("\\", "/");
                                                icon_path = Some(path_str);
                                                println!(
                                                    "[INFO] ✓ Extracted icon from JAR: {} -> {}",
                                                    path,
                                                    icon_cache_path.display()
                                                );
                                                break;
                                            }
                                            Err(e) => {
                                                println!("[ERROR] Failed to write icon file: {}", e)
                                            }
                                        }
                                    }
                                    Ok(_) => println!("[WARN] Icon file is empty: {}", path),
                                    Err(e) => println!("[ERROR] Failed to read icon data: {}", e),
                                }
                            }
                            Err(e) => println!("[DEBUG] Icon not found at path '{}': {}", path, e),
                        }
                    }
                }

                // If no icon from metadata, try common icon locations
                if icon_path.is_none() {
                    println!("[INFO] Trying common icon locations...");
                    let common_icons = [
                        "icon.png",
                        "pack.png",
                        "logo.png",
                        "assets/icon.png",
                        "META-INF/logo.png",
                    ];

                    for icon_name in common_icons {
                        match archive.by_name(icon_name) {
                            Ok(mut icon_file) => {
                                let mut icon_data = Vec::new();
                                match icon_file.read_to_end(&mut icon_data) {
                                    Ok(_) if !icon_data.is_empty() => {
                                        match std::fs::write(&icon_cache_path, &icon_data) {
                                            Ok(_) => {
                                                // Use forward slashes for cross-platform compatibility
                                                let path_str =
                                                    icon_cache_path.to_string_lossy().to_string();
                                                #[cfg(windows)]
                                                let path_str = path_str.replace("\\", "/");
                                                icon_path = Some(path_str);
                                                println!("[INFO] ✓ Extracted icon from JAR (fallback): {} -> {}", icon_name, icon_cache_path.display());
                                                break;
                                            }
                                            Err(e) => {
                                                println!("[ERROR] Failed to write icon file: {}", e)
                                            }
                                        }
                                    }
                                    Ok(_) => println!("[DEBUG] Icon file is empty: {}", icon_name),
                                    Err(e) => println!("[ERROR] Failed to read icon data: {}", e),
                                }
                            }
                            Err(_) => {} // Silent - these are just attempts
                        }
                    }

                    if icon_path.is_none() {
                        println!("[WARN] No icon found in JAR: {}", jar_path.display());
                    }
                }
            } else {
                println!(
                    "[ERROR] Failed to open JAR as ZIP archive: {}",
                    jar_path.display()
                );
            }
        } else {
            println!("[ERROR] Failed to open JAR file: {}", jar_path.display());
        }
    }

    (icon_path, mod_id, mod_name, mod_version, mod_author)
}

// Toggle mod enabled/disabled state
#[tauri::command]
async fn toggle_mod(mod_path: String, enabled: bool) -> Result<String, String> {
    println!(
        "[INFO] toggle_mod called: path={}, enabled={}",
        mod_path, enabled
    );

    let path = std::path::PathBuf::from(&mod_path);

    if !path.exists() {
        println!("[ERROR] Mod file not found: {}", mod_path);
        return Err(format!("Mod file not found: {}", mod_path));
    }

    let lower = mod_path.to_ascii_lowercase();

    let new_path = if enabled {
        // Enable: remove .disabled extension
        if ends_with_ignore_ascii_case(&mod_path, ".disabled") {
            let new = mod_path[..mod_path.len() - ".disabled".len()].to_string();
            println!("[INFO] Enabling mod: {} -> {}", mod_path, new);
            new
        } else {
            println!(
                "[INFO] Mod already enabled (no .disabled extension): {}",
                mod_path
            );
            return Ok(mod_path); // Already enabled
        }
    } else {
        // Disable: add .disabled extension
        if lower.ends_with(".jar") && !lower.ends_with(".jar.disabled") {
            let new = format!("{}.disabled", mod_path);
            println!("[INFO] Disabling mod: {} -> {}", mod_path, new);
            new
        } else {
            println!(
                "[INFO] Mod already disabled (has .disabled extension): {}",
                mod_path
            );
            return Ok(mod_path); // Already disabled
        }
    };

    println!("[INFO] Renaming file: {} -> {}", mod_path, new_path);

    match std::fs::rename(&path, &new_path) {
        Ok(_) => {
            println!(
                "[INFO] Successfully toggled mod: {} -> {}",
                mod_path, new_path
            );
            Ok(new_path)
        }
        Err(e) => {
            println!("[ERROR] Failed to rename mod file: {}", e);
            Err(format!("Failed to toggle mod: {}", e))
        }
    }
}

// Delete a mod
#[tauri::command]
async fn delete_mod(mod_path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&mod_path);

    if !path.exists() {
        return Err(format!("Mod file not found: {}", mod_path));
    }

    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete mod: {}", e))?;

    println!("[INFO] Deleted mod: {}", mod_path);

    Ok(())
}

// Submit crash report to backend server
#[tauri::command]
async fn submit_crash_report(
    state: State<'_, AppState>,
    username: String,
    uuid: Option<String>,
    version_id: String,
    user_description: Option<String>,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;

    // Generate unique report ID
    let report_id = format!(
        "crash-{}-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        uuid::Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("unknown")
    );

    // Collect crash log (latest crash report)
    let crash_dir = launcher.game_dir.join("crash-reports");
    let mut crash_log = String::new();

    println!(
        "[CrashReport] Looking for crash reports in: {}",
        crash_dir.display()
    );

    if crash_dir.exists() {
        let mut latest: Option<(std::path::PathBuf, u64)> = None;

        if let Ok(entries) = std::fs::read_dir(&crash_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "txt").unwrap_or(false) {
                    let modified = std::fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    if latest.is_none() || modified > latest.as_ref().unwrap().1 {
                        latest = Some((path, modified));
                    }
                }
            }
        }

        if let Some((path, _)) = latest {
            println!("[CrashReport] Found crash report: {}", path.display());
            crash_log = std::fs::read_to_string(&path).unwrap_or_default();
        }
    }

    // Ensure crashLog is not empty (API requires it)
    if crash_log.is_empty() {
        crash_log = format!(
            "No crash report file found.\nUser reported issue at: {}\nVersion: {}\nUser: {}",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            version_id,
            username
        );
        println!("[CrashReport] No crash report file found, using placeholder");
    }

    // Collect game log (latest.log)
    let log_path = launcher.game_dir.join("logs").join("latest.log");
    let game_log = if log_path.exists() {
        // Read last 50KB of log to avoid huge payloads
        let content = std::fs::read_to_string(&log_path).unwrap_or_default();
        if content.len() > 50000 {
            content[content.len() - 50000..].to_string()
        } else {
            content
        }
    } else {
        String::new()
    };

    // Get system info
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    // Try to get Java version
    let java_version = {
        let java_path = launcher.find_java_for_version(&version_id);
        if let Some(path) = java_path {
            let mut cmd = std::process::Command::new(&path);
            cmd.arg("-version");
            let output = run_command_output_hidden(&mut cmd);
            if let Ok(out) = output {
                String::from_utf8_lossy(&out.stderr)
                    .lines()
                    .next()
                    .map(|s| s.to_string())
            } else {
                None
            }
        } else {
            None
        }
    };

    // Build crash report payload
    let payload = serde_json::json!({
        "reportId": report_id,
        "username": username,
        "uuid": uuid,
        "versionId": version_id,
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "os": format!("{} {}", os, arch),
        "javaVersion": java_version,
        "memoryMax": 4096,
        "crashLog": crash_log,
        "gameLog": game_log,
        "systemInfo": {
            "os": os,
            "arch": arch,
            "gameDir": launcher.game_dir.to_string_lossy()
        },
        "userDescription": user_description.unwrap_or_default()
    });

    println!("[CrashReport] Preparing to submit report: {}", report_id);
    println!(
        "[CrashReport] Payload size: {} bytes",
        serde_json::to_string(&payload).unwrap_or_default().len()
    );

    // Submit to backend server
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Try multiple backend URLs
    let backend_urls = [
        "https://lapetus-api.vulcanubi.workers.dev/api/crash-reports/submit",
        "http://localhost:5000/api/crash-reports/submit",
    ];

    let mut last_error = String::new();

    for url in backend_urls {
        println!("[CrashReport] Trying to submit to: {}", url);

        match client
            .post(url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Lapetus-Launcher/1.0")
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                println!("[CrashReport] Response status from {}: {}", url, status);

                if status.is_success() {
                    let result = response
                        .json::<serde_json::Value>()
                        .await
                        .unwrap_or(serde_json::json!({"success": true, "reportId": report_id}));

                    println!(
                        "[CrashReport] Successfully submitted crash report: {}",
                        report_id
                    );

                    return Ok(serde_json::json!({
                        "success": true,
                        "reportId": report_id,
                        "message": "Crash report submitted successfully",
                        "serverResponse": result
                    }));
                } else {
                    // Try to get error body for more details
                    let error_body = response.text().await.unwrap_or_default();
                    last_error = format!("Server returned status {}: {}", status, error_body);
                    println!("[CrashReport] Server error: {}", last_error);
                }
            }
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                println!("[CrashReport] Request error to {}: {}", url, e);
            }
        }
    }

    // If all servers failed, save locally
    let local_reports_dir = launcher.game_dir.join("crash-reports-submitted");
    std::fs::create_dir_all(&local_reports_dir).ok();

    let local_path = local_reports_dir.join(format!("{}.json", report_id));
    std::fs::write(
        &local_path,
        serde_json::to_string_pretty(&payload).unwrap_or_default(),
    )
    .ok();

    println!(
        "[CrashReport] Failed to submit to server, saved locally: {}",
        local_path.display()
    );

    Ok(serde_json::json!({
        "success": false,
        "reportId": report_id,
        "message": format!("Could not submit to server ({}). Report saved locally.", last_error),
        "localPath": local_path.to_string_lossy()
    }))
}

// Collect crash data without submitting (for UI preview)
#[tauri::command]
async fn collect_crash_data(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;

    // Collect crash log
    let crash_dir = launcher.game_dir.join("crash-reports");
    let mut crash_log = String::new();
    let mut crash_filename = String::new();

    if crash_dir.exists() {
        let mut latest: Option<(std::path::PathBuf, u64)> = None;

        if let Ok(entries) = std::fs::read_dir(&crash_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "txt").unwrap_or(false) {
                    let modified = std::fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    if latest.is_none() || modified > latest.as_ref().unwrap().1 {
                        latest = Some((path, modified));
                    }
                }
            }
        }

        if let Some((path, _)) = latest {
            crash_log = std::fs::read_to_string(&path).unwrap_or_default();
            crash_filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
        }
    }

    // Collect game log
    let log_path = launcher.game_dir.join("logs").join("latest.log");
    let game_log = if log_path.exists() {
        let content = std::fs::read_to_string(&log_path).unwrap_or_default();
        // Get last 200 lines for preview
        let lines: Vec<&str> = content.lines().collect();
        let start = if lines.len() > 200 {
            lines.len() - 200
        } else {
            0
        };
        lines[start..].join("\n")
    } else {
        String::new()
    };

    // Extract error summary
    let mut error_lines = Vec::new();
    for line in game_log.lines() {
        if line.contains("Exception")
            || line.contains("Error:")
            || line.contains("FATAL")
            || line.contains("Failed to")
            || line.contains("Caused by:")
            || line.contains("at ")
        {
            error_lines.push(line.to_string());
            if error_lines.len() > 30 {
                break;
            }
        }
    }

    Ok(serde_json::json!({
        "hasCrash": !crash_log.is_empty(),
        "crashFilename": crash_filename,
        "crashLog": crash_log,
        "gameLog": game_log,
        "errorSummary": error_lines.join("\n"),
        "hasErrors": !error_lines.is_empty(),
        "versionId": version_id,
        "os": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "gameDir": launcher.game_dir.to_string_lossy()
    }))
}

// Authentication commands
// Crash report commands
#[tauri::command]
async fn get_crash_reports(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    let crash_dir = launcher.game_dir.join("crash-reports");

    let mut reports = Vec::new();

    if crash_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&crash_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "txt").unwrap_or(false) {
                    let filename = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // Get file metadata for timestamp
                    let modified = std::fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    reports.push(serde_json::json!({
                        "filename": filename,
                        "path": path.to_string_lossy(),
                        "modified": modified
                    }));
                }
            }
        }
    }

    // Sort by modified time (newest first)
    reports.sort_by(|a, b| {
        let a_time = a["modified"].as_u64().unwrap_or(0);
        let b_time = b["modified"].as_u64().unwrap_or(0);
        b_time.cmp(&a_time)
    });

    Ok(reports)
}

#[tauri::command]
async fn read_crash_report(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read crash report: {}", e))
}

#[tauri::command]
async fn get_latest_log(state: State<'_, AppState>) -> Result<Option<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    let log_path = launcher.game_dir.join("logs").join("latest.log");

    if !log_path.exists() {
        return Ok(None);
    }

    let content =
        std::fs::read_to_string(&log_path).map_err(|e| format!("Failed to read log: {}", e))?;

    // Extract error summary from log
    let mut error_summary = String::new();
    let mut in_error = false;
    let mut error_lines = Vec::new();

    for line in content.lines() {
        // Detect error patterns
        if line.contains("Exception")
            || line.contains("Error:")
            || line.contains("FATAL")
            || line.contains("Failed to")
            || line.contains("Could not")
            || line.contains("Caused by:")
        {
            in_error = true;
        }

        if in_error {
            error_lines.push(line.to_string());
            // Stop after collecting enough context
            if error_lines.len() > 50 {
                break;
            }
        }

        // Stop collecting after stack trace ends
        if in_error && line.trim().is_empty() && error_lines.len() > 5 {
            break;
        }
    }

    if !error_lines.is_empty() {
        error_summary = error_lines.join("\n");
    }

    let modified = std::fs::metadata(&log_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(Some(serde_json::json!({
        "path": log_path.to_string_lossy(),
        "modified": modified,
        "content": content,
        "error_summary": error_summary,
        "has_errors": !error_summary.is_empty()
    })))
}

#[tauri::command]
async fn get_latest_crash(state: State<'_, AppState>) -> Result<Option<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    let crash_dir = launcher.game_dir.join("crash-reports");

    if !crash_dir.exists() {
        return Ok(None);
    }

    let mut latest: Option<(std::path::PathBuf, u64)> = None;

    if let Ok(entries) = std::fs::read_dir(&crash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "txt").unwrap_or(false) {
                let modified = std::fs::metadata(&path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                if latest.is_none() || modified > latest.as_ref().unwrap().1 {
                    latest = Some((path, modified));
                }
            }
        }
    }

    if let Some((path, modified)) = latest {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read crash report: {}", e))?;
        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        Ok(Some(serde_json::json!({
            "filename": filename,
            "path": path.to_string_lossy(),
            "modified": modified,
            "content": content
        })))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn open_crash_folder(state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    let crash_dir = launcher.game_dir.join("crash-reports");

    // Create folder if it doesn't exist
    std::fs::create_dir_all(&crash_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&crash_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&crash_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&crash_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn open_crash_viewer(
    app: tauri::AppHandle,
    crash_path: Option<String>,
) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    // Build URL with crash path as query param
    let url = if let Some(path) = crash_path {
        format!("/crash-viewer?path={}", urlencoding::encode(&path))
    } else {
        "/crash-viewer".to_string()
    };

    // Check if window already exists
    if let Some(window) = app.get_webview_window("crash-viewer") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "crash-viewer", WebviewUrl::App(url.into()))
        .title("Crash Report")
        .inner_size(900.0, 700.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create crash viewer window: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn open_game_console(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    println!("[GameConsole] ========== OPENING GAME CONSOLE ==========");

    // Check if window already exists
    if let Some(window) = app.get_webview_window("game-console") {
        println!("[GameConsole] Window already exists, bringing to front...");
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        window
            .unminimize()
            .map_err(|e| format!("Failed to unminimize: {}", e))?;
        println!("[GameConsole] Existing window shown");
        return Ok(());
    }

    println!("[GameConsole] Creating new window...");

    // Create window dynamically
    let window = WebviewWindowBuilder::new(
        &app,
        "game-console",
        WebviewUrl::App("/game-console".into()),
    )
    .title("Game Console - Dragon Client")
    .inner_size(900.0, 600.0)
    .min_inner_size(600.0, 400.0)
    .position(100.0, 100.0) // Explicit position instead of center
    .resizable(true)
    .visible(false) // Start hidden
    .decorations(true)
    .always_on_top(true) // Start on top
    .focused(true)
    .skip_taskbar(false)
    .build()
    .map_err(|e| {
        let err_msg = format!("Failed to create game console window: {}", e);
        println!("[GameConsole] ERROR: {}", err_msg);
        err_msg
    })?;

    println!("[GameConsole] Window created successfully");

    // Small delay to ensure window is ready
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Show and focus window
    window.show().map_err(|e| {
        let err_msg = format!("Failed to show: {}", e);
        println!("[GameConsole] ERROR: {}", err_msg);
        err_msg
    })?;

    window.set_focus().map_err(|e| {
        let err_msg = format!("Failed to focus: {}", e);
        println!("[GameConsole] ERROR: {}", err_msg);
        err_msg
    })?;

    window.unminimize().map_err(|e| {
        let err_msg = format!("Failed to unminimize: {}", e);
        println!("[GameConsole] ERROR: {}", err_msg);
        err_msg
    })?;

    // Disable always on top after showing
    window.set_always_on_top(false).map_err(|e| {
        let err_msg = format!("Failed to disable always on top: {}", e);
        println!("[GameConsole] WARNING: {}", err_msg);
        err_msg
    })?;

    println!("[GameConsole] ========== WINDOW SHOULD NOW BE VISIBLE ==========");

    Ok(())
}

#[tauri::command]
async fn get_login_url() -> Result<String, String> {
    Ok(auth::get_ms_login_url())
}

#[tauri::command]
async fn open_login_window(_app: tauri::AppHandle) -> Result<(), String> {
    // Just return - we'll use system browser instead
    Ok(())
}

#[tauri::command]
async fn start_ms_login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<auth::AuthAccount, String> {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let login_url = auth::get_ms_login_url();

    // Create login window - no navigation interception to avoid WebKit crashes
    let login_window = WebviewWindowBuilder::new(
        &app,
        "ms-login",
        WebviewUrl::External(login_url.parse().unwrap()),
    )
    .title("Sign in with Microsoft")
    .inner_size(500.0, 700.0)
    .center()
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create login window: {}", e))?;

    // Poll for URL changes by checking window URL
    let auth_code: Arc<tokio::sync::Mutex<Option<String>>> =
        Arc::new(tokio::sync::Mutex::new(None));
    let auth_code_clone = auth_code.clone();
    let window_clone = login_window.clone();
    let done = Arc::new(AtomicBool::new(false));
    let done_clone = done.clone();

    // Spawn task to poll for redirect
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(200)).await;

            if done_clone.load(Ordering::Relaxed) {
                break;
            }

            // Check current URL
            if let Ok(url) = window_clone.url() {
                let url_str = url.as_str();

                if url_str.starts_with("https://login.live.com/oauth20_desktop.srf") {
                    if let Some(code_start) = url_str.find("code=") {
                        let code_part = &url_str[code_start + 5..];
                        let code_end = code_part.find('&').unwrap_or(code_part.len());
                        let code = &code_part[..code_end];

                        let decoded_code = urlencoding::decode(code)
                            .map(|s| s.to_string())
                            .unwrap_or_else(|_| code.to_string());

                        println!("[AUTH] Got auth code from redirect");
                        *auth_code_clone.lock().await = Some(decoded_code);
                        done_clone.store(true, Ordering::Relaxed);
                        window_clone.close().ok();
                        break;
                    }

                    if url_str.contains("error=") {
                        println!("[AUTH] Auth error in redirect");
                        done_clone.store(true, Ordering::Relaxed);
                        window_clone.close().ok();
                        break;
                    }
                }
            }

            // Also check if window was closed by user
            // Window visibility check - if window is destroyed, we should stop
        }
    });

    // Wait for auth code with timeout
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(300);

    loop {
        tokio::time::sleep(Duration::from_millis(200)).await;

        if start.elapsed() > timeout {
            done.store(true, Ordering::Relaxed);
            login_window.close().ok();
            return Err("Login timed out".to_string());
        }

        let code_opt = auth_code.lock().await.clone();
        if let Some(code) = code_opt {
            println!("[AUTH] Got auth code, exchanging for tokens...");

            // Exchange code for account
            let account = auth::authenticate_with_code(&code).await?;

            // Save to auth state
            let mut auth_state = state.auth_state.lock().await;
            auth_state.accounts.retain(|a| a.uuid != account.uuid);
            auth_state.accounts.push(account.clone());
            auth_state.active_account = Some(account.uuid.clone());
            auth::save_auth_state(&auth_state)?;

            return Ok(account);
        }

        if done.load(Ordering::Relaxed) {
            return Err("Login was cancelled or failed".to_string());
        }
    }
}

#[tauri::command]
async fn check_login_redirect(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Not used anymore
    Ok(None)
}

#[tauri::command]
async fn close_login_window(_app: tauri::AppHandle) -> Result<(), String> {
    // Not used anymore
    Ok(())
}

#[tauri::command]
async fn finish_startup_splash(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(splash_window) = app.get_webview_window("startup-splash") {
        let _ = splash_window.close();
    }

    if let Some(main_window) = app.get_webview_window("main") {
        apply_platform_main_window_frame(&main_window);
        #[cfg(target_os = "windows")]
        let _ = main_window.set_decorations(false);
        #[cfg(not(target_os = "windows"))]
        let _ = main_window.set_decorations(true);
        let _ = main_window.set_resizable(true);
        main_window
            .show()
            .map_err(|e| format!("Failed to show main window: {}", e))?;
        let _ = main_window.center();
        let _ = main_window.set_focus();
    }

    Ok(())
}

#[tauri::command]
async fn complete_ms_login(
    auth_code: String,
    state: State<'_, AppState>,
) -> Result<auth::AuthAccount, String> {
    let account = auth::authenticate_with_code(&auth_code).await?;

    let mut auth_state = state.auth_state.lock().await;
    auth_state.accounts.retain(|a| a.uuid != account.uuid);
    auth_state.accounts.push(account.clone());
    auth_state.active_account = Some(account.uuid.clone());
    auth::save_auth_state(&auth_state)?;

    Ok(account)
}

#[tauri::command]
async fn create_offline_account(
    username: String,
    skin_username: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthAccount, String> {
    if username.trim().is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    if username.len() < 3 || username.len() > 16 {
        return Err("Username must be 3-16 characters".to_string());
    }

    let account = auth::create_offline_account_with_skin(&username, skin_username.as_deref());

    // Save to auth state
    let mut auth_state = state.auth_state.lock().await;

    // Add account and set as active
    auth_state.accounts.push(account.clone());
    auth_state.active_account = Some(account.uuid.clone());

    // Save to disk
    auth::save_auth_state(&auth_state)?;

    Ok(account)
}

#[tauri::command]
async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<AuthAccount>, String> {
    let mut auth_state = state.auth_state.lock().await;

    // Refresh tokens for all accounts if needed
    let mut needs_save = false;
    for account in &mut auth_state.accounts {
        if let Ok(refreshed) = auth::refresh_token_if_needed(account).await {
            if refreshed {
                println!("[AUTH] Refreshed token for account: {}", account.username);
                needs_save = true;
            }
        }
    }

    // Save if any tokens were refreshed
    if needs_save {
        auth::save_auth_state(&auth_state).ok();
    }

    Ok(auth_state.accounts.clone())
}

#[tauri::command]
async fn get_active_account(state: State<'_, AppState>) -> Result<Option<AuthAccount>, String> {
    let mut auth_state = state.auth_state.lock().await;

    // Clone the active UUID to avoid borrow issues
    let active_uuid = match &auth_state.active_account {
        Some(uuid) => uuid.clone(),
        None => {
            println!("[AUTH] No active account set");
            return Ok(None);
        }
    };

    // Find and refresh the account
    let mut needs_save = false;
    let mut result_account = None;

    for account in &mut auth_state.accounts {
        if account.uuid == active_uuid {
            // For offline accounts, return immediately
            if account.is_offline {
                result_account = Some(account.clone());
                break;
            }

            // For Xbox accounts, try to refresh token if needed
            match auth::refresh_token_if_needed(account).await {
                Ok(refreshed) => {
                    if refreshed {
                        println!(
                            "[AUTH] Refreshed token for active account: {}",
                            account.username
                        );
                        needs_save = true;
                    }
                    result_account = Some(account.clone());
                }
                Err(e) => {
                    println!(
                        "[AUTH] Failed to refresh token for {}: {}",
                        account.username, e
                    );
                    // Still return the account even if refresh failed
                    // The frontend will handle re-authentication if needed
                    result_account = Some(account.clone());
                }
            }
            break;
        }
    }

    // Save if token was refreshed
    if needs_save {
        if let Err(e) = auth::save_auth_state(&auth_state) {
            println!("[AUTH] Failed to save auth state: {}", e);
        }
    }

    if result_account.is_none() {
        println!("[AUTH] Active account UUID not found in accounts list");
    }

    Ok(result_account)
}

#[tauri::command]
async fn set_active_account(uuid: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut auth_state = state.auth_state.lock().await;

    // Verify account exists
    if !auth_state.accounts.iter().any(|a| a.uuid == uuid) {
        return Err("Account not found".to_string());
    }

    auth_state.active_account = Some(uuid);
    auth::save_auth_state(&auth_state)?;

    Ok(())
}

#[tauri::command]
async fn remove_account(uuid: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut auth_state = state.auth_state.lock().await;

    // Remove account
    auth_state.accounts.retain(|a| a.uuid != uuid);

    // Clear active if it was the removed account
    if auth_state.active_account.as_ref() == Some(&uuid) {
        auth_state.active_account = auth_state.accounts.first().map(|a| a.uuid.clone());
    }

    auth::save_auth_state(&auth_state)?;

    Ok(())
}

#[tauri::command]
async fn refresh_account(uuid: String, state: State<'_, AppState>) -> Result<AuthAccount, String> {
    let mut auth_state = state.auth_state.lock().await;

    // Find account
    let account = auth_state
        .accounts
        .iter_mut()
        .find(|a| a.uuid == uuid)
        .ok_or("Account not found")?;

    // Refresh token
    auth::refresh_token_if_needed(account).await?;

    let updated_account = account.clone();

    // Save to disk
    auth::save_auth_state(&auth_state)?;

    Ok(updated_account)
}

#[tauri::command]
async fn update_account_skin(
    uuid: String,
    skin_username: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthAccount, String> {
    let mut auth_state = state.auth_state.lock().await;

    // Find account
    let account = auth_state
        .accounts
        .iter_mut()
        .find(|a| a.uuid == uuid)
        .ok_or("Account not found")?;

    // Update skin_username
    account.skin_username = skin_username.clone();

    let updated_account = account.clone();

    // Save to disk
    auth::save_auth_state(&auth_state)?;

    // Check if this is the active account
    let is_active = auth_state.active_account.as_ref() == Some(&uuid);

    // Release the lock before doing file operations
    drop(auth_state);

    if is_active {
        // Write skin config for the mod to pick up
        let launcher = state.launcher.lock().await;

        // Get the active version to determine the correct game directory
        let auth_state_read = state.auth_state.lock().await;
        let _active_version = auth_state_read
            .active_account
            .as_ref()
            .and_then(|uuid| auth_state_read.accounts.iter().find(|a| &a.uuid == uuid))
            .map(|acc| acc.username.clone());
        drop(auth_state_read);

        // For Lapetus versions, use the instances subdirectory
        // Try to find the latest lapetus instance
        let instances_dir = launcher.game_dir.join("instances");
        let mut lapetus_dirs: Vec<_> = std::fs::read_dir(&instances_dir)
            .ok()
            .and_then(|entries| {
                Some(
                    entries
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_name().to_string_lossy().starts_with("lapetus-"))
                        .collect(),
                )
            })
            .unwrap_or_default();

        // Sort by name (newest version last) and take the last one
        lapetus_dirs.sort_by_key(|e| e.file_name());

        let game_dir = if let Some(latest_lapetus) = lapetus_dirs.last() {
            instances_dir.join(latest_lapetus.file_name())
        } else {
            launcher.game_dir.clone()
        };

        let lapetus_config_dir = game_dir.join("config").join("lapetus");
        std::fs::create_dir_all(&lapetus_config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;

        let skin_config = serde_json::json!({
            "username": updated_account.username,
            "uuid": updated_account.uuid,
            "is_offline": updated_account.is_offline,
            "skin_username": skin_username,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });

        let skin_config_path = lapetus_config_dir.join("skin_config.json");
        if let Ok(config_str) = serde_json::to_string_pretty(&skin_config) {
            std::fs::write(&skin_config_path, config_str)
                .map_err(|e| format!("Failed to write skin config: {}", e))?;
            println!(
                "[Lapetus] Updated skin config to: {}",
                skin_config_path.display()
            );
        }
    }

    Ok(updated_account)
}

#[tauri::command]
async fn get_xbox_friends(state: State<'_, AppState>) -> Result<Vec<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token and clone it
    let refresh_token = account
        .refresh_token
        .as_ref()
        .ok_or("No refresh token available. Please log in again.")?
        .clone();

    let username = account.username.clone();

    println!("[XBOX_FRIENDS] Fetching Xbox friends for: {}", username);

    // Release the lock before making async calls
    drop(auth_state);

    // Get Xbox friends
    let friends = auth::get_xbox_friends(&refresh_token).await?;

    Ok(friends)
}

#[tauri::command]
async fn get_current_xbox_profile(
    state: State<'_, AppState>,
) -> Result<Option<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Ok(None),
    };

    let username = account.username.clone();

    println!("[XBOX_PROFILE] Fetching Xbox profile for: {}", username);

    // Release the lock before making async calls
    drop(auth_state);

    // Get current user's Xbox profile
    let profile = auth::get_current_xbox_profile(&refresh_token).await?;

    Ok(Some(profile))
}

#[tauri::command]
async fn search_xbox_users(
    state: State<'_, AppState>,
    search_query: String,
) -> Result<Vec<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!("[XBOX_SEARCH] Searching for: {}", search_query);

    // Release the lock before making async calls
    drop(auth_state);

    // Search Xbox users
    let results = auth::search_xbox_users(&refresh_token, &search_query).await?;

    Ok(results)
}

#[tauri::command]
async fn send_xbox_friend_request(
    state: State<'_, AppState>,
    target_xuid: String,
) -> Result<(), String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!("[XBOX_ADD_FRIEND] Adding friend with XUID: {}", target_xuid);

    // Release the lock before making async calls
    drop(auth_state);

    // Send Xbox friend request
    auth::send_xbox_friend_request(&refresh_token, &target_xuid).await?;

    Ok(())
}

#[tauri::command]
async fn get_xbox_friend_requests(
    state: State<'_, AppState>,
) -> Result<Vec<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!("[XBOX_REQUESTS] Getting pending friend requests");

    // Release the lock before making async calls
    drop(auth_state);

    // Get Xbox friend requests
    let requests = auth::get_xbox_friend_requests(&refresh_token).await?;

    Ok(requests)
}
#[tauri::command]
async fn sync_xbox_friend_requests_to_supabase(
    state: State<'_, AppState>,
    supabase_url: String,
    supabase_key: String,
) -> Result<Vec<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!("[XBOX_SYNC] Syncing friend requests to Supabase");

    // Get current user's XUID
    let current_xuid = match auth::get_current_xbox_profile(&refresh_token).await {
        Ok(profile) => profile.xuid,
        Err(e) => return Err(format!("Failed to get current XUID: {}", e)),
    };

    // Release the lock before making async calls
    drop(auth_state);

    // Sync Xbox friend requests to Supabase
    let newly_stored = auth::sync_xbox_friend_requests_to_supabase(
        &refresh_token,
        &current_xuid,
        &supabase_url,
        &supabase_key,
    )
    .await?;

    Ok(newly_stored)
}

#[tauri::command]
async fn accept_xbox_friend_request(
    state: State<'_, AppState>,
    target_xuid: String,
) -> Result<(), String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!(
        "[XBOX_ACCEPT] Accepting friend request from XUID: {}",
        target_xuid
    );

    // Release the lock before making async calls
    drop(auth_state);

    // Accept Xbox friend request
    auth::accept_xbox_friend_request(&refresh_token, &target_xuid).await?;

    Ok(())
}

#[tauri::command]
async fn decline_xbox_friend_request(
    state: State<'_, AppState>,
    target_xuid: String,
) -> Result<(), String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!(
        "[XBOX_DECLINE] Declining friend request from XUID: {}",
        target_xuid
    );

    // Release the lock before making async calls
    drop(auth_state);

    // Decline Xbox friend request
    auth::decline_xbox_friend_request(&refresh_token, &target_xuid).await?;

    Ok(())
}

#[tauri::command]
async fn get_xbox_profiles_by_xuids(
    state: State<'_, AppState>,
    xuids: Vec<String>,
) -> Result<Vec<auth::XboxFriend>, String> {
    let auth_state = state.auth_state.lock().await;

    // Get active account
    let active_uuid = auth_state
        .active_account
        .as_ref()
        .ok_or("No active account")?;

    let account = auth_state
        .accounts
        .iter()
        .find(|a| &a.uuid == active_uuid)
        .ok_or("Active account not found")?;

    // Check if account has refresh token (needed for Xbox API)
    let refresh_token = match &account.refresh_token {
        Some(token) => token.clone(),
        None => return Err("No Xbox account linked".to_string()),
    };

    println!(
        "[XBOX_PROFILES] Fetching profiles for {} XUIDs",
        xuids.len()
    );

    // Release the lock before making async calls
    drop(auth_state);

    // Get Xbox profiles
    let profiles = auth::get_xbox_profiles_by_xuids(&refresh_token, xuids).await?;

    Ok(profiles)
}

// Auto-update commands
#[derive(serde::Serialize)]
struct UpdateCheckResult {
    available: bool,
    current_version: String,
    latest_version: Option<String>,
    download_url: Option<String>,
}

#[tauri::command]
async fn check_app_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    println!("[Updater] Current version: {}", current_version);

    // Fetch latest.json from GitHub with cache busting
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Add timestamp to prevent caching
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let url = format!("https://github.com/XBOT98df/TrapGaint/releases/latest/download/latest.json?t={}", timestamp);
    println!("[Updater] Fetching: {}", url);

    let response = client
        .get(&url)
        .header("User-Agent", "Lapetus-Client")
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest.json: {}", e))?;

    println!("[Updater] Response status: {}", response.status());

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[Updater] Response body: {}", text);

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let latest_version = json["version"]
        .as_str()
        .ok_or("Missing version in latest.json")?
        .to_string();

    println!("[Updater] Latest version: {}", latest_version);

    // Compare versions
    let current_parts: Vec<u32> = current_version
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let latest_parts: Vec<u32> = latest_version
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();

    let mut update_available = false;
    for i in 0..std::cmp::max(current_parts.len(), latest_parts.len()) {
        let current = current_parts.get(i).unwrap_or(&0);
        let latest = latest_parts.get(i).unwrap_or(&0);
        if latest > current {
            update_available = true;
            break;
        } else if current > latest {
            break;
        }
    }

    println!("[Updater] Update available: {}", update_available);

    Ok(UpdateCheckResult {
        available: update_available,
        current_version,
        latest_version: Some(latest_version),
        download_url: if update_available {
            Some("https://github.com/XBOT98df/TrapGaint/releases/latest".to_string())
        } else {
            None
        },
    })
}

#[tauri::command]
async fn perform_app_update(app: tauri::AppHandle, _window: tauri::Window) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    println!("[Updater] Starting update...");

    // First check if update is available using our custom check
    let check_result = check_app_update(app.clone()).await?;

    if !check_result.available {
        return Err("No update available".to_string());
    }

    println!(
        "[Updater] Update available: {} -> {}",
        check_result.current_version,
        check_result
            .latest_version
            .as_ref()
            .unwrap_or(&"unknown".to_string())
    );

    // Use cache-busted endpoint at runtime so updater install step doesn't use stale CDN metadata
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let updater_url = format!(
        "https://github.com/XBOT98df/TrapGaint/releases/latest/download/latest.json?t={}",
        timestamp
    );
    let endpoint = reqwest::Url::parse(&updater_url)
        .map_err(|e| format!("Failed to parse updater URL: {}", e))?;

    // Use Tauri's updater to download and install
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| format!("Failed to set updater endpoint: {}", e))?
        .build()
        .map_err(|e| format!("Failed to create updater: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for update: {}", e))?;
    let update = update.ok_or_else(|| {
        "Tauri updater could not find update. Please download manually from GitHub.".to_string()
    })?;

    println!("[Updater] Downloading update: {}", update.version);

    // Download and install with progress and completion callbacks
    update
        .download_and_install(
            |chunk_len, content_len| {
                println!("[Updater] Progress: {} / {:?}", chunk_len, content_len);
            },
            || {
                println!("[Updater] Download complete, ready to install");
            },
        )
        .await
        .map_err(|e| format!("Failed to download/install: {}", e))?;

    println!("[Updater] Update installed successfully!");

    // ── Clean restart sequence ───────────────────────────────────────
    // The Tauri updater downloads the new installer and runs it. On
    // Windows, the NSIS installer overwrites the binary in-place, so we
    // must:
    //   1. Close all Tauri windows (releases file locks the installer
    //      needs to replace).
    //   2. Exit the current process so the installer can finish writing.
    //   3. The installer's NSIS `Quit` instruction will relaunch the new
    //      binary automatically (the NSIS template we ship calls
    //      `execShell "open" "TrapGaint.exe"` on success), so we must
    //      NOT call `app.restart()` here — that would race with the
    //      installer and leave a stale process running.
    //
    // If we *did* call `app.restart()` from the still-running old
    // process, Windows would launch the new binary while the old
    // process was still alive (the installer had only just begun
    // replacing files), and users would end up with two TrapGaint
    // entries in Task Manager — and on next start, two install
    // directories under %LOCALAPPDATA%\Programs\.
    //
    // The `installMode: "passive"` setting in tauri.conf.json makes the
    // NSIS installer run silently and relaunch the new app on its
    // own, so we just need to get out of the way.
    println!("[Updater] Closing windows and exiting so the installer can finish...");
    app.exit(0);
    // Belt-and-braces: if `app.exit` doesn't terminate the process
    // within a second (e.g. some platform event loop is still
    // pumping), force it.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(2));
        std::process::exit(0);
    });
    // Give the exit/spawn a moment to take effect.
    std::thread::sleep(std::time::Duration::from_millis(500));
    Ok(())
}

// Discord Rich Presence command
#[tauri::command]
async fn update_discord_status(
    status: String,
    version: Option<String>,
    server: Option<String>,
    loader: Option<String>,
) -> Result<(), String> {
    match status.as_str() {
        "launcher" => {
            discord::update_launcher_status()?;
        }
        "playing" => {
            let ver = version.unwrap_or_else(|| "Unknown".to_string());
            discord::update_playing_status(&ver, server.as_deref(), loader.as_deref())?;
        }
        "clear" => {
            if let Ok(mut rpc) = discord::DISCORD_RPC.lock() {
                rpc.clear_activity()?;
            } else {
                return Err("Failed to acquire Discord RPC lock".to_string());
            }
        }
        _ => {
            return Err(format!("Unknown Discord status: {}", status));
        }
    }
    Ok(())
}

// Dragon Auth commands (Token-based authentication for cracked accounts)
#[tauri::command]
async fn dragon_login(
    username: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;
    let session = launcher.get_dragon_session(&username)?;

    Ok(serde_json::json!({
        "username": session.username,
        "uuid": session.uuid,
        "access_token": session.access_token,
        "skin_url": session.skin_url,
        "cape_url": session.cape_url,
        "model": session.model,
    }))
}

#[tauri::command]
async fn get_dragon_accounts(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    let tokens = launcher.get_all_dragon_tokens()?;

    let accounts: Vec<serde_json::Value> = tokens
        .iter()
        .map(|token| {
            serde_json::json!({
                "username": token.username,
                "uuid": token.uuid,
                "token": token.token,
                "created_at": token.created_at,
                "expires_at": token.expires_at,
            })
        })
        .collect();

    Ok(accounts)
}

#[tauri::command]
async fn delete_dragon_account(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.delete_dragon_token(&username)
}

#[tauri::command]
async fn refresh_dragon_token(
    username: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let launcher = state.launcher.lock().await;
    let token = launcher.refresh_dragon_token(&username)?;

    Ok(serde_json::json!({
        "username": token.username,
        "uuid": token.uuid,
        "access_token": token.access_token,
        "token": token.token,
        "expires_at": token.expires_at,
    }))
}

// Dragon Skins commands (Custom skin system for Dragon Client)
#[tauri::command]
async fn save_custom_skin(
    player_name: String,
    skin_data: String,
    model: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;

    // Decode base64 skin data
    use base64::{engine::general_purpose, Engine as _};
    let skin_bytes = general_purpose::STANDARD
        .decode(&skin_data)
        .map_err(|e| format!("Failed to decode skin data: {}", e))?;

    // Save skin using Dragon Skins system
    let saved_path = launcher.save_dragon_skin(&player_name, &skin_bytes, &model)?;
    drop(launcher);

    // Keep active account skin selection synced with the Skin section.
    let mut auth_state = state.auth_state.lock().await;
    let active_uuid = auth_state.active_account.clone();
    let mut changed = false;

    // Prefer active account to avoid username-only mismatches.
    if let Some(active_uuid) = active_uuid {
        if let Some(account) = auth_state
            .accounts
            .iter_mut()
            .find(|a| a.uuid == active_uuid)
        {
            account.skin_username = Some(player_name.clone());
            changed = true;
        }
    }

    if !changed {
        for account in auth_state.accounts.iter_mut() {
            if account.username.eq_ignore_ascii_case(&player_name) {
                account.skin_username = Some(player_name.clone());
                changed = true;
            }
        }
    }

    if changed {
        auth::save_auth_state(&auth_state)?;
    }

    Ok(saved_path)
}

#[tauri::command]
async fn save_custom_cape(
    player_name: String,
    cape_data: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;

    // Decode base64 cape data
    use base64::{engine::general_purpose, Engine as _};
    let cape_bytes = general_purpose::STANDARD
        .decode(&cape_data)
        .map_err(|e| format!("Failed to decode cape data: {}", e))?;

    // Save cape using Dragon Skins system
    launcher.save_dragon_cape(&player_name, &cape_bytes)
}

#[tauri::command]
async fn set_selected_cape(
    cape_index: Option<i32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.set_selected_cape_index(cape_index)
}

#[tauri::command]
async fn get_selected_cape(state: State<'_, AppState>) -> Result<Option<i32>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_selected_cape_index()
}

#[tauri::command]
async fn get_all_skins(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    let skins = launcher.get_dragon_skins()?;

    // Convert to JSON
    let skins_json: Vec<serde_json::Value> = skins
        .iter()
        .map(|skin| {
            serde_json::json!({
                "player_name": skin.player_name,
                "skin_path": skin.skin_path,
                "cape_path": skin.cape_path,
                "model": skin.model,
                "uploaded_at": skin.uploaded_at,
            })
        })
        .collect();

    Ok(skins_json)
}

#[tauri::command]
async fn delete_custom_skin(player_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.delete_dragon_skin(&player_name)?;
    drop(launcher);

    let mut auth_state = state.auth_state.lock().await;
    let active_uuid = auth_state.active_account.clone();
    let mut changed = false;

    if let Some(active_uuid) = active_uuid {
        if let Some(account) = auth_state
            .accounts
            .iter_mut()
            .find(|a| a.uuid == active_uuid)
        {
            let skin_matches = account
                .skin_username
                .as_deref()
                .map(|value| value.eq_ignore_ascii_case(&player_name))
                .unwrap_or(false);
            if account.username.eq_ignore_ascii_case(&player_name) || skin_matches {
                account.skin_username = None;
                changed = true;
            }
        }
    }

    if !changed {
        for account in auth_state.accounts.iter_mut() {
            if account.username.eq_ignore_ascii_case(&player_name) {
                account.skin_username = None;
                changed = true;
            }
        }
    }

    if changed {
        auth::save_auth_state(&auth_state)?;
    }

    Ok(())
}
#[tauri::command]
async fn start_skin_server(state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.start_skin_server().await
}

#[tauri::command]
async fn download_dragon_skins_mod(
    instance_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.install_mod_to_instance_async(&instance_name).await
}

#[tauri::command]
async fn apply_custom_skin(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.apply_skin_to_minecraft(&username)
}

fn main() {
    // Initialize Discord Rich Presence
    discord::init_discord();

    let launcher = MinecraftLauncher::new().expect("Failed to initialize launcher");
    let game_dir = launcher.game_dir.clone();
    let auth_state = auth::load_auth_state();

    // Initialize server manager and load existing servers
    let server_manager = ServerManager::new(game_dir.clone());

    tauri::Builder::default()
        // Remove macOS default menu in all builds (dev + release).
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            launcher: Arc::new(Mutex::new(launcher)),
            auth_state: Arc::new(Mutex::new(auth_state)),
            server_manager: Arc::new(Mutex::new(server_manager)),
        })
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                apply_platform_main_window_frame(&main_window);
                #[cfg(target_os = "windows")]
                let _ = main_window.set_decorations(false);
                let _ = main_window.hide();
            }

            #[cfg(target_os = "macos")]
            let _ = app.remove_menu();

            let startup_window = tauri::WebviewWindowBuilder::new(
                app,
                "startup-splash",
                tauri::WebviewUrl::App("startup-splash.html".into()),
            )
            .title("Starting Dragon Client")
            .inner_size(760.0, 420.0)
            .resizable(false)
            .decorations(false)
            .center()
            .always_on_top(true)
            .skip_taskbar(true)
            .build();

            if let Err(e) = startup_window {
                eprintln!(
                    "[StartupSplash] Failed to create startup splash window: {}",
                    e
                );
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }

            // Safety fallback: never let startup splash block launcher forever.
            let splash_fallback_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(25)).await;

                if let Some(splash_window) =
                    splash_fallback_handle.get_webview_window("startup-splash")
                {
                    let _ = splash_window.close();
                    println!("[StartupSplash] Fallback timeout reached, closing splash");
                }

                if let Some(main_window) = splash_fallback_handle.get_webview_window("main") {
                    apply_platform_main_window_frame(&main_window);
                    let _ = main_window.show();
                    let _ = main_window.center();
                    let _ = main_window.set_focus();
                }
            });

            // Load existing servers on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let manager = state.server_manager.lock().await;
                    if let Err(e) = manager.load_servers().await {
                        eprintln!("[Server] Failed to load servers: {}", e);
                    } else {
                        println!("[Server] Loaded existing servers");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_versions,
            get_installed_versions,
            get_minecraft_dir,
            install_version,
            launch_game,
            is_game_running,
            stop_game,
            open_folder,
            open_file,
            read_server_file,
            write_server_file,
            get_version_info,
            repair_version,
            quick_verify,
            detect_installation_issues,
            repair_installation,
            check_java,
            install_dependency,
            get_forge_versions,
            get_installed_forge_versions,
            get_forge_versions_for_mc,
            install_forge,
            get_fabric_versions,
            get_installed_fabric_versions,
            get_installed_modpack_versions,
            is_version_installed,
            get_installed_game_versions,
            get_fabric_versions_for_mc,
            install_fabric,
            get_quilt_versions,
            get_installed_quilt_versions,
            get_quilt_versions_for_mc,
            install_quilt,
            install_fabric_with_dragonskins,
            install_quilt_with_dragonskins,
            verify_dragonskins_mod,
            get_dragon_versions,
            get_installed_dragon_versions,
            install_dragon,
            uninstall_dragon,
            install_dragon_mod,
            update_dragon_mod,
            verify_dragon_mod,
            is_dragon_mod_installed,
            copy_local_mod,
            // Dragon Client updater commands
            minecraft::dragon_updater::check_dragon_client_update,
            minecraft::dragon_updater::update_dragon_client_command,
            // Bedrock Edition commands
            get_bedrock_versions,
            get_installed_bedrock_versions,
            install_bedrock,
            launch_bedrock,
            search_mods,
            get_mod_details,
            get_mod_versions,
            get_featured_mods,
            get_mod_icon_from_modrinth,
            get_mod_icons_batch,
            download_mod,
            get_all_mods,
            toggle_mod,
            delete_mod,
            // Crash report commands
            get_crash_reports,
            read_crash_report,
            get_latest_crash,
            get_latest_log,
            open_crash_folder,
            open_crash_viewer,
            open_game_console,
            submit_crash_report,
            collect_crash_data,
            // Auth commands
            get_login_url,
            open_login_window,
            start_ms_login,
            check_login_redirect,
            close_login_window,
            finish_startup_splash,
            complete_ms_login,
            create_offline_account,
            get_accounts,
            get_active_account,
            set_active_account,
            remove_account,
            refresh_account,
            update_account_skin,
            get_xbox_friends,
            get_current_xbox_profile,
            search_xbox_users,
            send_xbox_friend_request,
            get_xbox_friend_requests,
            sync_xbox_friend_requests_to_supabase,
            accept_xbox_friend_request,
            decline_xbox_friend_request,
            get_xbox_profiles_by_xuids,
            // Server hosting commands
            create_server,
            get_servers,
            get_server,
            delete_server,
            start_server,
            stop_server,
            get_server_logs,
            list_server_files,
            accept_server_eula,
            check_server_eula,
            get_server_stats,
            start_tunnel,
            stop_tunnel,
            // Auto-update commands
            check_app_update,
            perform_app_update,
            // Discord RPC commands
            update_discord_status,
            // Dragon Auth commands
            dragon_login,
            get_dragon_accounts,
            delete_dragon_account,
            refresh_dragon_token,
            // Dragon Skins commands
            save_custom_skin,
            save_custom_cape,
            set_selected_cape,
            get_selected_cape,
            get_all_skins,
            delete_custom_skin,
            start_skin_server,
            download_dragon_skins_mod,
            apply_custom_skin,
            // Session tracking commands
            start_game_session,
            end_game_session,
            send_session_heartbeat,
            // Modpack commands
            get_modpacks,
            get_modpacks_paginated,
            search_modpacks,
            clear_modpack_cache,
            get_modpack_versions,
            install_modpack,
            is_modpack_installed,
            uninstall_modpack,
            verify_modpack,
            check_modpack_needs_verification,
            get_modpack_mods,
            toggle_modpack_mod,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Only shutdown Discord RPC when the main window closes, not splash screens
                if window.label() == "main" {
                    discord::shutdown_discord();
                    println!("[Discord RPC] Shutdown on main window close");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Server hosting commands
#[tauri::command]
async fn create_server(
    name: String,
    version: String,
    loader: String,
    port: u16,
    ram_mb: u32,
    state: State<'_, AppState>,
) -> Result<MinecraftServer, String> {
    let manager = state.server_manager.lock().await;
    manager
        .create_server(name, version, loader, port, ram_mb)
        .await
}

#[tauri::command]
async fn get_servers(state: State<'_, AppState>) -> Result<Vec<MinecraftServer>, String> {
    let manager = state.server_manager.lock().await;
    Ok(manager.get_servers().await)
}

#[tauri::command]
async fn get_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Option<MinecraftServer>, String> {
    let manager = state.server_manager.lock().await;
    Ok(manager.get_server(&server_id).await)
}

#[tauri::command(rename_all = "camelCase")]
async fn delete_server(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.server_manager.lock().await;
    manager.delete_server(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn start_server(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.server_manager.lock().await;

    // Get the server to determine which Java version we need
    let server = manager
        .get_server(&server_id)
        .await
        .ok_or("Server not found")?;

    // Use the launcher's Java detection based on Minecraft version
    let launcher = state.launcher.lock().await;
    let java_path = match launcher.find_java_for_version(&server.version) {
        Some(path) => {
            drop(launcher);
            path
        }
        None => {
            drop(launcher);

            // Try to use "java" from PATH as fallback
            let _java_cmd = if cfg!(target_os = "windows") {
                "java.exe"
            } else {
                "java"
            };

            // Check if java is in PATH
            let check_result = if cfg!(target_os = "windows") {
                let mut cmd = std::process::Command::new("where");
                cmd.arg("java");
                run_command_output_hidden(&mut cmd)
            } else {
                let mut cmd = std::process::Command::new("which");
                cmd.arg("java");
                run_command_output_hidden(&mut cmd)
            };

            if let Ok(output) = check_result {
                if output.status.success() {
                    let path_str = String::from_utf8_lossy(&output.stdout);
                    let first_path = path_str.lines().next().unwrap_or("").trim();
                    if !first_path.is_empty() {
                        println!("[Server] Using Java from PATH: {}", first_path);
                        PathBuf::from(first_path)
                    } else {
                        // No Java found - auto-install it
                        println!("[Server] No Java found, auto-installing...");
                        manager.ensure_java_installed(&server.version).await?
                    }
                } else {
                    // No Java found - auto-install it
                    println!("[Server] No Java found, auto-installing...");
                    manager.ensure_java_installed(&server.version).await?
                }
            } else {
                // No Java found - auto-install it
                println!("[Server] No Java found, auto-installing...");
                manager.ensure_java_installed(&server.version).await?
            }
        }
    };

    manager
        .start_server(&server_id, java_path.to_str().unwrap())
        .await
}

#[tauri::command(rename_all = "camelCase")]
async fn stop_server(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.server_manager.lock().await;
    manager.stop_server(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_server_logs(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let manager = state.server_manager.lock().await;
    manager.get_server_logs(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn list_server_files(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<server::ServerFile>, String> {
    let manager = state.server_manager.lock().await;
    manager.list_server_files(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn accept_server_eula(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.server_manager.lock().await;
    manager.accept_eula(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn check_server_eula(server_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let manager = state.server_manager.lock().await;
    manager.check_eula(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_server_stats(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<crate::server::ServerStats, String> {
    let manager = state.server_manager.lock().await;
    manager.get_server_stats(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn start_tunnel(server_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let manager = state.server_manager.lock().await;
    manager.start_tunnel(&server_id).await
}

#[tauri::command(rename_all = "camelCase")]
async fn stop_tunnel(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.server_manager.lock().await;
    manager.stop_tunnel(&server_id).await
}

// ==================== SESSION TRACKING COMMANDS ====================

#[tauri::command]
async fn start_game_session(
    oder_id: String,
    username: String,
    minecraft_uuid: Option<String>,
    game_version: String,
    loader: String,
    session_id: String,
    server_ip: Option<String>,
    server_port: Option<u16>,
    world_name: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let mut body = serde_json::json!({
        "oderId": oder_id,
        "username": username,
        "gameVersion": game_version,
        "loader": loader,
        "sessionId": session_id,
    });

    if let Some(uuid) = minecraft_uuid {
        body["minecraftUuid"] = serde_json::json!(uuid);
    }

    if let Some(ip) = server_ip {
        body["serverIp"] = serde_json::json!(ip);
    }

    if let Some(port) = server_port {
        body["serverPort"] = serde_json::json!(port);
    }

    if let Some(world) = world_name {
        body["worldName"] = serde_json::json!(world);
    }

    // Try production API first, fallback to localhost for development
    let urls = [
        "https://lapetus-api.vulcanubi.workers.dev/api/presence/session",
        "http://localhost:5000/api/presence/session",
    ];

    let mut last_error = String::new();
    for url in &urls {
        match client.post(*url).json(&body).send().await {
            Ok(response) if response.status().is_success() => {
                println!("[Session] Started session for {}", username);
                return Ok(());
            }
            Ok(response) => {
                last_error = format!("Failed to start session: {}", response.status());
            }
            Err(e) => {
                last_error = format!("Network error: {}", e);
            }
        }
    }

    // Only log error if all URLs failed
    eprintln!("[Session] Error starting session: {}", last_error);
    Err(last_error)
}

#[tauri::command]
async fn end_game_session(oder_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();

    let urls = [
        "https://lapetus-api.vulcanubi.workers.dev/api/presence/end",
        "http://localhost:5000/api/presence/end",
    ];

    for url in &urls {
        match client
            .post(*url)
            .json(&serde_json::json!({ "oderId": oder_id }))
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                println!("[Session] Ended session for {}", oder_id);
                return Ok(());
            }
            _ => continue,
        }
    }

    // Silently fail - session ending is not critical
    Ok(())
}

#[tauri::command]
async fn send_session_heartbeat(oder_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();

    let urls = [
        "https://lapetus-api.vulcanubi.workers.dev/api/presence/heartbeat",
        "http://localhost:5000/api/presence/heartbeat",
    ];

    for url in &urls {
        if let Ok(response) = client
            .post(*url)
            .json(&serde_json::json!({ "oderId": oder_id }))
            .send()
            .await
        {
            if response.status().is_success() {
                return Ok(());
            }
        }
    }

    // Silently fail - heartbeats are not critical
    Ok(())
}

// Modpack commands
#[tauri::command]
async fn get_modpacks(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<minecraft::Modpack>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_modpacks().await
}

#[tauri::command]
async fn get_modpacks_paginated(
    page: usize,
    per_page: usize,
    query: Option<String>,
    game_version: Option<String>,
    loader: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(Vec<minecraft::Modpack>, usize), String> {
    let launcher = state.launcher.lock().await;
    launcher
        .get_modpacks_paginated(
            page,
            per_page,
            query.as_deref(),
            game_version.as_deref(),
            loader.as_deref(),
        )
        .await
}

#[tauri::command]
async fn clear_modpack_cache(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.clear_modpack_cache()
}

#[tauri::command]
async fn get_modpack_versions(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_modpack_versions(&project_id).await
}

#[tauri::command]
async fn install_modpack(
    version_id: String,
    modpack_name: String,
    game_version: String,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let launcher = state.launcher.lock().await;

    launcher
        .install_modpack(
            &version_id,
            &modpack_name,
            &game_version,
            |progress, status| {
                window
                    .emit(
                        "modpack-install-progress",
                        serde_json::json!({
                            "progress": progress,
                            "status": status
                        }),
                    )
                    .ok();
            },
        )
        .await
}

#[tauri::command]
async fn is_modpack_installed(
    modpack_id: String,
    mc_version: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    Ok(launcher.is_modpack_installed(&modpack_id, &mc_version))
}

#[tauri::command]
async fn uninstall_modpack(
    modpack_id: String,
    mc_version: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;
    launcher.uninstall_modpack(&modpack_id, &mc_version)
}

#[tauri::command]
async fn verify_modpack(
    version_id: String,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let launcher = state.launcher.lock().await;

    launcher
        .verify_and_repair_modpack(&version_id, |progress, status| {
            window
                .emit(
                    "modpack-verify-progress",
                    serde_json::json!({
                        "progress": progress,
                        "status": status
                    }),
                )
                .ok();
        })
        .await
}

#[tauri::command]
async fn check_modpack_needs_verification(
    version_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    Ok(launcher.needs_verification(&version_id))
}

#[tauri::command]
async fn get_modpack_mods(
    version_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let launcher = state.launcher.lock().await;
    launcher.get_modpack_mods(&version_id)
}

#[tauri::command]
async fn toggle_modpack_mod(
    version_id: String,
    filename: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let launcher = state.launcher.lock().await;
    launcher.toggle_mod(&version_id, &filename)
}

// ============================================================================
// Java Management Commands
