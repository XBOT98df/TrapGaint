pub mod auth;
pub mod bedrock;
pub mod downloader;
pub mod dragon;
pub mod dragon_mod_installer;
pub mod dragon_updater;
pub mod dragonauth;
pub mod dragonskins;
pub mod dragonskins_installer;
pub mod fabric;
pub mod forge;
pub mod java_manager;
mod manifest;
pub mod modpacks;
pub mod quilt;
pub mod state;

#[allow(unused_imports)]
pub use auth::*;
pub use bedrock::BedrockVersionInfo;
#[allow(unused_imports)]
pub use downloader::*;
pub use dragon::DragonVersionInfo;
pub use fabric::FabricVersionInfo;
pub use forge::ForgeVersionInfo;
#[allow(unused_imports)]
pub use java_manager::*;
pub use manifest::*;
#[allow(unused_imports)]
pub use modpacks::{Modpack, ModpackMod};
pub use quilt::QuiltVersionInfo;
#[allow(unused_imports)]
pub use state::*;

use base64::{engine::general_purpose, Engine as _};
#[cfg(target_os = "windows")]
use futures_util::StreamExt;
use rand::rngs::OsRng;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey};
use rsa::signature::{SignatureEncoding, Signer};
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JavaArchitecture {
    Arm64,
    X86_64,
    Unknown,
}

static TEXTURES_SIGNING_KEY_CACHE: OnceLock<Mutex<Option<(RsaPrivateKey, String)>>> =
    OnceLock::new();
static OFFLINE_CERT_CACHE: OnceLock<
    Mutex<HashMap<String, (serde_json::Value, serde_json::Value, i64)>>,
> = OnceLock::new();
static JAVA_COMPAT_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
const DEFAULT_GAME_WINDOW_WIDTH: u32 = 1700;
const DEFAULT_GAME_WINDOW_HEIGHT: u32 = 900;

fn run_output_hidden(cmd: &mut Command) -> std::io::Result<std::process::Output> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.output()
}

// Helper function to recursively copy a directory
#[allow(dead_code)]
fn copy_dir_all(
    src: impl AsRef<std::path::Path>,
    dst: impl AsRef<std::path::Path>,
) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub struct MinecraftLauncher {
    pub game_dir: PathBuf,
    pub versions_dir: PathBuf,
    pub libraries_dir: PathBuf,
    pub assets_dir: PathBuf,
    pub natives_dir: PathBuf,
    pub state: state::StateManager,
    pub java_manager: java_manager::JavaManager,
}

impl MinecraftLauncher {
    fn clone_for_install(&self) -> Self {
        Self {
            game_dir: self.game_dir.clone(),
            versions_dir: self.versions_dir.clone(),
            libraries_dir: self.libraries_dir.clone(),
            assets_dir: self.assets_dir.clone(),
            natives_dir: self.natives_dir.clone(),
            state: state::StateManager::new(&self.game_dir),
            java_manager: java_manager::JavaManager::new(&self.game_dir),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchOptions {
    pub version_id: String,
    pub username: String,
    pub uuid: Option<String>,
    pub access_token: Option<String>,
    pub memory_max: u32,
    pub memory_min: u32,
    pub java_path: Option<String>,
    pub oder_id: Option<String>,
    pub tier: Option<String>,
    pub prefer_local_dragon_mod: bool,
    pub is_offline: bool,
    pub skin_username: Option<String>,
}

impl MinecraftLauncher {
    pub fn new() -> Result<Self, String> {
        let game_dir = Self::get_minecraft_dir()?;

        // Migrate existing Lapetus installations from .minecraft to .trapgaint
        Self::migrate_from_minecraft(&game_dir)?;

        let versions_dir = game_dir.join("versions");
        let libraries_dir = game_dir.join("libraries");
        let assets_dir = game_dir.join("assets");
        let natives_dir = game_dir.join("natives");

        std::fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&libraries_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

        let state = state::StateManager::new(&game_dir);
        let java_manager = java_manager::JavaManager::new(&game_dir);

        Ok(Self {
            game_dir,
            versions_dir,
            libraries_dir,
            assets_dir,
            natives_dir,
            state,
            java_manager,
        })
    }

    /// Validate that a JAR file is not corrupted by checking if it can be opened as a ZIP
    fn is_valid_jar_static(path: &PathBuf) -> bool {
        if !path.exists() {
            return false;
        }
        // Check minimum file size (valid JARs are at least a few KB)
        if let Ok(metadata) = std::fs::metadata(path) {
            if metadata.len() < 100 {
                return false;
            }
        }
        // Try to open as ZIP to validate structure
        match std::fs::File::open(path) {
            Ok(file) => match zip::ZipArchive::new(file) {
                Ok(_) => true,
                Err(e) => {
                    println!("[WARN] Corrupted JAR detected: {:?} - {}", path, e);
                    false
                }
            },
            Err(_) => false,
        }
    }

    fn is_platform_native_file(name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        #[cfg(target_os = "windows")]
        {
            lower.ends_with(".dll")
        }
        #[cfg(target_os = "macos")]
        {
            lower.ends_with(".dylib") || lower.ends_with(".jnilib")
        }
        #[cfg(target_os = "linux")]
        {
            lower.ends_with(".so") || lower.contains(".so.")
        }
    }

    fn is_openal_native_file(name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        // Handle both OpenAL and LWJGL OpenAL native naming across platforms.
        let looks_like_openal = lower.contains("openal") || lower.contains("lwjgl_openal");
        looks_like_openal && Self::is_platform_native_file(&lower)
    }

    fn has_any_natives(dir: &std::path::Path) -> bool {
        std::fs::read_dir(dir)
            .map(|entries| {
                entries.filter_map(|e| e.ok()).any(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !Self::is_platform_native_file(&name) {
                        return false;
                    }
                    entry
                        .metadata()
                        .map(|meta| meta.is_file() && meta.len() > 0)
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    }

    fn has_openal_natives(dir: &std::path::Path) -> bool {
        std::fs::read_dir(dir)
            .map(|entries| {
                entries.filter_map(|e| e.ok()).any(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !Self::is_openal_native_file(&name) {
                        return false;
                    }
                    // Guard against truncated/corrupted DLL extraction.
                    entry
                        .metadata()
                        .map(|meta| meta.is_file() && meta.len() > 1024)
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    }

    #[cfg(target_os = "windows")]
    fn collect_windows_native_archives(
        root: &std::path::Path,
        max_depth: usize,
        out: &mut Vec<PathBuf>,
    ) {
        if !root.exists() {
            return;
        }
        let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
        while let Some((dir, depth)) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if depth < max_depth {
                        stack.push((path, depth + 1));
                    }
                    continue;
                }
                if !path.is_file() {
                    continue;
                }
                let name_lower = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !name_lower.ends_with(".jar") {
                    continue;
                }
                if name_lower.contains("natives")
                    || name_lower.contains("openal")
                    || name_lower.contains("lwjgl-platform")
                {
                    out.push(path);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn extract_windows_audio_natives_from_archive(
        archive_path: &std::path::Path,
        version_natives_dir: &std::path::Path,
        _preferred_arch: JavaArchitecture,
    ) -> usize {
        let Ok(file) = std::fs::File::open(archive_path) else {
            return 0;
        };
        let Ok(mut archive) = zip::ZipArchive::new(file) else {
            return 0;
        };

        let mut extracted = 0usize;
        for i in 0..archive.len() {
            let Ok(mut jar_entry) = archive.by_index(i) else {
                continue;
            };
            if jar_entry.is_dir() {
                continue;
            }
            let entry_name = jar_entry.name().to_string();
            let entry_lower = entry_name.to_ascii_lowercase();
            let should_extract =
                Self::is_openal_native_file(&entry_name) || entry_lower.ends_with("soft_oal.dll");
            if !should_extract {
                continue;
            }
            let Some(file_name_os) = std::path::Path::new(&entry_name).file_name() else {
                continue;
            };
            let file_name = file_name_os.to_string_lossy().to_string();
            if file_name.is_empty() {
                continue;
            }

            let out_path = version_natives_dir.join(&file_name);
            let should_write = std::fs::metadata(&out_path)
                .map(|meta| meta.len() <= 1024)
                .unwrap_or(true);
            if !should_write {
                continue;
            }

            if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                if std::io::copy(&mut jar_entry, &mut out_file).is_ok() {
                    extracted += 1;
                }
            }
        }

        extracted
    }

    #[cfg(target_os = "windows")]
    fn recover_windows_openal_from_known_archives(
        &self,
        version_natives_dir: &std::path::Path,
        preferred_arch: JavaArchitecture,
    ) -> usize {
        let mut archives = Vec::<PathBuf>::new();
        Self::collect_windows_native_archives(&self.natives_dir, 3, &mut archives);
        Self::collect_windows_native_archives(&self.libraries_dir, 8, &mut archives);
        let mut seen = std::collections::HashSet::<PathBuf>::new();
        archives.retain(|path| seen.insert(path.clone()));
        archives.sort_by_key(|path| {
            let name = path
                .file_name()
                .map(|v| v.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            let arch_score = match preferred_arch {
                JavaArchitecture::Arm64 => {
                    if name.contains("natives-windows-arm64") {
                        0
                    } else if name.contains("natives-windows-64")
                        || name.contains("natives-windows-x86_64")
                    {
                        1
                    } else if name.contains("natives-windows") {
                        2
                    } else {
                        3
                    }
                }
                JavaArchitecture::X86_64 => {
                    if name.contains("natives-windows-64")
                        || name.contains("natives-windows-x86_64")
                    {
                        0
                    } else if name.contains("natives-windows") {
                        1
                    } else if name.contains("natives-windows-arm64") {
                        2
                    } else {
                        3
                    }
                }
                JavaArchitecture::Unknown => {
                    if name.contains("natives-windows") && !name.contains("arm64") {
                        0
                    } else if name.contains("natives-windows-64")
                        || name.contains("natives-windows-x86_64")
                    {
                        1
                    } else if name.contains("natives-windows-arm64") {
                        2
                    } else {
                        3
                    }
                }
            };
            let source_score = if name.contains("lwjgl-openal") || name.contains("openal") {
                0
            } else if name.contains("lwjgl-platform") {
                1
            } else {
                2
            };
            (arch_score, source_score)
        });

        let mut recovered = 0usize;
        for archive_path in archives {
            recovered += Self::extract_windows_audio_natives_from_archive(
                &archive_path,
                version_natives_dir,
                preferred_arch,
            );
        }
        recovered
    }

    #[cfg(target_os = "windows")]
    fn describe_windows_openal_files(dir: &std::path::Path) -> String {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return "none".to_string();
        };
        let mut files = Vec::<String>::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_ascii_lowercase();
            if !(Self::is_openal_native_file(&name) || lower.ends_with("soft_oal.dll")) {
                continue;
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            files.push(format!("{} ({} bytes)", name, size));
        }
        if files.is_empty() {
            "none".to_string()
        } else {
            files.join(", ")
        }
    }

    #[cfg(target_os = "windows")]
    fn choose_windows_lwjgl2_openal_libname(
        version_natives_dir: &std::path::Path,
        java_arch: JavaArchitecture,
    ) -> Option<&'static str> {
        let has_dll = |name: &str| {
            let path = version_natives_dir.join(name);
            std::fs::metadata(path)
                .map(|meta| meta.is_file() && meta.len() > 1024)
                .unwrap_or(false)
        };
        let has_openal64 = has_dll("OpenAL64.dll");
        let has_openal32 = has_dll("OpenAL32.dll");

        match java_arch {
            JavaArchitecture::Arm64 | JavaArchitecture::X86_64 => {
                if has_openal64 {
                    Some("OpenAL64")
                } else if has_openal32 {
                    Some("OpenAL32")
                } else {
                    None
                }
            }
            JavaArchitecture::Unknown => {
                if has_openal64 {
                    Some("OpenAL64")
                } else if has_openal32 {
                    Some("OpenAL32")
                } else {
                    None
                }
            }
        }
    }

    fn matches_java_version_output(version_text: &str, required_version: u8) -> bool {
        match required_version {
            8 => version_text.contains("1.8") || version_text.contains("\"8"),
            17 => version_text.contains("\"17"),
            21 => version_text.contains("\"21"),
            22 => version_text.contains("\"22"),
            _ => version_text.contains(&format!("\"{}", required_version)),
        }
    }

    fn is_java_executable_compatible(
        path: &std::path::Path,
        required_version: u8,
        preferred_arch: Option<JavaArchitecture>,
    ) -> bool {
        if !path.exists() {
            return false;
        }

        let arch_key = match preferred_arch {
            Some(JavaArchitecture::Arm64) => "arm64",
            Some(JavaArchitecture::X86_64) => "x86_64",
            Some(JavaArchitecture::Unknown) => "unknown",
            None => "any",
        };
        let cache_key = format!(
            "{}|{}|{}",
            path.to_string_lossy(),
            required_version,
            arch_key
        );
        let cache = JAVA_COMPAT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(cache_guard) = cache.lock() {
            if let Some(cached) = cache_guard.get(&cache_key) {
                return *cached;
            }
        }

        let mut cmd = Command::new(path);
        cmd.arg("-version");
        let output = run_output_hidden(&mut cmd);
        let Ok(output) = output else {
            if let Ok(mut cache_guard) = cache.lock() {
                cache_guard.insert(cache_key, false);
            }
            return false;
        };
        if !output.status.success() {
            if let Ok(mut cache_guard) = cache.lock() {
                cache_guard.insert(cache_key, false);
            }
            return false;
        }

        let mut version_text = String::from_utf8_lossy(&output.stderr).to_string();
        version_text.push('\n');
        version_text.push_str(&String::from_utf8_lossy(&output.stdout));
        if !Self::matches_java_version_output(&version_text, required_version) {
            if let Ok(mut cache_guard) = cache.lock() {
                cache_guard.insert(cache_key, false);
            }
            return false;
        }

        #[cfg(target_os = "macos")]
        if let Some(expected_arch) = preferred_arch {
            let actual_arch = Self::detect_java_architecture(&path.to_string_lossy());
            if actual_arch != expected_arch {
                if let Ok(mut cache_guard) = cache.lock() {
                    cache_guard.insert(cache_key, false);
                }
                return false;
            }
        }

        if let Ok(mut cache_guard) = cache.lock() {
            cache_guard.insert(cache_key, true);
        }
        true
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    fn preferred_java_arch_for_version(version_id: &str) -> Option<JavaArchitecture> {
        if Self::get_required_java_version(version_id) == 8 {
            Some(JavaArchitecture::X86_64)
        } else {
            None
        }
    }

    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    fn preferred_java_arch_for_version(_version_id: &str) -> Option<JavaArchitecture> {
        None
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    fn version_requires_x86_java_runtime(&self, version_id: &str) -> bool {
        let mods_dir = self.game_dir.join("instances").join(version_id).join("mods");
        let Ok(entries) = std::fs::read_dir(mods_dir) else {
            return false;
        };

        entries.filter_map(Result::ok).any(|entry| {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            name.ends_with(".jar")
                && (name.contains("physics-mod") || name.contains("physicsmod"))
        })
    }

    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    fn version_requires_x86_java_runtime(&self, _version_id: &str) -> bool {
        false
    }

    fn preferred_java_arch_for_launch_version(&self, version_id: &str) -> Option<JavaArchitecture> {
        if self.version_requires_x86_java_runtime(version_id) {
            Some(JavaArchitecture::X86_64)
        } else {
            Self::preferred_java_arch_for_version(version_id)
        }
    }

    fn needs_legacy_authlib_override(classpath: &[String]) -> bool {
        classpath.iter().any(|entry| {
            let normalized = entry.replace('\\', "/");
            normalized.contains("/com/mojang/authlib/1.")
        })
    }

    fn find_legacy_authlib_override_path(&self) -> Option<PathBuf> {
        let bundled_paths = [
            // macOS: resources inside app bundle
            #[cfg(target_os = "macos")]
            std::env::current_exe().ok().and_then(|path| {
                path.parent()
                    .map(|parent| parent.join("../Resources/legacy-authlib-override.jar"))
            }),
            // Windows: resources alongside exe
            #[cfg(target_os = "windows")]
            std::env::current_exe().ok().and_then(|path| {
                path.parent()
                    .map(|parent| parent.join("resources/legacy-authlib-override.jar"))
            }),
            #[cfg(target_os = "windows")]
            std::env::current_exe().ok().and_then(|path| {
                path.parent()
                    .map(|parent| parent.join("legacy-authlib-override.jar"))
            }),
            Some(PathBuf::from("resources/legacy-authlib-override.jar")),
            Some(PathBuf::from(
                "src-tauri/resources/legacy-authlib-override.jar",
            )),
        ];

        bundled_paths.iter().flatten().find_map(|path| {
            if !path.exists() {
                return None;
            }
            std::fs::canonicalize(path)
                .ok()
                .or_else(|| Some(path.to_path_buf()))
        })
    }

    #[cfg(target_os = "macos")]
    fn detect_java_architecture(java_path: &str) -> JavaArchitecture {
        let runtime_output = Command::new(java_path)
            .args(["-XshowSettings:properties", "-version"])
            .output()
            .ok();

        let mut runtime_text = String::new();
        if let Some(output) = runtime_output {
            runtime_text.push_str(&String::from_utf8_lossy(&output.stdout));
            runtime_text.push('\n');
            runtime_text.push_str(&String::from_utf8_lossy(&output.stderr));
        }
        let runtime_text = runtime_text.to_ascii_lowercase();
        if runtime_text.contains("os.arch = aarch64") || runtime_text.contains("os.arch = arm64") {
            return JavaArchitecture::Arm64;
        }
        if runtime_text.contains("os.arch = x86_64") || runtime_text.contains("os.arch = amd64") {
            return JavaArchitecture::X86_64;
        }

        let file_output = Command::new("file").arg(java_path).output().ok();
        if let Some(output) = file_output {
            let text = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            if text.contains("arm64") {
                return JavaArchitecture::Arm64;
            }
            if text.contains("x86_64") {
                return JavaArchitecture::X86_64;
            }
        }

        JavaArchitecture::Unknown
    }

    #[cfg(not(target_os = "macos"))]
    fn detect_java_architecture(_java_path: &str) -> JavaArchitecture {
        JavaArchitecture::Unknown
    }

    fn should_prefer_arm64_macos_natives(java_arch: JavaArchitecture) -> bool {
        matches!(java_arch, JavaArchitecture::Arm64)
    }

    fn clear_arm64_patch_markers(dir: &std::path::Path) {
        let marker_names = [
            ".lwjgl_patched",
            ".lwjgl333_patched",
            ".lwjgl331_patched",
            ".lwjgl_prism_patched",
        ];
        for marker in marker_names {
            let _ = std::fs::remove_file(dir.join(marker));
        }
    }

    fn clear_platform_native_files(dir: &std::path::Path) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if path.is_file() && Self::is_platform_native_file(&name) {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }

    fn native_archive_cache_path(
        &self,
        native: &serde_json::Value,
        fallback_name: String,
    ) -> PathBuf {
        let jar_name = native["path"]
            .as_str()
            .and_then(|path| {
                std::path::Path::new(path)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
            })
            .unwrap_or(fallback_name);
        self.natives_dir.join(jar_name)
    }

    #[cfg(target_os = "macos")]
    fn macos_binary_matches_arch(path: &std::path::Path, java_arch: JavaArchitecture) -> bool {
        if matches!(java_arch, JavaArchitecture::Unknown) {
            return true;
        }
        if !path.exists() {
            return false;
        }

        let output = Command::new("file").arg(path).output().ok();
        let Some(output) = output else {
            return true;
        };
        let text = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();

        match java_arch {
            JavaArchitecture::Arm64 => text.contains("arm64"),
            JavaArchitecture::X86_64 => text.contains("x86_64"),
            JavaArchitecture::Unknown => true,
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn macos_binary_matches_arch(_path: &std::path::Path, _java_arch: JavaArchitecture) -> bool {
        true
    }

    #[cfg(target_os = "macos")]
    fn macos_natives_dir_matches_arch(dir: &std::path::Path, java_arch: JavaArchitecture) -> bool {
        if matches!(java_arch, JavaArchitecture::Unknown) {
            return true;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return false;
        };

        let mut found_any = false;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if !path.is_file() || !Self::is_platform_native_file(&name) {
                continue;
            }
            found_any = true;
            if !Self::macos_binary_matches_arch(&path, java_arch) {
                return false;
            }
        }

        found_any
    }

    #[cfg(not(target_os = "macos"))]
    fn macos_natives_dir_matches_arch(
        _dir: &std::path::Path,
        _java_arch: JavaArchitecture,
    ) -> bool {
        true
    }

    fn should_use_native_artifact(
        lib_name: &str,
        current_os: &str,
        prefer_arm64_macos: bool,
    ) -> bool {
        if current_os != "osx" {
            return true;
        }

        let is_lwjgl = lib_name.contains("org.lwjgl");
        let has_arm64_suffix =
            lib_name.contains("natives-macos-arm64") || lib_name.contains("natives-osx-arm64");
        let has_macos_suffix =
            lib_name.contains("natives-macos") || lib_name.contains("natives-osx");

        if prefer_arm64_macos {
            if is_lwjgl {
                if has_arm64_suffix {
                    return true;
                }
                if has_macos_suffix {
                    return false;
                }
            }
            true
        } else if has_arm64_suffix {
            false
        } else {
            true
        }
    }

    fn preferred_native_keys(current_os: &str, prefer_arm64_macos: bool) -> Vec<&'static str> {
        match current_os {
            "windows" => {
                if cfg!(target_arch = "aarch64") {
                    vec![
                        "natives-windows-arm64",
                        "natives-windows",
                        "natives-windows-64",
                        "natives-windows-x86_64",
                    ]
                } else {
                    vec![
                        "natives-windows",
                        "natives-windows-64",
                        "natives-windows-x86_64",
                        "natives-windows-arm64",
                    ]
                }
            }
            "osx" => {
                if prefer_arm64_macos {
                    vec![
                        "natives-macos-arm64",
                        "natives-osx-arm64",
                        "natives-macos",
                        "natives-osx",
                    ]
                } else {
                    vec![
                        "natives-macos",
                        "natives-osx",
                        "natives-macos-arm64",
                        "natives-osx-arm64",
                    ]
                }
            }
            "linux" => {
                if cfg!(target_arch = "aarch64") {
                    vec![
                        "natives-linux-arm64",
                        "natives-linux-aarch64",
                        "natives-linux",
                        "natives-linux-64",
                        "natives-linux-x86_64",
                    ]
                } else {
                    vec![
                        "natives-linux",
                        "natives-linux-64",
                        "natives-linux-x86_64",
                        "natives-linux-arm64",
                        "natives-linux-aarch64",
                    ]
                }
            }
            _ => Vec::new(),
        }
    }

    /// Migrate existing Lapetus installations from .minecraft to .trapgaint
    fn migrate_from_minecraft(lapetus_dir: &PathBuf) -> Result<(), String> {
        let home = dirs::home_dir().ok_or("Could not find home directory")?;

        // Get the old .minecraft directory path
        #[cfg(target_os = "macos")]
        let old_minecraft_dir = home.join("Library/Application Support/minecraft");

        #[cfg(target_os = "windows")]
        let old_minecraft_dir = {
            if let Ok(appdata) = std::env::var("APPDATA") {
                PathBuf::from(appdata).join(".minecraft")
            } else {
                home.join("AppData").join("Roaming").join(".minecraft")
            }
        };

        #[cfg(target_os = "linux")]
        let old_minecraft_dir = home.join(".minecraft");

        // Check if migration is needed (lapetus versions exist in old dir but not in new)
        let old_versions_dir = old_minecraft_dir.join("versions");
        let new_versions_dir = lapetus_dir.join("versions");

        if !old_versions_dir.exists() {
            return Ok(()); // No old installation
        }

        // Check for lapetus versions in old directory
        let mut has_lapetus_in_old = false;
        let mut has_lapetus_in_new = false;

        if let Ok(entries) = std::fs::read_dir(&old_versions_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("lapetus-") {
                    has_lapetus_in_old = true;
                    break;
                }
            }
        }

        if new_versions_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&new_versions_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("lapetus-") {
                        has_lapetus_in_new = true;
                        break;
                    }
                }
            }
        }

        // Only migrate if old has lapetus but new doesn't
        if has_lapetus_in_old && !has_lapetus_in_new {
            println!("[Migration] Found existing Lapetus installation in .minecraft, migrating to .trapgaint...");

            // Create directories
            std::fs::create_dir_all(&new_versions_dir).ok();
            std::fs::create_dir_all(lapetus_dir.join("libraries")).ok();
            std::fs::create_dir_all(lapetus_dir.join("assets")).ok();
            std::fs::create_dir_all(lapetus_dir.join("mods")).ok();

            // Copy lapetus versions
            if let Ok(entries) = std::fs::read_dir(&old_versions_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("lapetus-") || name.starts_with("fabric-loader") {
                        let src = entry.path();
                        let dst = new_versions_dir.join(&name);
                        if !dst.exists() {
                            println!("[Migration] Copying version: {}", name);
                            Self::copy_dir_recursive(&src, &dst).ok();
                        }
                    }
                }
            }

            // Copy libraries (needed for Fabric)
            let old_libs = old_minecraft_dir.join("libraries");
            let new_libs = lapetus_dir.join("libraries");
            if old_libs.exists() && !new_libs.join("net").exists() {
                println!("[Migration] Copying libraries...");
                Self::copy_dir_recursive(&old_libs, &new_libs).ok();
            }

            // Copy assets
            let old_assets = old_minecraft_dir.join("assets");
            let new_assets = lapetus_dir.join("assets");
            if old_assets.exists() && !new_assets.join("indexes").exists() {
                println!("[Migration] Copying assets...");
                Self::copy_dir_recursive(&old_assets, &new_assets).ok();
            }

            // Copy lapetus mod
            let old_mods = old_minecraft_dir.join("mods");
            let new_mods = lapetus_dir.join("mods");
            if old_mods.exists() {
                std::fs::create_dir_all(&new_mods).ok();
                if let Ok(entries) = std::fs::read_dir(&old_mods) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains("lapetus") || name.contains("fabric-api") {
                            let src = entry.path();
                            let dst = new_mods.join(&name);
                            if !dst.exists() {
                                println!("[Migration] Copying mod: {}", name);
                                std::fs::copy(&src, &dst).ok();
                            }
                        }
                    }
                }
            }

            // Copy accounts file
            let old_accounts = old_minecraft_dir.join("lapetus_accounts.json");
            let new_accounts = lapetus_dir.join("lapetus_accounts.json");
            if old_accounts.exists() && !new_accounts.exists() {
                println!("[Migration] Copying accounts...");
                std::fs::copy(&old_accounts, &new_accounts).ok();
            }

            println!("[Migration] Migration complete!");
        }

        Ok(())
    }

    /// Recursively copy a directory
    fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;

        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());

            if src_path.is_dir() {
                Self::copy_dir_recursive(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    fn get_minecraft_dir() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or("Could not find home directory")?;

        println!("[DEBUG] Home directory: {:?}", home);

        // Use .trapgaint directory instead of .minecraft to avoid conflicts with other launchers
        #[cfg(target_os = "macos")]
        let minecraft_dir = home.join("Library/Application Support/trapgaint");

        #[cfg(target_os = "windows")]
        let minecraft_dir = {
            // On Windows, use APPDATA environment variable for reliability
            if let Ok(appdata) = std::env::var("APPDATA") {
                PathBuf::from(appdata).join(".trapgaint")
            } else {
                home.join("AppData").join("Roaming").join(".trapgaint")
            }
        };

        #[cfg(target_os = "linux")]
        let minecraft_dir = home.join(".trapgaint");

        println!("[DEBUG] TrapGaint directory: {:?}", minecraft_dir);

        std::fs::create_dir_all(&minecraft_dir).map_err(|e| e.to_string())?;
        Ok(minecraft_dir)
    }

    pub fn get_installed_versions(&self) -> Result<Vec<String>, String> {
        let versions_dir = self.game_dir.join("versions");
        let mut versions = Vec::new();

        // For vanilla versions, check versions folder only
        if versions_dir.exists() {
            let entries = std::fs::read_dir(&versions_dir).map_err(|e| e.to_string())?;
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            let version_id = entry.file_name().to_string_lossy().to_string();
                            let jar_path = entry.path().join(format!("{}.jar", version_id));
                            let json_path = entry.path().join(format!("{}.json", version_id));

                            // Check both JSON and JAR exist
                            if jar_path.exists() && json_path.exists() {
                                // Check if this is a vanilla version (no inheritsFrom or loader in the name)
                                let is_vanilla = !version_id.contains("forge")
                                    && !version_id.contains("fabric")
                                    && !version_id.contains("quilt")
                                    && !version_id.contains("loader");

                                if is_vanilla {
                                    println!("[INFO] Found vanilla version: {}", version_id);
                                    versions.push(version_id);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(versions)
    }

    fn check_java_installed(&self) -> bool {
        // Check for any Java version
        self.check_java_installed_version(21)
            || self.check_java_installed_version(17)
            || self.check_java_installed_version(8)
    }

    fn extract_base_minecraft_version(version_id: &str) -> String {
        // Extract base MC version from various formats:
        // - "1.20.1" (vanilla)
        // - "1.20.1-forge-47.2.0" (forge)
        // - "fabric-loader-0.18.4-1.21.11" (fabric)
        // - "quilt-loader-0.30.0-beta.0-1.21.11" (quilt)
        // - "lapetus-12.0.0-alpha.8-1.21.11" (lapetus)
        // - "fabulously-optimized-1.21.11" (modpack)
        if version_id.starts_with("fabric-loader-")
            || version_id.starts_with("quilt-loader-")
            || version_id.starts_with("lapetus-")
        {
            // Fabric/Quilt/Lapetus format: MC version is at the end after the last dash
            version_id
                .rsplit('-')
                .next()
                .unwrap_or(version_id)
                .to_string()
        } else if {
            let mut parts = version_id.split('-');
            let first = parts.next().unwrap_or("");
            let second = parts.next().unwrap_or("");
            !first.is_empty()
                && first
                    .chars()
                    .all(|char| char.is_ascii_digit() || char == '.')
                && (second.eq_ignore_ascii_case("forge")
                    || second.to_ascii_lowercase().starts_with("forge")
                    || second.eq_ignore_ascii_case("neoforge")
                    || second.to_ascii_lowercase().starts_with("neoforge"))
        } {
            // Forge/NeoForge runtime format keeps the Minecraft version at the front.
            version_id
                .split('-')
                .next()
                .unwrap_or(version_id)
                .to_string()
        } else if version_id.contains('-') {
            // Check if this looks like a modpack ID (e.g., "fabulously-optimized-1.21.11")
            // or forge (e.g., "1.20.1-forge-47.2.0")
            // Try to extract MC version from the end first
            let last_part = version_id.rsplit('-').next().unwrap_or(version_id);

            // Check if last part looks like a Minecraft version (starts with digit and contains dots)
            if last_part
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
                && last_part.contains('.')
            {
                // This is likely a modpack: "modpack-name-1.21.11" -> "1.21.11"
                last_part.to_string()
            } else {
                // This is likely forge or other: "1.20.1-forge-47.2.0" -> "1.20.1"
                version_id
                    .split('-')
                    .next()
                    .unwrap_or(version_id)
                    .to_string()
            }
        } else {
            // No dashes, assume it's just the version
            version_id.to_string()
        }
    }

    fn build_launch_display_name(version_id: &str) -> String {
        let mc_version = Self::extract_base_minecraft_version(version_id);

        if version_id.starts_with("dragon-") {
            format!("Dragon {}", mc_version)
        } else if version_id.starts_with("fabric-loader-") {
            format!("Fabric {}", mc_version)
        } else if version_id.starts_with("quilt-loader-") {
            format!("Quilt {}", mc_version)
        } else if version_id.starts_with("lapetus-") {
            format!("Lapetus {}", mc_version)
        } else if version_id.contains("forge") {
            format!("Forge {}", mc_version)
        } else {
            format!("Minecraft {}", mc_version)
        }
    }

    fn build_launch_version_type(version_id: &str) -> String {
        Self::build_launch_display_name(version_id)
    }

    fn upsert_game_arg(args: &mut Vec<String>, key: &str, value: impl Into<String>) {
        let value = value.into();
        if let Some(index) = args.iter().position(|arg| arg == key) {
            if index + 1 < args.len() {
                args[index + 1] = value;
            } else {
                args.push(value);
            }
            return;
        }

        args.push(key.to_string());
        args.push(value);
    }

    fn parse_mc_version_numbers(version: &str) -> (u32, u32, u32) {
        // Robust numeric extraction for:
        // - release versions: 1.21.11
        // - pre/rc: 1.20.6-rc1, 1.21-pre3
        // - snapshots: 26w14a, 24w10a
        let mut numbers = version
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<u32>().ok());

        let major = numbers.next().unwrap_or(1);
        let minor = numbers.next().unwrap_or(0);
        let patch = numbers.next().unwrap_or(0);
        (major, minor, patch)
    }

    fn get_required_java_version(version_id: &str) -> u8 {
        let base_version = Self::extract_base_minecraft_version(version_id);

        println!(
            "[DEBUG] get_required_java_version: version_id={}, base_version={}",
            version_id, base_version
        );

        // Parse version numbers (handles snapshots/pre-releases too)
        let (major, minor, patch) = Self::parse_mc_version_numbers(&base_version);

        // Determine Java version
        let java_version = if major >= 26 || (major == 1 && minor >= 26) {
            // Support both modern "26.x" and transitional "1.26.x" version styles.
            25 // 26.x+ snapshots/releases require Java 25
        } else if major == 1 {
            if minor >= 21 || (minor == 20 && patch >= 5) {
                21 // 1.20.5+ needs Java 21
            } else if minor >= 17 {
                17 // 1.17 - 1.20.4 needs Java 17
            } else {
                8 // 1.16.5 and below needs Java 8
            }
        } else {
            25 // Future versions, assume Java 25
        };

        println!(
            "[DEBUG] Determined Java version: {} for MC {}.{}.{}",
            java_version, major, minor, patch
        );
        java_version
    }

    fn check_java_installed_version(&self, java_version: u8) -> bool {
        // First check our bundled Java
        let bundled_java = self.get_bundled_java_path_version(java_version);
        if let Some(java_path) = bundled_java {
            if java_path.exists() {
                return true;
            }
        }

        // Then check system paths
        #[cfg(target_os = "windows")]
        let java_paths: Vec<String> = match java_version {
            25 => vec![
                format!("C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jdk-25\\bin\\java.exe"),
                format!("C:\\Program Files\\Microsoft\\jdk-25\\bin\\java.exe"),
            ],
            22 => vec![
                format!("C:\\Program Files\\Eclipse Adoptium\\jdk-22\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jdk-22\\bin\\java.exe"),
                format!("C:\\Program Files\\Microsoft\\jdk-22\\bin\\java.exe"),
            ],
            21 => vec![
                format!(
                    "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5.11-hotspot\\bin\\java.exe"
                ),
                format!("C:\\Program Files\\Java\\jdk-21\\bin\\java.exe"),
                format!("C:\\Program Files\\Microsoft\\jdk-21.0.5.11-hotspot\\bin\\java.exe"),
            ],
            17 => vec![
                format!(
                    "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.13.11-hotspot\\bin\\java.exe"
                ),
                format!("C:\\Program Files\\Java\\jdk-17\\bin\\java.exe"),
                format!("C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot\\bin\\java.exe"),
            ],
            8 => vec![
                format!("C:\\Program Files\\Eclipse Adoptium\\jdk-8u432-b06\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jre1.8.0_432\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jdk1.8.0_432\\bin\\java.exe"),
            ],
            _ => vec![],
        };

        #[cfg(target_os = "macos")]
        let java_paths: Vec<String> = match java_version {
            25 => vec![
                "/opt/homebrew/opt/openjdk@25/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-25.jdk/Contents/Home/bin/java".to_string(),
            ],
            22 => vec![
                "/opt/homebrew/opt/openjdk@22/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-22.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-22.jdk/Contents/Home/bin/java".to_string(),
            ],
            21 => vec![
                "/opt/homebrew/opt/openjdk@21/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java"
                    .to_string(),
            ],
            17 => vec![
                "/opt/homebrew/opt/openjdk@17/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java"
                    .to_string(),
            ],
            8 => vec![
                "/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java".to_string(),
            ],
            _ => vec![],
        };

        #[cfg(target_os = "linux")]
        let java_paths: Vec<String> = match java_version {
            25 => vec!["/usr/lib/jvm/java-25-openjdk/bin/java".to_string()],
            22 => vec!["/usr/lib/jvm/java-22-openjdk/bin/java".to_string()],
            21 => vec!["/usr/lib/jvm/java-21-openjdk/bin/java".to_string()],
            17 => vec!["/usr/lib/jvm/java-17-openjdk/bin/java".to_string()],
            8 => vec!["/usr/lib/jvm/java-8-openjdk/bin/java".to_string()],
            _ => vec![],
        };

        for path in java_paths {
            if std::path::Path::new(&path).exists() {
                return true;
            }
        }

        false
    }

    fn get_bundled_java_path_version_with_arch(
        &self,
        java_version: u8,
        preferred_arch: Option<JavaArchitecture>,
    ) -> Option<PathBuf> {
        let mut runtime_dirs = Vec::new();

        #[cfg(target_os = "macos")]
        {
            if matches!(preferred_arch, Some(JavaArchitecture::X86_64)) {
                runtime_dirs.push(
                    self.game_dir
                        .join("runtime")
                        .join(format!("java-{}-x64", java_version)),
                );
            } else if matches!(preferred_arch, Some(JavaArchitecture::Arm64)) {
                runtime_dirs.push(
                    self.game_dir
                        .join("runtime")
                        .join(format!("java-{}-arm64", java_version)),
                );
            }
        }

        runtime_dirs.push(
            self.game_dir
                .join("runtime")
                .join(format!("java-{}", java_version)),
        );

        for java_dir in runtime_dirs {
            #[cfg(target_os = "windows")]
            let candidate_paths = vec![java_dir.join("bin").join("java.exe")];

            #[cfg(not(target_os = "windows"))]
            let mut candidate_paths = vec![java_dir.join("bin").join("java")];

            #[cfg(target_os = "macos")]
            {
                candidate_paths.push(java_dir.join("Home").join("bin").join("java"));
                candidate_paths.push(
                    java_dir
                        .join("zulu-8.jdk")
                        .join("Contents")
                        .join("Home")
                        .join("bin")
                        .join("java"),
                );
                candidate_paths.push(
                    java_dir
                        .join("Contents")
                        .join("Home")
                        .join("bin")
                        .join("java"),
                );
            }

            for candidate in candidate_paths {
                println!(
                    "[DEBUG] Checking bundled Java {} at: {}",
                    java_version,
                    candidate.display()
                );
                if Self::is_java_executable_compatible(&candidate, java_version, preferred_arch) {
                    println!(
                        "[DEBUG] Found bundled Java {} at: {}",
                        java_version,
                        candidate.display()
                    );
                    return Some(candidate);
                }
            }
        }

        println!("[DEBUG] Bundled Java {} not found", java_version);
        None
    }

    fn get_bundled_java_path_version(&self, java_version: u8) -> Option<PathBuf> {
        self.get_bundled_java_path_version_with_arch(java_version, None)
    }

    fn get_bundled_java_path(&self) -> Option<PathBuf> {
        // Check all versions, prefer newer
        for version in [25, 22, 21, 17, 8] {
            if let Some(path) = self.get_bundled_java_path_version(version) {
                if path.exists() {
                    return Some(path);
                }
            }
        }
        None
    }

    fn find_java_for_required_version(
        &self,
        required_version: u8,
        preferred_java_arch: Option<JavaArchitecture>,
    ) -> Option<PathBuf> {
        // First check bundled Java for this exact requirement.
        if let Some(bundled) =
            self.get_bundled_java_path_version_with_arch(required_version, preferred_java_arch)
        {
            if bundled.exists() {
                return Some(bundled);
            }
        }

        #[cfg(target_os = "windows")]
        let java_paths: Vec<String> = {
            let mut paths = vec![
                format!(
                    "C:\\Program Files\\Eclipse Adoptium\\jdk-{}\\bin\\java.exe",
                    required_version
                ),
                format!(
                    "C:\\Program Files\\Java\\jdk-{}\\bin\\java.exe",
                    required_version
                ),
                format!(
                    "C:\\Program Files\\Microsoft\\jdk-{}\\bin\\java.exe",
                    required_version
                ),
            ];

            let program_files = vec!["C:\\Program Files", "C:\\Program Files (x86)"];
            for pf in &program_files {
                for vendor_dir in ["Eclipse Adoptium", "Java", "Microsoft", "Zulu"] {
                    let root = format!("{}\\{}", pf, vendor_dir);
                    if let Ok(entries) = std::fs::read_dir(root) {
                        for entry in entries.flatten() {
                            let name = entry.file_name().to_string_lossy().to_lowercase();
                            let contains_required = if required_version == 8 {
                                name.contains("1.8")
                                    || name.contains("jdk-8")
                                    || name.contains("jdk8")
                                    || name.contains("zulu-8")
                                    || name.contains("zulu8")
                            } else {
                                name.contains(&format!("jdk-{}", required_version))
                                    || name.contains(&format!("jdk{}", required_version))
                                    || name.contains(&format!("zulu-{}", required_version))
                                    || name.contains(&format!("zulu{}", required_version))
                            };
                            if contains_required {
                                let java_exe = entry.path().join("bin").join("java.exe");
                                if java_exe.exists() {
                                    paths.push(java_exe.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }

            paths
        };

        #[cfg(target_os = "macos")]
        let java_paths: Vec<String> = vec![
            format!("/opt/homebrew/opt/openjdk@{}/bin/java", required_version),
            format!(
                "/Library/Java/JavaVirtualMachines/temurin-{}.jdk/Contents/Home/bin/java",
                required_version
            ),
            format!(
                "/Library/Java/JavaVirtualMachines/openjdk-{}.jdk/Contents/Home/bin/java",
                required_version
            ),
            format!(
                "/Library/Java/JavaVirtualMachines/zulu-{}.jdk/Contents/Home/bin/java",
                required_version
            ),
            format!(
                "/Library/Java/JavaVirtualMachines/adoptium-{}.jdk/Contents/Home/bin/java",
                required_version
            ),
        ];

        #[cfg(target_os = "linux")]
        let java_paths: Vec<String> = vec![
            format!("/usr/lib/jvm/java-{}-openjdk/bin/java", required_version),
            format!("/usr/lib/jvm/jdk-{}-openjdk/bin/java", required_version),
            format!("/usr/lib/jvm/java-{}-temurin/bin/java", required_version),
        ];

        for path in java_paths {
            let p = PathBuf::from(&path);
            if Self::is_java_executable_compatible(&p, required_version, preferred_java_arch) {
                return Some(p);
            }
        }

        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let java_exe = if cfg!(target_os = "windows") {
                PathBuf::from(&java_home).join("bin").join("java.exe")
            } else {
                PathBuf::from(&java_home).join("bin").join("java")
            };

            if Self::is_java_executable_compatible(&java_exe, required_version, preferred_java_arch)
            {
                println!(
                    "[DEBUG] Found Java {} via JAVA_HOME: {}",
                    required_version,
                    java_exe.display()
                );
                return Some(java_exe);
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut where_cmd = Command::new("where");
            where_cmd.arg("java");
            if let Ok(output) = run_output_hidden(&mut where_cmd) {
                if output.status.success() {
                    let paths_str = String::from_utf8_lossy(&output.stdout);
                    for path in paths_str.lines() {
                        let java_path = PathBuf::from(path.trim());
                        if !java_path.exists() {
                            continue;
                        }
                        let mut version_cmd = Command::new(&java_path);
                        version_cmd.arg("-version");
                        if let Ok(ver_output) = run_output_hidden(&mut version_cmd) {
                            let version_str = String::from_utf8_lossy(&ver_output.stderr);
                            let matches = if required_version == 8 {
                                version_str.contains("1.8") || version_str.contains("\"8")
                            } else {
                                version_str.contains(&format!("\"{}", required_version))
                            };
                            if matches
                                && Self::is_java_executable_compatible(
                                    &java_path,
                                    required_version,
                                    preferred_java_arch,
                                )
                            {
                                return Some(java_path);
                            }
                        }
                    }
                }
            }
        }

        None
    }

    pub fn find_java(&self) -> Option<PathBuf> {
        self.find_java_for_version("1.21")
    }

    pub fn find_java_for_version(&self, version_id: &str) -> Option<PathBuf> {
        let required_version = Self::get_required_java_version(version_id);
        let preferred_java_arch = self.preferred_java_arch_for_launch_version(version_id);

        // First check bundled Java for this version
        if let Some(bundled) =
            self.get_bundled_java_path_version_with_arch(required_version, preferred_java_arch)
        {
            if bundled.exists() {
                return Some(bundled);
            }
        }

        // Then check system paths
        #[cfg(target_os = "windows")]
        let java_paths: Vec<String> = {
            let mut paths = Vec::new();

            // Check Program Files directories for Java installations
            let program_files = vec!["C:\\Program Files", "C:\\Program Files (x86)"];

            for pf in &program_files {
                // Eclipse Adoptium / Temurin
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Eclipse Adoptium", pf)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains(&format!("jdk-{}", required_version))
                            || (required_version == 8 && name.contains("jdk-8"))
                            || (required_version == 17 && name.contains("jdk-17"))
                            || (required_version == 21 && name.contains("jdk-21"))
                            || (required_version == 25 && name.contains("jdk-25"))
                        {
                            let java_exe = entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }

                // Oracle/OpenJDK Java
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Java", pf)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let matches = match required_version {
                            8 => {
                                name.contains("jdk1.8")
                                    || name.contains("jre1.8")
                                    || name.contains("jdk-8")
                            }
                            25 => name.contains("jdk-25") || name.contains("jdk25"),
                            17 => name.contains("jdk-17") || name.contains("jdk17"),
                            21 => name.contains("jdk-21") || name.contains("jdk21"),
                            _ => false,
                        };
                        if matches {
                            let java_exe = entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }

                // Microsoft OpenJDK
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Microsoft", pf)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains(&format!("jdk-{}", required_version)) {
                            let java_exe = entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }

                // Zulu JDK
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Zulu", pf)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let matches = match required_version {
                            8 => name.contains("zulu-8") || name.contains("zulu8"),
                            25 => name.contains("zulu-25") || name.contains("zulu25"),
                            17 => name.contains("zulu-17") || name.contains("zulu17"),
                            21 => name.contains("zulu-21") || name.contains("zulu21"),
                            _ => false,
                        };
                        if matches {
                            let java_exe = entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }

            // Add some common hardcoded paths as fallback
            match required_version {
                25 => {
                    paths.push(
                        "C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe".to_string(),
                    );
                    paths.push("C:\\Program Files\\Java\\jdk-25\\bin\\java.exe".to_string());
                }
                21 => {
                    paths.push(
                        "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5.11-hotspot\\bin\\java.exe"
                            .to_string(),
                    );
                    paths.push("C:\\Program Files\\Java\\jdk-21\\bin\\java.exe".to_string());
                }
                17 => {
                    paths.push("C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.13.11-hotspot\\bin\\java.exe".to_string());
                    paths.push("C:\\Program Files\\Java\\jdk-17\\bin\\java.exe".to_string());
                }
                8 => {
                    paths.push(
                        "C:\\Program Files\\Eclipse Adoptium\\jdk-8u432-b06\\bin\\java.exe"
                            .to_string(),
                    );
                    paths.push("C:\\Program Files\\Java\\jre1.8.0_432\\bin\\java.exe".to_string());
                }
                _ => {}
            }

            paths
        };

        #[cfg(target_os = "macos")]
        let java_paths: Vec<String> = match required_version {
            25 => vec![
                "/opt/homebrew/opt/openjdk@25/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/openjdk-25.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-25.jdk/Contents/Home/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/adoptium-25.jdk/Contents/Home/bin/java"
                    .to_string(),
            ],
            22 => vec![
                "/opt/homebrew/opt/openjdk@22/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-22.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-22.jdk/Contents/Home/bin/java".to_string(),
            ],
            21 => vec![
                "/opt/homebrew/opt/openjdk@21/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java"
                    .to_string(),
            ],
            17 => vec![
                "/opt/homebrew/opt/openjdk@17/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java"
                    .to_string(),
            ],
            8 => vec![
                "/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java".to_string(),
            ],
            _ => vec![],
        };

        #[cfg(target_os = "linux")]
        let java_paths: Vec<String> = match required_version {
            25 => vec![
                "/usr/lib/jvm/java-25-openjdk/bin/java".to_string(),
                "/usr/lib/jvm/jdk-25-openjdk/bin/java".to_string(),
                "/usr/lib/jvm/java-25-temurin/bin/java".to_string(),
            ],
            22 => vec!["/usr/lib/jvm/java-22-openjdk/bin/java".to_string()],
            21 => vec!["/usr/lib/jvm/java-21-openjdk/bin/java".to_string()],
            17 => vec!["/usr/lib/jvm/java-17-openjdk/bin/java".to_string()],
            8 => vec!["/usr/lib/jvm/java-8-openjdk/bin/java".to_string()],
            _ => vec![],
        };

        for path in java_paths {
            let p = PathBuf::from(&path);
            if Self::is_java_executable_compatible(&p, required_version, preferred_java_arch) {
                return Some(p);
            }
        }

        // Check JAVA_HOME environment variable
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let java_exe = if cfg!(target_os = "windows") {
                PathBuf::from(&java_home).join("bin").join("java.exe")
            } else {
                PathBuf::from(&java_home).join("bin").join("java")
            };

            if java_exe.exists() {
                if Self::is_java_executable_compatible(
                    &java_exe,
                    required_version,
                    preferred_java_arch,
                ) {
                    println!(
                        "[DEBUG] Found Java {} via JAVA_HOME: {}",
                        required_version,
                        java_exe.display()
                    );
                    return Some(java_exe);
                }
            }
        }

        // On Windows, also try to find java in PATH and verify version
        #[cfg(target_os = "windows")]
        {
            let mut where_cmd = Command::new("where");
            where_cmd.arg("java");
            if let Ok(output) = run_output_hidden(&mut where_cmd) {
                if output.status.success() {
                    let paths_str = String::from_utf8_lossy(&output.stdout);
                    for path in paths_str.lines() {
                        let path = path.trim();
                        if path.is_empty() {
                            continue;
                        }

                        let java_path = PathBuf::from(path);
                        if java_path.exists() {
                            // Verify version
                            let mut version_cmd = Command::new(&java_path);
                            version_cmd.arg("-version");
                            if let Ok(ver_output) = run_output_hidden(&mut version_cmd) {
                                let version_str = String::from_utf8_lossy(&ver_output.stderr);
                                let matches = match required_version {
                                    8 => version_str.contains("1.8") || version_str.contains("\"8"),
                                    25 => version_str.contains("\"25"),
                                    17 => version_str.contains("\"17"),
                                    21 => version_str.contains("\"21"),
                                    _ => false,
                                };
                                if matches {
                                    println!(
                                        "[DEBUG] Found Java {} in PATH: {}",
                                        required_version,
                                        java_path.display()
                                    );
                                    return Some(java_path);
                                }
                            }
                        }
                    }
                }
            }
        }

        // DON'T fall back to system PATH on macOS - /usr/bin/java is just a stub
        // The bundled Java should always be used if available

        None
    }

    async fn install_java<F>(&self, progress_callback: &F) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Download Java to .minecraft/runtime folder
        let runtime_dir = self.game_dir.join("runtime").join("java-21");
        std::fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;

        #[cfg(target_os = "windows")]
        {
            progress_callback(0.01, "Downloading Java 21...".to_string());

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?;

            // Download portable ZIP version instead of MSI
            let download_url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip";

            let response = client
                .get(download_url)
                .send()
                .await
                .map_err(|e| format!("Failed to download Java: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Download failed: {}", response.status()));
            }

            progress_callback(0.02, "Downloading Java 21 (~180MB)...".to_string());

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;

            if bytes.len() < 10000000 {
                return Err("Downloaded file too small, likely failed".to_string());
            }

            progress_callback(0.03, "Extracting Java...".to_string());

            // Save and extract ZIP
            let temp_dir = std::env::temp_dir();
            let zip_path = temp_dir.join("java21.zip");
            std::fs::write(&zip_path, &bytes).map_err(|e| e.to_string())?;

            // Extract using PowerShell (hidden window)
            let extract_cmd = format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                zip_path.to_string_lossy(),
                runtime_dir.to_string_lossy()
            );

            #[cfg(target_os = "windows")]
            use std::os::windows::process::CommandExt;

            let mut ps_cmd = Command::new("powershell");
            ps_cmd.args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &extract_cmd,
            ]);

            #[cfg(target_os = "windows")]
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                ps_cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let status = ps_cmd.status().map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&zip_path);

            if !status.success() {
                return Err("Failed to extract Java".to_string());
            }

            // Move contents from nested folder (jdk-21.0.5+11) to runtime_dir
            let nested_dir = runtime_dir.join("jdk-21.0.5+11");
            if nested_dir.exists() {
                // Move all contents up one level
                if let Ok(entries) = std::fs::read_dir(&nested_dir) {
                    for entry in entries.flatten() {
                        let dest = runtime_dir.join(entry.file_name());
                        let _ = std::fs::rename(entry.path(), dest);
                    }
                }
                let _ = std::fs::remove_dir_all(&nested_dir);
            }

            progress_callback(0.04, "Java 21 installed!".to_string());
            println!("[INFO] Java installed to: {}", runtime_dir.display());
        }

        #[cfg(target_os = "macos")]
        {
            // Try Homebrew first
            if let Ok(output) = Command::new("brew").args(["--version"]).output() {
                if output.status.success() {
                    progress_callback(0.02, "Installing Java via Homebrew...".to_string());

                    let status = Command::new("brew")
                        .args(["install", "openjdk@21"])
                        .status()
                        .map_err(|e| e.to_string())?;

                    if status.success() {
                        return Ok(());
                    }
                }
            }

            // Fallback: Download tar.gz
            progress_callback(0.02, "Downloading Java 21...".to_string());

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?;

            let arch = if cfg!(target_arch = "aarch64") {
                "aarch64"
            } else {
                "x64"
            };
            let download_url = format!(
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_{}_mac_hotspot_21.0.5_11.tar.gz",
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

            progress_callback(0.03, "Extracting Java...".to_string());

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let temp_dir = std::env::temp_dir();
            let tar_path = temp_dir.join("java21.tar.gz");
            std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

            // Extract using tar
            let status = Command::new("tar")
                .args([
                    "-xzf",
                    tar_path.to_str().unwrap(),
                    "-C",
                    runtime_dir.to_str().unwrap(),
                    "--strip-components=1",
                ])
                .status()
                .map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&tar_path);

            if !status.success() {
                return Err("Failed to extract Java".to_string());
            }

            progress_callback(0.04, "Java 21 installed!".to_string());
        }

        #[cfg(target_os = "linux")]
        {
            progress_callback(0.02, "Downloading Java 21...".to_string());

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?;

            let download_url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_linux_hotspot_21.0.5_11.tar.gz";

            let response = client
                .get(download_url)
                .send()
                .await
                .map_err(|e| format!("Failed to download Java: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Download failed: {}", response.status()));
            }

            progress_callback(0.03, "Extracting Java...".to_string());

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let temp_dir = std::env::temp_dir();
            let tar_path = temp_dir.join("java21.tar.gz");
            std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

            let status = Command::new("tar")
                .args([
                    "-xzf",
                    tar_path.to_str().unwrap(),
                    "-C",
                    runtime_dir.to_str().unwrap(),
                    "--strip-components=1",
                ])
                .status()
                .map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&tar_path);

            if !status.success() {
                return Err("Failed to extract Java".to_string());
            }

            progress_callback(0.04, "Java 21 installed!".to_string());
        }

        Ok(())
    }

    async fn install_java_version<F>(
        &self,
        java_version: u8,
        progress_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Download Java to .minecraft/runtime folder
        let runtime_dir = self
            .game_dir
            .join("runtime")
            .join(format!("java-{}", java_version));

        // Check if Java already exists and is valid - if so, skip download
        let java_exe = if cfg!(target_os = "windows") {
            runtime_dir.join("bin").join("java.exe")
        } else {
            runtime_dir.join("bin").join("java")
        };

        if java_exe.exists() {
            // Verify it works
            let mut test_cmd = Command::new(&java_exe);
            test_cmd.arg("-version");
            let test_result = run_output_hidden(&mut test_cmd);

            if let Ok(output) = test_result {
                if output.status.success() {
                    progress_callback(0.04, format!("Java {} already installed!", java_version));
                    return Ok(());
                }
            }
            // Java exists but broken - delete and re-download
            progress_callback(
                0.01,
                format!("Repairing Java {} installation...", java_version),
            );
            let _ = std::fs::remove_dir_all(&runtime_dir);
        }

        std::fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;

        // Get download URLs based on Java version. For newer versions (e.g. Java 25),
        // fall back to Adoptium's latest binary endpoints so we do not pin to old JDKs.
        #[allow(unused_variables)]
        let (
            windows_url,
            windows_nested_dir,
            mac_url_arm,
            mac_url_x64,
            _mac_nested_dir,
            linux_url,
            _linux_nested_dir,
        ): (String, String, String, String, String, String, String) = match java_version {
            8 => (
                "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-jdk_x64_windows_hotspot_8u432b06.zip".to_string(),
                "jdk8u432-b06".to_string(),
                "https://cdn.azul.com/zulu/bin/zulu8.82.0.21-ca-jdk8.0.432-macosx_aarch64.tar.gz".to_string(),
                "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-jdk_x64_mac_hotspot_8u432b06.tar.gz".to_string(),
                "jdk8u432-b06".to_string(),
                "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-jdk_x64_linux_hotspot_8u432b06.tar.gz".to_string(),
                "jdk8u432-b06".to_string(),
            ),
            17 => (
                "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip".to_string(),
                "jdk-17.0.13+11".to_string(),
                "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.13_11.tar.gz".to_string(),
                "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_mac_hotspot_17.0.13_11.tar.gz".to_string(),
                "jdk-17.0.13+11".to_string(),
                "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz".to_string(),
                "jdk-17.0.13+11".to_string(),
            ),
            21 => (
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip".to_string(),
                "jdk-21.0.5+11".to_string(),
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.5_11.tar.gz".to_string(),
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_mac_hotspot_21.0.5_11.tar.gz".to_string(),
                "jdk-21.0.5+11".to_string(),
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_linux_hotspot_21.0.5_11.tar.gz".to_string(),
                "jdk-21.0.5+11".to_string(),
            ),
            22 => (
                "https://github.com/adoptium/temurin22-binaries/releases/download/jdk-22.0.2%2B9/OpenJDK22U-jdk_x64_windows_hotspot_22.0.2_9.zip".to_string(),
                "jdk-22.0.2+9".to_string(),
                "https://github.com/adoptium/temurin22-binaries/releases/download/jdk-22.0.2%2B9/OpenJDK22U-jdk_aarch64_mac_hotspot_22.0.2_9.tar.gz".to_string(),
                "https://github.com/adoptium/temurin22-binaries/releases/download/jdk-22.0.2%2B9/OpenJDK22U-jdk_x64_mac_hotspot_22.0.2_9.tar.gz".to_string(),
                "jdk-22.0.2+9".to_string(),
                "https://github.com/adoptium/temurin22-binaries/releases/download/jdk-22.0.2%2B9/OpenJDK22U-jdk_x64_linux_hotspot_22.0.2_9.tar.gz".to_string(),
                "jdk-22.0.2+9".to_string(),
            ),
            _ => (
                format!(
                    "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jdk/hotspot/normal/eclipse",
                    java_version
                ),
                format!("jdk-{}", java_version),
                format!(
                    "https://api.adoptium.net/v3/binary/latest/{}/ga/mac/aarch64/jdk/hotspot/normal/eclipse",
                    java_version
                ),
                format!(
                    "https://api.adoptium.net/v3/binary/latest/{}/ga/mac/x64/jdk/hotspot/normal/eclipse",
                    java_version
                ),
                format!("jdk-{}", java_version),
                format!(
                    "https://api.adoptium.net/v3/binary/latest/{}/ga/linux/x64/jdk/hotspot/normal/eclipse",
                    java_version
                ),
                format!("jdk-{}", java_version),
            ),
        };

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            // Retry download up to 3 times
            let mut last_error = String::new();
            for attempt in 1..=3 {
                progress_callback(
                    0.01,
                    format!(
                        "Downloading Java {} (attempt {}/3)...",
                        java_version, attempt
                    ),
                );
                println!(
                    "[DEBUG] Starting Java {} download attempt {}",
                    java_version, attempt
                );
                println!("[DEBUG] Download URL: {}", windows_url);
                println!("[DEBUG] Runtime dir: {}", runtime_dir.display());

                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(900)) // 15 min timeout for slow connections
                    .build()
                    .map_err(|e| e.to_string())?;

                let response = match client.get(&windows_url).send().await {
                    Ok(r) => r,
                    Err(e) => {
                        last_error = format!("Download failed: {}", e);
                        println!("[WARN] Java download attempt {} failed: {}", attempt, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        continue;
                    }
                };

                println!("[DEBUG] Response status: {}", response.status());

                if !response.status().is_success() {
                    last_error = format!("Download failed with status: {}", response.status());
                    println!(
                        "[WARN] Java download attempt {} failed: {}",
                        attempt, last_error
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    continue;
                }

                progress_callback(
                    0.02,
                    format!("Downloading Java {} (~180MB, please wait)...", java_version),
                );

                // Download with progress tracking
                let content_length = response.content_length().unwrap_or(180_000_000);
                let mut downloaded: u64 = 0;
                let mut bytes_vec = Vec::with_capacity(content_length as usize);
                let mut stream = response.bytes_stream();

                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(data) => {
                            downloaded += data.len() as u64;
                            bytes_vec.extend_from_slice(&data);
                            let percent =
                                (downloaded as f64 / content_length as f64 * 100.0).min(100.0);
                            let mb_done = downloaded as f64 / 1_000_000.0;
                            let mb_total = content_length as f64 / 1_000_000.0;
                            progress_callback(
                                0.02 + (percent as f32 / 100.0 * 0.008),
                                format!(
                                    "Downloading Java {}: {:.1}/{:.1} MB ({:.0}%)",
                                    java_version, mb_done, mb_total, percent
                                ),
                            );
                        }
                        Err(e) => {
                            last_error = format!("Download interrupted: {}", e);
                            println!("[WARN] Download chunk error: {}", e);
                            break;
                        }
                    }
                }

                let bytes = bytes_vec;

                println!(
                    "[DEBUG] Downloaded {} bytes ({:.1}MB)",
                    bytes.len(),
                    bytes.len() as f64 / 1_000_000.0
                );

                // Java ZIP should be at least 50MB
                if bytes.len() < 50_000_000 {
                    last_error = format!(
                        "Downloaded file too small ({:.1}MB), expected ~180MB",
                        bytes.len() as f64 / 1_000_000.0
                    );
                    println!(
                        "[WARN] Java download attempt {} failed: {}",
                        attempt, last_error
                    );
                    continue;
                }

                progress_callback(0.03, "Extracting Java...".to_string());

                // Save ZIP to temp
                let temp_dir = std::env::temp_dir();
                let zip_path = temp_dir.join(format!("java{}.zip", java_version));
                println!("[DEBUG] Saving ZIP to: {}", zip_path.display());

                if let Err(e) = std::fs::write(&zip_path, &bytes) {
                    last_error = format!("Failed to save download: {}", e);
                    println!("[WARN] Failed to save ZIP: {}", e);
                    continue;
                }

                // Clean runtime dir before extraction
                println!("[DEBUG] Cleaning runtime dir: {}", runtime_dir.display());
                let _ = std::fs::remove_dir_all(&runtime_dir);
                if let Err(e) = std::fs::create_dir_all(&runtime_dir) {
                    last_error = format!("Failed to create runtime dir: {}", e);
                    println!("[WARN] Failed to create runtime dir: {}", e);
                    continue;
                }

                // Extract using PowerShell (hidden window)
                let extract_cmd = format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    zip_path.to_string_lossy().replace("'", "''"),
                    runtime_dir.to_string_lossy().replace("'", "''")
                );
                println!("[DEBUG] Extract command: {}", extract_cmd);

                let ps_output = Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        &extract_cmd,
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();

                // Clean up ZIP file
                let _ = std::fs::remove_file(&zip_path);

                match ps_output {
                    Ok(output) => {
                        println!("[DEBUG] PowerShell exit code: {:?}", output.status.code());
                        if !output.status.success() {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            last_error =
                                format!("Extract failed: {} {}", stderr.trim(), stdout.trim());
                            println!("[WARN] Java extract failed - stderr: {}", stderr);
                            println!("[WARN] Java extract failed - stdout: {}", stdout);
                            continue;
                        }
                    }
                    Err(e) => {
                        last_error = format!("Failed to run PowerShell: {}", e);
                        println!("[WARN] Failed to run PowerShell: {}", e);
                        continue;
                    }
                }

                // List contents of runtime_dir for debugging
                println!("[DEBUG] Contents of runtime_dir after extraction:");
                let mut found_nested_dir: Option<PathBuf> = None;
                if let Ok(entries) = std::fs::read_dir(&runtime_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        println!("[DEBUG]   - {} (is_dir: {})", name, entry.path().is_dir());
                        // Look for any JDK folder (jdk-17.0.13+11, jdk8u432-b06, etc.)
                        if entry.path().is_dir()
                            && (name.starts_with("jdk") || name.starts_with("zulu"))
                        {
                            found_nested_dir = Some(entry.path());
                        }
                    }
                }

                // Move contents from nested folder to runtime_dir
                // First try the expected nested dir name
                let nested_dir = runtime_dir.join(&windows_nested_dir);
                let nested_to_use = if nested_dir.exists() {
                    println!(
                        "[DEBUG] Found expected nested dir: {}",
                        nested_dir.display()
                    );
                    Some(nested_dir)
                } else if let Some(found) = found_nested_dir {
                    println!("[DEBUG] Using found nested dir: {}", found.display());
                    Some(found)
                } else {
                    println!("[DEBUG] No nested dir found, checking if bin exists directly");
                    None
                };

                if let Some(nested) = nested_to_use {
                    println!("[DEBUG] Moving contents from nested dir...");
                    if let Ok(entries) = std::fs::read_dir(&nested) {
                        for entry in entries.flatten() {
                            let dest = runtime_dir.join(entry.file_name());
                            println!(
                                "[DEBUG] Moving {} to {}",
                                entry.path().display(),
                                dest.display()
                            );
                            if let Err(e) = std::fs::rename(entry.path(), &dest) {
                                println!(
                                    "[WARN] Failed to move {}: {}",
                                    entry.file_name().to_string_lossy(),
                                    e
                                );
                                // Try copy instead
                                if entry.path().is_dir() {
                                    let _ = copy_dir_all(entry.path(), &dest);
                                } else {
                                    let _ = std::fs::copy(entry.path(), &dest);
                                }
                            }
                        }
                    }
                    let _ = std::fs::remove_dir_all(&nested);
                }

                // Verify Java works
                let java_exe = runtime_dir.join("bin").join("java.exe");
                println!("[DEBUG] Checking for java.exe at: {}", java_exe.display());

                if !java_exe.exists() {
                    // List bin directory contents for debugging
                    let bin_dir = runtime_dir.join("bin");
                    println!("[DEBUG] bin dir exists: {}", bin_dir.exists());
                    if bin_dir.exists() {
                        if let Ok(entries) = std::fs::read_dir(&bin_dir) {
                            println!("[DEBUG] Contents of bin dir:");
                            for entry in entries.flatten() {
                                println!("[DEBUG]   - {}", entry.file_name().to_string_lossy());
                            }
                        }
                    }
                    last_error = format!("java.exe not found at {}", java_exe.display());
                    println!("[WARN] {}", last_error);
                    continue;
                }

                println!("[DEBUG] java.exe found, testing...");
                let test_output = Command::new(&java_exe)
                    .arg("-version")
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();

                match test_output {
                    Ok(output) => {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        println!("[DEBUG] Java version output: {}", stderr.trim());
                        if output.status.success() {
                            progress_callback(
                                0.04,
                                format!("Java {} installed successfully!", java_version),
                            );
                            println!(
                                "[INFO] Java {} installed to: {}",
                                java_version,
                                runtime_dir.display()
                            );
                            return Ok(());
                        } else {
                            last_error = format!("Java test failed: {}", stderr.trim());
                            println!("[WARN] Java test failed: {}", stderr);
                        }
                    }
                    Err(e) => {
                        last_error = format!("Failed to run java.exe: {}", e);
                        println!("[WARN] Failed to run java.exe: {}", e);
                    }
                }

                println!("[WARN] Java verification failed, retrying...");
            }

            return Err(format!(
                "Failed to install Java {} after 3 attempts: {}",
                java_version, last_error
            ));
        }

        #[cfg(target_os = "macos")]
        {
            // Try Homebrew first for Java 17 and 21
            if java_version >= 17 {
                if let Ok(output) = Command::new("brew").args(["--version"]).output() {
                    if output.status.success() {
                        progress_callback(
                            0.02,
                            format!("Installing Java {} via Homebrew...", java_version),
                        );

                        let status = Command::new("brew")
                            .args(["install", &format!("openjdk@{}", java_version)])
                            .status()
                            .map_err(|e| e.to_string())?;

                        if status.success() {
                            return Ok(());
                        }
                    }
                }
            }

            // Fallback: Download tar.gz
            progress_callback(0.02, format!("Downloading Java {}...", java_version));

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?;

            let download_url = if cfg!(target_arch = "aarch64") {
                mac_url_arm
            } else {
                mac_url_x64
            };

            let response = client
                .get(download_url)
                .send()
                .await
                .map_err(|e| format!("Failed to download Java: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Download failed: {}", response.status()));
            }

            progress_callback(0.03, "Extracting Java...".to_string());

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let temp_dir = std::env::temp_dir();
            let tar_path = temp_dir.join(format!("java{}.tar.gz", java_version));
            std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

            // For Zulu JDK (Java 8 ARM), we need different extraction
            let strip_components = if java_version == 8 && cfg!(target_arch = "aarch64") {
                // Zulu has structure: zulu8.../zulu-8.jdk/Contents/Home/...
                // We want to extract Contents/Home/* to runtime_dir
                "3"
            } else {
                "1"
            };

            let status = Command::new("tar")
                .args([
                    "-xzf",
                    tar_path.to_str().unwrap(),
                    "-C",
                    runtime_dir.to_str().unwrap(),
                    &format!("--strip-components={}", strip_components),
                ])
                .status()
                .map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&tar_path);

            if !status.success() {
                return Err("Failed to extract Java".to_string());
            }

            // For Zulu Java 8, the structure might be different - check and fix
            if java_version == 8 {
                let contents_home = runtime_dir.join("Contents").join("Home");
                if contents_home.exists() {
                    // Move Contents/Home/* to runtime_dir
                    if let Ok(entries) = std::fs::read_dir(&contents_home) {
                        for entry in entries.flatten() {
                            let dest = runtime_dir.join(entry.file_name());
                            let _ = std::fs::rename(entry.path(), dest);
                        }
                    }
                    let _ = std::fs::remove_dir_all(runtime_dir.join("Contents"));
                }
            }

            progress_callback(0.04, format!("Java {} installed!", java_version));
        }

        #[cfg(target_os = "linux")]
        {
            progress_callback(0.02, format!("Downloading Java {}...", java_version));

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?;

            let response = client
                .get(linux_url)
                .send()
                .await
                .map_err(|e| format!("Failed to download Java: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Download failed: {}", response.status()));
            }

            progress_callback(0.03, "Extracting Java...".to_string());

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let temp_dir = std::env::temp_dir();
            let tar_path = temp_dir.join(format!("java{}.tar.gz", java_version));
            std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

            let status = Command::new("tar")
                .args([
                    "-xzf",
                    tar_path.to_str().unwrap(),
                    "-C",
                    runtime_dir.to_str().unwrap(),
                    "--strip-components=1",
                ])
                .status()
                .map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&tar_path);

            if !status.success() {
                return Err("Failed to extract Java".to_string());
            }

            progress_callback(0.04, format!("Java {} installed!", java_version));
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    async fn install_macos_java8_x64<F>(&self, progress_callback: &F) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        if let Some(existing) =
            self.get_bundled_java_path_version_with_arch(8, Some(JavaArchitecture::X86_64))
        {
            progress_callback(
                0.04,
                format!("Java 8 x64 already installed at {}", existing.display()),
            );
            return Ok(());
        }

        let runtime_dir = self.game_dir.join("runtime").join("java-8-x64");
        let _ = std::fs::remove_dir_all(&runtime_dir);
        std::fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;

        progress_callback(
            0.02,
            "Downloading Java 8 x64 for Apple Silicon legacy compatibility...".to_string(),
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| e.to_string())?;

        let download_url = "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-jdk_x64_mac_hotspot_8u432b06.tar.gz";
        let response = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download x64 Java 8: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "x64 Java 8 download failed with status {}",
                response.status()
            ));
        }

        progress_callback(0.03, "Extracting Java 8 x64...".to_string());

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let tar_path = std::env::temp_dir().join("java8-x64.tar.gz");
        std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

        let status = Command::new("tar")
            .args([
                "-xzf",
                tar_path.to_str().unwrap(),
                "-C",
                runtime_dir.to_str().unwrap(),
                "--strip-components=1",
            ])
            .status()
            .map_err(|e| e.to_string())?;

        let _ = std::fs::remove_file(&tar_path);

        if !status.success() {
            return Err("Failed to extract x64 Java 8".to_string());
        }

        let Some(installed_java) =
            self.get_bundled_java_path_version_with_arch(8, Some(JavaArchitecture::X86_64))
        else {
            return Err("Installed x64 Java 8 but could not find the java binary".to_string());
        };

        progress_callback(
            0.04,
            format!("Java 8 x64 installed at {}", installed_java.display()),
        );

        Ok(())
    }

    #[cfg(target_os = "macos")]
    async fn install_macos_java_x64<F>(
        &self,
        java_version: u8,
        progress_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        if java_version == 8 {
            return self.install_macos_java8_x64(progress_callback).await;
        }

        if let Some(existing) = self
            .get_bundled_java_path_version_with_arch(java_version, Some(JavaArchitecture::X86_64))
        {
            progress_callback(
                0.04,
                format!(
                    "Java {} x64 already installed at {}",
                    java_version,
                    existing.display()
                ),
            );
            return Ok(());
        }

        let runtime_dir = self
            .game_dir
            .join("runtime")
            .join(format!("java-{}-x64", java_version));
        let _ = std::fs::remove_dir_all(&runtime_dir);
        std::fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;

        progress_callback(
            0.02,
            format!(
                "Downloading Java {} x64 for Apple Silicon native-mod compatibility...",
                java_version
            ),
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| e.to_string())?;

        let download_url = format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/mac/x64/jdk/hotspot/normal/eclipse",
            java_version
        );
        let response = client
            .get(&download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download x64 Java {}: {}", java_version, e))?;

        if !response.status().is_success() {
            return Err(format!(
                "x64 Java {} download failed with status {}",
                java_version,
                response.status()
            ));
        }

        progress_callback(0.03, format!("Extracting Java {} x64...", java_version));

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let tar_path = std::env::temp_dir().join(format!("java{}-x64.tar.gz", java_version));
        std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

        let status = Command::new("tar")
            .args([
                "-xzf",
                tar_path.to_str().unwrap(),
                "-C",
                runtime_dir.to_str().unwrap(),
                "--strip-components=1",
            ])
            .status()
            .map_err(|e| e.to_string())?;

        let _ = std::fs::remove_file(&tar_path);

        if !status.success() {
            return Err(format!("Failed to extract x64 Java {}", java_version));
        }

        let Some(installed_java) = self
            .get_bundled_java_path_version_with_arch(java_version, Some(JavaArchitecture::X86_64))
        else {
            return Err(format!(
                "Installed x64 Java {} but could not find the java binary",
                java_version
            ));
        };

        progress_callback(
            0.04,
            format!(
                "Java {} x64 installed at {}",
                java_version,
                installed_java.display()
            ),
        );

        Ok(())
    }

    async fn install_preferred_java_version<F>(
        &self,
        version_id: &str,
        java_version: u8,
        progress_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        if matches!(
            self.preferred_java_arch_for_launch_version(version_id),
            Some(JavaArchitecture::X86_64)
        ) {
            return self
                .install_macos_java_x64(java_version, progress_callback)
                .await;
        }

        self.install_java_version(java_version, progress_callback)
            .await
    }

    pub async fn install_version<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Determine required Java version based on Minecraft version
        let java_version = Self::get_required_java_version(version_id);

        progress_callback(
            0.0,
            format!("Checking Java {} installation...", java_version).to_string(),
        );

        if !self.check_java_installed_version(java_version) {
            progress_callback(
                0.01,
                format!("Java {} not found, downloading...", java_version).to_string(),
            );
            match self
                .install_preferred_java_version(version_id, java_version, &progress_callback)
                .await
            {
                Ok(_) => {
                    progress_callback(
                        0.05,
                        format!("Java {} installed successfully", java_version).to_string(),
                    );
                }
                Err(e) => {
                    println!(
                        "[WARN] Could not auto-install Java {}: {}. Continuing anyway...",
                        java_version, e
                    );
                    progress_callback(0.05, "Continuing without Java auto-install...".to_string());
                }
            }
        }

        progress_callback(0.05, "Fetching version info...".to_string());

        // Get version details URL
        let versions = self.get_versions().await?;
        let version_info = versions
            .iter()
            .find(|v| v.id == version_id)
            .ok_or("Version not found")?;

        progress_callback(0.1, "Downloading version manifest...".to_string());

        // Download version JSON
        let client = reqwest::Client::new();
        let version_json: serde_json::Value = client
            .get(&version_info.url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        // Some snapshots/future versions can require newer Java than the baseline rule.
        let mut required_install_java = java_version;
        if let Some(manifest_java) = version_json
            .get("javaVersion")
            .and_then(|v| v.get("majorVersion"))
            .and_then(|v| v.as_u64())
        {
            let manifest_java = manifest_java as u8;
            if manifest_java > required_install_java {
                required_install_java = manifest_java;
            }
        }

        if required_install_java > java_version {
            progress_callback(
                0.07,
                format!(
                    "Version requires Java {}, checking installation...",
                    required_install_java
                ),
            );

            let preferred_arch = Self::preferred_java_arch_for_version(version_id);
            let has_required_java = self
                .find_java_for_required_version(required_install_java, preferred_arch)
                .is_some();

            if !has_required_java {
                progress_callback(
                    0.08,
                    format!("Java {} not found, downloading...", required_install_java),
                );
                match self
                    .install_preferred_java_version(
                        version_id,
                        required_install_java,
                        &progress_callback,
                    )
                    .await
                {
                    Ok(_) => {
                        progress_callback(
                            0.09,
                            format!("Java {} installed successfully", required_install_java),
                        );
                    }
                    Err(e) => {
                        println!(
                            "[WARN] Could not auto-install Java {}: {}. Continuing anyway...",
                            required_install_java, e
                        );
                        progress_callback(
                            0.09,
                            "Continuing without Java auto-install...".to_string(),
                        );
                    }
                }
            }
        }

        // Create version directory
        let version_dir = self.versions_dir.join(version_id);
        std::fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;

        // Save version JSON
        let json_path = version_dir.join(format!("{}.json", version_id));
        let json_str = serde_json::to_string_pretty(&version_json).map_err(|e| e.to_string())?;
        std::fs::write(&json_path, json_str).map_err(|e| e.to_string())?;

        progress_callback(0.2, "Downloading client JAR...".to_string());

        // Download client JAR
        let client_url = version_json["downloads"]["client"]["url"]
            .as_str()
            .ok_or("Could not find client download URL")?;

        let jar_path = version_dir.join(format!("{}.jar", version_id));
        self.download_file(client_url, &jar_path).await?;

        progress_callback(0.4, "Downloading libraries (parallel)...".to_string());

        // Create natives directory for this version
        let version_natives_dir = self.natives_dir.join(version_id);
        std::fs::create_dir_all(&version_natives_dir).map_err(|e| e.to_string())?;

        // Download libraries in parallel
        if let Some(libraries) = version_json["libraries"].as_array() {
            let lib_refs: Vec<&serde_json::Value> = libraries.iter().collect();
            let libraries_dir = self.libraries_dir.clone();

            downloader::download_libraries_parallel(
                &lib_refs,
                &libraries_dir,
                &progress_callback,
                0.4,
                0.35,
            )
            .await;

            // Download and extract natives (still sequential as extraction needs to happen after download)
            progress_callback(0.75, "Extracting native libraries...".to_string());

            #[cfg(target_os = "windows")]
            let current_os = "windows";
            #[cfg(target_os = "macos")]
            let current_os = "osx";
            #[cfg(target_os = "linux")]
            let current_os = "linux";

            for lib in libraries.iter() {
                // Check rules
                let mut allowed = true;
                if let Some(rules) = lib.get("rules") {
                    if let Some(rules_arr) = rules.as_array() {
                        allowed = false;
                        for rule in rules_arr {
                            let action = rule["action"].as_str().unwrap_or("allow");
                            if let Some(os) = rule.get("os") {
                                if let Some(name) = os["name"].as_str() {
                                    if name == current_os && action == "allow" {
                                        allowed = true;
                                    } else if name == current_os && action == "disallow" {
                                        allowed = false;
                                        break;
                                    }
                                }
                            } else if action == "allow" {
                                allowed = true;
                            }
                        }
                    }
                }

                if !allowed {
                    continue;
                }

                if let Some(downloads) = lib.get("downloads") {
                    // NEW FORMAT (1.21.5+): Natives are in "artifact" with OS-specific rules
                    // Check if this is a native library by looking at the library name
                    let lib_name = lib["name"].as_str().unwrap_or("");
                    let is_native_lib = lib_name.contains("natives-");

                    if is_native_lib {
                        // Filter by architecture for macOS (ARM64 vs x86_64)
                        // Only filter LWJGL libraries that have ARM64 variants
                        // Other libraries (like jtracy) only have x86_64 and should be used via Rosetta
                        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
                        let should_use = {
                            // On ARM64 macOS: for LWJGL, prefer natives-macos-arm64, skip natives-macos (x86_64)
                            // For non-LWJGL (like jtracy), use whatever is available
                            let is_lwjgl = lib_name.contains("org.lwjgl");
                            if is_lwjgl {
                                if lib_name.contains("natives-macos-arm64") {
                                    true
                                } else if lib_name.contains("natives-macos") {
                                    // Skip ALL x86_64 LWJGL natives on ARM64 (including -patch variants)
                                    false
                                } else {
                                    true
                                }
                            } else {
                                true // Non-LWJGL libraries (like jtracy) - use whatever is available
                            }
                        };
                        #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
                        let should_use = {
                            // On x86_64 macOS: prefer natives-macos, skip natives-macos-arm64
                            if lib_name.contains("natives-macos-arm64") {
                                false // Skip ARM64 natives on x86_64
                            } else {
                                true
                            }
                        };
                        #[cfg(not(target_os = "macos"))]
                        let should_use = true;

                        if should_use {
                            if let Some(artifact) = downloads.get("artifact") {
                                if let Some(url) = artifact["url"].as_str() {
                                    // Extract a safe filename from the path
                                    let path = artifact["path"].as_str().unwrap_or("");
                                    let jar_name = std::path::Path::new(path)
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| format!("{}-native.jar", version_id));
                                    let native_jar_path = self.natives_dir.join(&jar_name);

                                    let needs_download = !native_jar_path.exists()
                                        || !Self::is_valid_jar_static(&native_jar_path);
                                    if needs_download {
                                        let _ = std::fs::remove_file(&native_jar_path);
                                        let _ = self.download_file(url, &native_jar_path).await;
                                    }

                                    // Extract natives from the jar
                                    if native_jar_path.exists()
                                        && Self::is_valid_jar_static(&native_jar_path)
                                    {
                                        if let Ok(file) = std::fs::File::open(&native_jar_path) {
                                            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                                                for j in 0..archive.len() {
                                                    if let Ok(mut entry) = archive.by_index(j) {
                                                        let name = entry.name().to_string();
                                                        let is_native =
                                                            Self::is_platform_native_file(&name);

                                                        if is_native {
                                                            let file_name =
                                                                std::path::Path::new(&name)
                                                                    .file_name()
                                                                    .unwrap_or_default()
                                                                    .to_string_lossy()
                                                                    .to_string();
                                                            let out_path = version_natives_dir
                                                                .join(&file_name);
                                                            // Always overwrite to ensure correct architecture
                                                            if let Ok(mut out_file) =
                                                                std::fs::File::create(&out_path)
                                                            {
                                                                let _ = std::io::copy(
                                                                    &mut entry,
                                                                    &mut out_file,
                                                                );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // OLD FORMAT: Natives are in "classifiers"
                    if let Some(classifiers) = downloads.get("classifiers") {
                        #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-windows-arm64",
                            "natives-windows",
                            "natives-windows-64",
                            "natives-windows-x86_64",
                        ];
                        #[cfg(all(target_os = "windows", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-windows",
                            "natives-windows-64",
                            "natives-windows-x86_64",
                            "natives-windows-arm64",
                        ];
                        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-macos-arm64",
                            "natives-osx-arm64",
                            "natives-macos",
                            "natives-osx",
                        ];
                        #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-macos",
                            "natives-osx",
                            "natives-macos-arm64",
                            "natives-osx-arm64",
                        ];
                        #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-linux-arm64",
                            "natives-linux-aarch64",
                            "natives-linux",
                            "natives-linux-64",
                            "natives-linux-x86_64",
                        ];
                        #[cfg(all(target_os = "linux", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-linux",
                            "natives-linux-64",
                            "natives-linux-x86_64",
                            "natives-linux-arm64",
                            "natives-linux-aarch64",
                        ];

                        for native_key in native_keys {
                            if let Some(native) = classifiers.get(native_key) {
                                if let Some(url) = native["url"].as_str() {
                                    let native_jar_path = self.native_archive_cache_path(
                                        native,
                                        format!("{}-{}.jar", version_id, native_key),
                                    );

                                    let needs_download = !native_jar_path.exists()
                                        || !Self::is_valid_jar_static(&native_jar_path);
                                    if needs_download {
                                        let _ = std::fs::remove_file(&native_jar_path);
                                        let _ = self.download_file(url, &native_jar_path).await;
                                    }

                                    if native_jar_path.exists()
                                        && Self::is_valid_jar_static(&native_jar_path)
                                    {
                                        if let Ok(file) = std::fs::File::open(&native_jar_path) {
                                            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                                                for j in 0..archive.len() {
                                                    if let Ok(mut entry) = archive.by_index(j) {
                                                        let name = entry.name().to_string();
                                                        let is_native =
                                                            Self::is_platform_native_file(&name);

                                                        if is_native {
                                                            let file_name =
                                                                std::path::Path::new(&name)
                                                                    .file_name()
                                                                    .unwrap_or_default()
                                                                    .to_string_lossy()
                                                                    .to_string();
                                                            let out_path = version_natives_dir
                                                                .join(&file_name);
                                                            if let Ok(mut out_file) =
                                                                std::fs::File::create(&out_path)
                                                            {
                                                                let _ = std::io::copy(
                                                                    &mut entry,
                                                                    &mut out_file,
                                                                );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        progress_callback(0.8, "Downloading assets (parallel)...".to_string());

        // Download asset index
        if let Some(asset_index) = version_json.get("assetIndex") {
            if let (Some(url), Some(id)) = (asset_index["url"].as_str(), asset_index["id"].as_str())
            {
                let index_dir = self.assets_dir.join("indexes");
                std::fs::create_dir_all(&index_dir).map_err(|e| e.to_string())?;

                let index_path = index_dir.join(format!("{}.json", id));
                self.download_file(url, &index_path).await?;

                progress_callback(
                    0.82,
                    "Downloading game assets (parallel - much faster!)...".to_string(),
                );

                if let Ok(index_content) = std::fs::read_to_string(&index_path) {
                    if let Ok(index_json) =
                        serde_json::from_str::<serde_json::Value>(&index_content)
                    {
                        if let Some(objects) = index_json["objects"].as_object() {
                            let objects_dir = self.assets_dir.join("objects");
                            std::fs::create_dir_all(&objects_dir).map_err(|e| e.to_string())?;

                            let (downloaded, failed) = downloader::download_assets_parallel(
                                objects,
                                &objects_dir,
                                &progress_callback,
                                0.82,
                                0.18,
                            )
                            .await;

                            if failed > 0 {
                                eprintln!("Warning: {} assets failed to download", failed);
                            }
                            println!(
                                "Downloaded {} new assets, {} failed (parallel)",
                                downloaded, failed
                            );
                        }
                    }
                }
            }
        }

        progress_callback(1.0, "Installation complete!".to_string());
        Ok(())
    }

    /// Ensure all libraries exist for a version, downloading missing ones
    async fn ensure_libraries_exist<F>(
        &self,
        version_json: &serde_json::Value,
        parent_json: Option<&serde_json::Value>,
        intermediate_json: Option<&serde_json::Value>,
        log_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(String) + Send + Sync,
    {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        // Collect all libraries from version, intermediate parent (Fabric), and parent (vanilla)
        let mut all_libraries: Vec<&serde_json::Value> = Vec::new();

        if let Some(libs) = version_json["libraries"].as_array() {
            log_callback(format!("[DEBUG] Version JSON has {} libraries", libs.len()));
            all_libraries.extend(libs.iter());
        }
        // Add intermediate parent libraries (e.g., Fabric loader for Lapetus)
        if let Some(intermediate) = intermediate_json {
            if let Some(libs) = intermediate["libraries"].as_array() {
                log_callback(format!(
                    "[DEBUG] Intermediate parent has {} libraries",
                    libs.len()
                ));
                all_libraries.extend(libs.iter());
            }
        }
        if let Some(parent) = parent_json {
            if let Some(libs) = parent["libraries"].as_array() {
                log_callback(format!(
                    "[DEBUG] Parent (vanilla) has {} libraries",
                    libs.len()
                ));
                all_libraries.extend(libs.iter());
            }
        }

        log_callback(format!(
            "[DEBUG] Total libraries to check: {}",
            all_libraries.len()
        ));

        let mut missing_count = 0;
        let mut downloaded_count = 0;
        let mut failed_downloads: Vec<String> = Vec::new();
        let strict_library_verify = std::env::var("LAPETUS_STRICT_LIBRARY_VERIFY")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        // Helper function to validate JAR file
        let is_valid_jar = |path: &PathBuf| -> bool {
            if !path.exists() {
                return false;
            }
            // Check minimum file size (valid JARs are at least a few KB)
            if let Ok(metadata) = std::fs::metadata(path) {
                if metadata.len() < 100 {
                    return false;
                }
                // Fast path: for normal launches, trust non-trivial existing JARs
                // and avoid opening every ZIP on every launch.
                if !strict_library_verify && metadata.len() > 4096 {
                    return true;
                }
            }
            // Try to open as ZIP to validate structure
            match std::fs::File::open(path) {
                Ok(file) => match zip::ZipArchive::new(file) {
                    Ok(_) => true,
                    Err(_) => {
                        println!("[WARN] Corrupted JAR detected: {:?}", path);
                        false
                    }
                },
                Err(_) => false,
            }
        };

        for lib in all_libraries {
            // Try new format first (downloads.artifact)
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                if let (Some(url), Some(path)) =
                    (artifact["url"].as_str(), artifact["path"].as_str())
                {
                    // Convert forward slashes to platform-specific path separators
                    let normalized_path = path.replace('/', std::path::MAIN_SEPARATOR_STR);
                    let lib_path = self.libraries_dir.join(&normalized_path);

                    // Check if file exists AND is valid (not corrupted)
                    let needs_download = !lib_path.exists() || !is_valid_jar(&lib_path);

                    if needs_download {
                        // Remove corrupted file if it exists
                        if lib_path.exists() {
                            log_callback(format!(
                                "[INFO] Removing corrupted library: {}...",
                                path.split('/').last().unwrap_or(path)
                            ));
                            std::fs::remove_file(&lib_path).ok();
                        }

                        missing_count += 1;
                        if let Some(parent) = lib_path.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }

                        // Log critical libraries
                        let is_critical = path.contains("logging")
                            || path.contains("log4j")
                            || path.contains("slf4j")
                            || path.contains("icu4j");
                        if is_critical {
                            log_callback(format!(
                                "[INFO] Downloading critical library: {}...",
                                path.split('/').last().unwrap_or(path)
                            ));
                        }

                        match client.get(url).send().await {
                            Ok(response) if response.status().is_success() => {
                                if let Ok(bytes) = response.bytes().await {
                                    if std::fs::write(&lib_path, &bytes).is_ok() {
                                        // Validate the downloaded file
                                        if is_valid_jar(&lib_path) {
                                            downloaded_count += 1;
                                        } else {
                                            log_callback(format!(
                                                "[WARN] Downloaded file is corrupted, retrying: {}",
                                                path
                                            ));
                                            std::fs::remove_file(&lib_path).ok();
                                            failed_downloads.push(path.to_string());
                                        }
                                    } else {
                                        failed_downloads.push(path.to_string());
                                    }
                                }
                            }
                            Ok(response) => {
                                println!(
                                    "[WARN] Failed to download {} - HTTP {}",
                                    url,
                                    response.status()
                                );
                                failed_downloads.push(path.to_string());
                            }
                            Err(e) => {
                                println!("[WARN] Failed to download {}: {}", url, e);
                                failed_downloads.push(path.to_string());
                            }
                        }
                    }
                }
            }
            // Old format: just "name" field with Maven coordinates (Fabric uses this)
            else if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                let parts: Vec<&str> = name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let artifact = parts[1];
                    let version = parts[2];
                    let classifier = parts.get(3).map(|s| *s);

                    let jar_name = if let Some(cls) = classifier {
                        format!("{}-{}-{}.jar", artifact, version, cls)
                    } else {
                        format!("{}-{}.jar", artifact, version)
                    };

                    let lib_path = self
                        .libraries_dir
                        .join(&group)
                        .join(artifact)
                        .join(version)
                        .join(&jar_name);

                    // Check if file exists AND is valid (not corrupted)
                    let needs_download = !lib_path.exists() || !is_valid_jar(&lib_path);

                    if needs_download {
                        // Remove corrupted file if it exists
                        if lib_path.exists() {
                            log_callback(format!(
                                "[INFO] Removing corrupted library: {}...",
                                jar_name
                            ));
                            std::fs::remove_file(&lib_path).ok();
                        }

                        missing_count += 1;
                        if let Some(parent) = lib_path.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }

                        // Get base URL from library or use defaults
                        let base_url = lib.get("url").and_then(|u| u.as_str()).unwrap_or("");

                        // Try multiple Maven repositories
                        let urls_to_try = vec![
                            format!(
                                "{}{}/{}/{}/{}",
                                base_url, group, artifact, version, jar_name
                            ),
                            format!(
                                "https://maven.fabricmc.net/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                            format!(
                                "https://libraries.minecraft.net/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                            format!(
                                "https://maven.minecraftforge.net/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                        ];

                        log_callback(format!(
                            "[INFO] Downloading missing library: {}...",
                            jar_name
                        ));

                        let mut downloaded = false;
                        for url in urls_to_try {
                            if url.starts_with("http") {
                                match client.get(&url).send().await {
                                    Ok(response) if response.status().is_success() => {
                                        if let Ok(bytes) = response.bytes().await {
                                            if std::fs::write(&lib_path, &bytes).is_ok() {
                                                // Validate the downloaded file
                                                if is_valid_jar(&lib_path) {
                                                    downloaded = true;
                                                    downloaded_count += 1;
                                                    break;
                                                } else {
                                                    log_callback(format!(
                                                        "[WARN] Downloaded file is corrupted: {}",
                                                        jar_name
                                                    ));
                                                    std::fs::remove_file(&lib_path).ok();
                                                }
                                            }
                                        }
                                    }
                                    _ => continue,
                                }
                            }
                        }

                        if !downloaded {
                            println!("[WARN] Could not download library: {}", name);
                        }
                    }
                }
            }
        }

        if missing_count > 0 {
            log_callback(format!(
                "[INFO] Downloaded {}/{} missing libraries",
                downloaded_count, missing_count
            ));
            if !failed_downloads.is_empty() {
                log_callback(format!(
                    "[WARN] Failed to download {} libraries",
                    failed_downloads.len()
                ));
                // Log critical failures
                for path in &failed_downloads {
                    if path.contains("logging")
                        || path.contains("log4j")
                        || path.contains("slf4j")
                        || path.contains("icu4j")
                    {
                        log_callback(format!("[ERROR] Critical library missing: {}", path));
                    }
                }
            }
        }

        Ok(())
    }

    async fn download_file(&self, url: &str, path: &PathBuf) -> Result<(), String> {
        let client = downloader::create_client();
        downloader::download_file_with_client(&client, url, path).await
    }

    pub async fn launch<F>(&self, options: &LaunchOptions, log_callback: F) -> Result<(), String>
    where
        F: Fn(String) + Send + Sync + Clone + 'static,
    {
        println!(
            "[Launch] Starting launch for version: {}",
            options.version_id
        );
        println!("[Launch] Username: {}", options.username);
        println!("[Launch] Tier: {:?}", options.tier);

        // For Lapetus versions, ensure the mod and Fabric API are installed in the instance mods directory
        if options.version_id.starts_with("lapetus-") {
            log_callback("[INFO] Checking Lapetus installation...".to_string());

            // Use instances directory for version isolation
            let instance_dir = self.game_dir.join("instances").join(&options.version_id);
            let mods_dir = instance_dir.join("mods");
            let lapetus_mod_path = mods_dir.join("lapetus-client-latest.jar");

            // Create mods directory
            std::fs::create_dir_all(&mods_dir)
                .map_err(|e| format!("Failed to create mods directory: {}", e))?;

            let client = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(4))
                .timeout(std::time::Duration::from_secs(25))
                .redirect(reqwest::redirect::Policy::limited(10))
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

            // Check if Lapetus mod exists and is valid (> 100KB)
            let mod_valid = if lapetus_mod_path.exists() {
                std::fs::metadata(&lapetus_mod_path)
                    .map(|m| m.len() > 100000)
                    .unwrap_or(false)
            } else {
                false
            };

            // Check for mod updates from GitHub (version.txt)
            let mut needs_update = false;
            let update_check_file = mods_dir.join(".trapgaint-version-check-at");
            let now_unix = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            let last_check_unix = std::fs::read_to_string(&update_check_file)
                .ok()
                .and_then(|value| value.trim().parse::<u64>().ok())
                .unwrap_or(0);
            let should_check_remote_update =
                now_unix.saturating_sub(last_check_unix) >= 6 * 60 * 60;
            if mod_valid {
                if should_check_remote_update {
                    log_callback("[INFO] Checking for mod updates...".to_string());
                    std::fs::write(&update_check_file, now_unix.to_string()).ok();

                    // Check remote version
                    match client
                        .get("https://raw.githubusercontent.com/dhhd67807-lgtm/dragon-client-mod/main/version.txt")
                        .header("User-Agent", "Lapetus-Launcher/1.0")
                        .header("Cache-Control", "no-cache")
                        .send()
                        .await
                    {
                        Ok(response) if response.status().is_success() => {
                            if let Ok(remote_version) = response.text().await {
                                let remote_version = remote_version.trim();

                                // Check local version
                                let version_file = mods_dir.join(".trapgaint-version");
                                let local_version = std::fs::read_to_string(&version_file)
                                    .unwrap_or_default()
                                    .trim()
                                    .to_string();

                                if local_version.is_empty() || local_version != remote_version {
                                    log_callback(format!("[INFO] New mod version available: {} (current: {})", remote_version, if local_version.is_empty() { "unknown" } else { &local_version }));
                                    needs_update = true;

                                    // Save new version for next check
                                    std::fs::write(&version_file, remote_version).ok();
                                } else {
                                    log_callback("[INFO] Mod is up to date!".to_string());
                                }
                            }
                        }
                        Ok(response) => {
                            log_callback(format!(
                                "[WARN] Could not check for updates (HTTP {})",
                                response.status()
                            ));
                        }
                        Err(error) => {
                            log_callback(format!(
                                "[WARN] Could not check for updates quickly: {}",
                                error
                            ));
                        }
                    }
                } else {
                    log_callback(
                        "[INFO] Skipping remote mod update check (checked recently)".to_string(),
                    );
                }
            }

            if !mod_valid || needs_update {
                if needs_update {
                    log_callback("[INFO] Updating Lapetus mod to latest version...".to_string());
                } else {
                    log_callback("[INFO] Installing Lapetus mod...".to_string());
                }

                // Try to copy from bundled resources first (faster and works offline)
                let bundled_paths = [
                    // Production: inside app bundle
                    std::env::current_exe().ok().and_then(|p| {
                        p.parent()
                            .map(|p| p.join("../Resources/lapetus-client-latest.jar"))
                    }),
                    // Dev mode: in src-tauri/resources
                    Some(std::path::PathBuf::from(
                        "resources/lapetus-client-latest.jar",
                    )),
                    Some(std::path::PathBuf::from(
                        "src-tauri/resources/lapetus-client-latest.jar",
                    )),
                ];

                let mut installed_from_bundle = false;
                for bundled_path in bundled_paths.iter().flatten() {
                    if bundled_path.exists() {
                        log_callback(format!("[INFO] Copying mod from bundled resources..."));
                        if let Ok(bytes) = std::fs::read(bundled_path) {
                            if bytes.len() > 50000 {
                                // Remove old mod files first
                                if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                                    for entry in entries.flatten() {
                                        let name =
                                            entry.file_name().to_string_lossy().to_lowercase();
                                        if name.starts_with("lapetus-client")
                                            && name.ends_with(".jar")
                                        {
                                            std::fs::remove_file(entry.path()).ok();
                                        }
                                    }
                                }

                                if std::fs::write(&lapetus_mod_path, &bytes).is_ok() {
                                    log_callback(
                                        "[INFO] Lapetus mod installed from bundle!".to_string(),
                                    );
                                    installed_from_bundle = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                // If bundled mod not found or failed, download from GitHub
                let mut downloaded = installed_from_bundle;
                if !installed_from_bundle {
                    log_callback("[INFO] Downloading Lapetus mod from GitHub...".to_string());

                    // Download the Lapetus mod from GitHub releases
                    let download_urls = [
                        "https://github.com/dhhd67807-lgtm/dragon-client-mod/releases/latest/download/lapetus-client-latest.jar",
                    ];

                    for url in download_urls {
                        log_callback(format!("[INFO] Downloading from mod-dist..."));

                        match client
                            .get(url)
                            .header("User-Agent", "Lapetus-Launcher/1.0")
                            .header("Accept", "application/octet-stream")
                            .header("Cache-Control", "no-cache")
                            .send()
                            .await
                        {
                            Ok(response) if response.status().is_success() => {
                                let is_html = response
                                    .headers()
                                    .get("content-type")
                                    .and_then(|ct| ct.to_str().ok())
                                    .map(|ct| ct.contains("text/html"))
                                    .unwrap_or(false);

                                if is_html {
                                    continue;
                                }

                                if let Ok(bytes) = response.bytes().await {
                                    if bytes.len() > 50000
                                        && bytes.len() >= 4
                                        && &bytes[0..4] == [0x50, 0x4B, 0x03, 0x04]
                                    {
                                        // Remove old mod files first
                                        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                                            for entry in entries.flatten() {
                                                let name = entry
                                                    .file_name()
                                                    .to_string_lossy()
                                                    .to_lowercase();
                                                if name.starts_with("lapetus-client")
                                                    && name.ends_with(".jar")
                                                {
                                                    std::fs::remove_file(entry.path()).ok();
                                                }
                                            }
                                        }

                                        if std::fs::write(&lapetus_mod_path, &bytes).is_ok() {
                                            log_callback(
                                                "[INFO] Lapetus mod downloaded!".to_string(),
                                            );
                                            downloaded = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            _ => continue,
                        }
                    }
                }

                if !downloaded {
                    return Err(
                        "Failed to download Lapetus mod. Please check your internet connection."
                            .to_string(),
                    );
                }
            } else {
                log_callback("[INFO] Lapetus mod found!".to_string());
            }

            // Check if Fabric API exists (look for any fabric-api jar)
            let fabric_api_exists = mods_dir
                .read_dir()
                .map(|entries| {
                    entries.flatten().any(|e| {
                        let name = e.file_name().to_string_lossy().to_lowercase();
                        (name.contains("fabric-api") || name.contains("fabric_api"))
                            && name.ends_with(".jar")
                    })
                })
                .unwrap_or(false);

            if !fabric_api_exists {
                log_callback("[INFO] Downloading Fabric API...".to_string());

                // Download Fabric API from Modrinth (most reliable)
                // Fabric API 0.92.2 for 1.20.1
                let fabric_api_url = "https://cdn.modrinth.com/data/P7dR8mSH/versions/P7uGFii0/fabric-api-0.92.2%2B1.20.1.jar";
                let fabric_api_path = mods_dir.join("fabric-api-0.92.2+1.20.1.jar");

                match client
                    .get(fabric_api_url)
                    .header("User-Agent", "Lapetus-Launcher/1.0")
                    .send()
                    .await
                {
                    Ok(response) if response.status().is_success() => {
                        if let Ok(bytes) = response.bytes().await {
                            if bytes.len() > 100000
                                && bytes.len() >= 4
                                && &bytes[0..4] == [0x50, 0x4B, 0x03, 0x04]
                            {
                                if std::fs::write(&fabric_api_path, &bytes).is_ok() {
                                    log_callback("[INFO] Fabric API downloaded!".to_string());
                                } else {
                                    return Err("Failed to save Fabric API.".to_string());
                                }
                            } else {
                                return Err("Downloaded Fabric API is invalid.".to_string());
                            }
                        }
                    }
                    Ok(response) => {
                        return Err(format!(
                            "Failed to download Fabric API: HTTP {}",
                            response.status()
                        ));
                    }
                    Err(e) => {
                        return Err(format!("Failed to download Fabric API: {}", e));
                    }
                }
            } else {
                log_callback("[INFO] Fabric API found!".to_string());
            }

            // Check if performance mods are installed (check for Sodium as indicator)
            let has_performance_mods = std::fs::read_dir(&mods_dir)
                .map(|entries| {
                    entries.filter_map(|e| e.ok()).any(|entry| {
                        let name = entry.file_name().to_string_lossy().to_lowercase();
                        name.contains("sodium") || name.contains("lithium")
                    })
                })
                .unwrap_or(false);

            if has_performance_mods {
                log_callback("[INFO] Performance mods found!".to_string());
            } else {
                log_callback("[WARN] Performance mods not found. Please reinstall Lapetus for optimal performance.".to_string());
            }

            // Remove ONLY incompatible mods that cause crashes
            // User's custom mods are NEVER touched - only these specific problematic mods are removed
            // yosbr causes ClassNotFoundException for log4j.LogManager during pre-launch
            // memoryleakfix causes compatibility issues with Fabric Loader
            // controlify conflicts with Lapetus custom title screen
            // c2me, immediatelyfast, krypton, clumps cause various conflicts
            let incompatible_mods = [
                "yosbr",
                "memoryleakfix",
                "controlify",
                "c2me",
                "immediatelyfast",
                "krypton",
                "clumps",
            ];
            for mod_name in incompatible_mods {
                if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                    for entry in entries.flatten() {
                        let filename = entry.file_name().to_string_lossy().to_lowercase();
                        if filename.contains(mod_name) && filename.ends_with(".jar") {
                            log_callback(format!("[INFO] Removing incompatible mod: {} (causes crashes with Lapetus)", entry.file_name().to_string_lossy()));
                            if let Err(e) = std::fs::remove_file(entry.path()) {
                                log_callback(format!(
                                    "[WARN] Failed to remove {}: {}",
                                    filename, e
                                ));
                            }
                        }
                    }
                }
            }

            // Log custom mods found (user's mods that won't be touched)
            let mut custom_mod_count = 0;
            if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let lower = filename.to_lowercase();
                    if lower.ends_with(".jar") {
                        // Check if it's NOT a managed mod
                        let is_managed = lower.contains("lapetus-client")
                            || lower.contains("fabric-api")
                            || lower.contains("sodium")
                            || lower.contains("iris")
                            || lower.contains("lithium")
                            || lower.contains("ferritecore")
                            || lower.contains("dynamic-fps")
                            || lower.contains("lazydfu");
                        if !is_managed {
                            custom_mod_count += 1;
                        }
                    }
                }
            }
            if custom_mod_count > 0 {
                log_callback(format!(
                    "[INFO] Found {} custom mod(s) - these will be preserved",
                    custom_mod_count
                ));
            }

            log_callback(format!("[INFO] Mods directory: {}", mods_dir.display()));
        }

        // For Dragon versions, check for mod updates before launch
        if options.version_id.starts_with("dragon-") {
            if options.prefer_local_dragon_mod {
                log_callback("[INFO] Using local Dragon Client jar for this launch".to_string());
            } else {
                log_callback("[INFO] Checking Dragon Client mod...".to_string());

                let instance_dir = self.game_dir.join("instances").join(&options.version_id);
                let mods_dir = instance_dir.join("mods");

                // Create mods directory if it doesn't exist
                std::fs::create_dir_all(&mods_dir)
                    .map_err(|e| format!("Failed to create mods directory: {}", e))?;

                // Check for updates and install/update if needed
                match self
                    .update_dragon_mod(&options.version_id, |_progress, status| {
                        log_callback(format!("[Dragon Mod] {}", status));
                    })
                    .await
                {
                    Ok(updated) => {
                        if updated {
                            log_callback(
                                "[INFO] Dragon Client mod updated to latest version!".to_string(),
                            );
                        } else {
                            log_callback("[INFO] Dragon Client mod is up to date!".to_string());
                        }
                    }
                    Err(e) => {
                        log_callback(format!("[WARN] Could not check for mod updates: {}", e));
                        // Continue anyway - mod might already be installed
                    }
                }
            }
        }

        let version_dir = self.versions_dir.join(&options.version_id);
        let jar_path = version_dir.join(format!("{}.jar", options.version_id));
        let json_path = version_dir.join(format!("{}.json", options.version_id));

        // For modded versions, also check instances folder
        let is_modded = options.version_id.contains("forge")
            || options.version_id.contains("fabric")
            || options.version_id.contains("quilt")
            || options.version_id.contains("lapetus")
            || options.version_id.contains("dragon")
            || options.version_id.contains("-");

        let actual_json_path = if json_path.exists() {
            json_path.clone()
        } else if is_modded {
            // Check instances folder
            let instance_json = self
                .game_dir
                .join("instances")
                .join(&options.version_id)
                .join(format!("{}.json", options.version_id));
            if instance_json.exists() {
                instance_json
            } else {
                // If Dragon version JSON is missing, auto-install it
                if options.version_id.starts_with("dragon-") {
                    log_callback("[INFO] Dragon version JSON missing, reinstalling...".to_string());

                    // Extract MC version from dragon-1.21.11 -> 1.21.11
                    let mc_version = options
                        .version_id
                        .strip_prefix("dragon-")
                        .unwrap_or(&options.version_id);

                    // Fetch available Dragon versions to get the proper loader version
                    log_callback(format!(
                        "[INFO] Fetching Dragon versions for MC {}...",
                        mc_version
                    ));

                    let dragon_versions = match self.get_dragon_versions().await {
                        Ok(versions) => versions,
                        Err(e) => {
                            return Err(format!("Failed to fetch Dragon versions: {}", e));
                        }
                    };

                    // Find the matching version
                    let dragon_version = dragon_versions
                        .iter()
                        .find(|v| v.mc_version == mc_version)
                        .ok_or_else(|| {
                            format!("Dragon not available for Minecraft {}", mc_version)
                        })?;

                    log_callback(format!(
                        "[INFO] Installing Dragon {} with loader {}...",
                        mc_version, dragon_version.loader_version
                    ));

                    // Install Dragon
                    match self
                        .install_dragon(&dragon_version, |_progress, status| {
                            log_callback(format!("[Install] {}", status));
                        })
                        .await
                    {
                        Ok(_) => {
                            log_callback("[INFO] Dragon reinstalled successfully!".to_string());
                            // Return the newly created JSON path
                            self.game_dir
                                .join("instances")
                                .join(&options.version_id)
                                .join(format!("{}.json", options.version_id))
                        }
                        Err(e) => {
                            return Err(format!("Failed to reinstall Dragon: {}", e));
                        }
                    }
                } else {
                    return Err("Version JSON not found. Please install first.".to_string());
                }
            }
        } else {
            return Err("Version JSON not found. Please install first.".to_string());
        };

        log_callback("[INFO] Reading version configuration...".to_string());

        // Read version JSON
        let json_content = std::fs::read_to_string(&actual_json_path)
            .map_err(|e| format!("Could not read version JSON: {}", e))?;
        let version_json: serde_json::Value = serde_json::from_str(&json_content)
            .map_err(|e| format!("Could not parse version JSON: {}", e))?;

        // Determine the actual MC version for natives (Fabric versions inherit from vanilla)
        let inherits_from_early = version_json["inheritsFrom"].as_str();
        let natives_mc_version = if let Some(parent_version) = inherits_from_early {
            // For Fabric: fabric-loader-{loader}-{mc_version} -> mc_version
            if parent_version.starts_with("fabric-loader-")
                || parent_version.starts_with("quilt-loader-")
            {
                parent_version.rsplit('-').next().unwrap_or(parent_version)
            } else {
                parent_version
            }
        } else if options.version_id.starts_with("fabric-loader-") {
            // Direct Fabric version: fabric-loader-{loader}-{mc_version}
            options
                .version_id
                .rsplit('-')
                .next()
                .unwrap_or(&options.version_id)
        } else {
            &options.version_id
        };

        log_callback(format!(
            "[DEBUG] Natives MC version: {}",
            natives_mc_version
        ));

        #[cfg(target_os = "windows")]
        let current_os = "windows";
        #[cfg(target_os = "macos")]
        let current_os = "osx";
        #[cfg(target_os = "linux")]
        let current_os = "linux";

        let java_hint_path = options
            .java_path
            .clone()
            .or_else(|| {
                self.find_java_for_version(&options.version_id)
                    .map(|path| path.to_string_lossy().to_string())
            })
            .unwrap_or_default();
        let mut java_hint_arch = if java_hint_path.is_empty() {
            JavaArchitecture::Unknown
        } else {
            Self::detect_java_architecture(&java_hint_path)
        };
        if let Some(preferred_arch) = self.preferred_java_arch_for_launch_version(&options.version_id)
        {
            java_hint_arch = preferred_arch;
        }
        let prefer_arm64_macos_natives = Self::should_prefer_arm64_macos_natives(java_hint_arch);

        // Check if natives directory exists and has required files (use vanilla MC version for modded)
        let version_natives_dir = self.natives_dir.join(natives_mc_version);
        let natives_exist =
            version_natives_dir.exists() && Self::has_any_natives(&version_natives_dir);
        let openal_present =
            version_natives_dir.exists() && Self::has_openal_natives(&version_natives_dir);
        let native_arch_matches = current_os != "osx"
            || Self::macos_natives_dir_matches_arch(&version_natives_dir, java_hint_arch);

        // If natives are missing or audio native is missing, repair natives.
        if !natives_exist || !openal_present || !native_arch_matches {
            if !natives_exist {
                log_callback("[INFO] Native libraries missing, downloading...".to_string());
            } else if !native_arch_matches {
                log_callback(
                    "[WARN] Native architecture mismatch detected, repairing native libraries..."
                        .to_string(),
                );
            } else {
                log_callback(
                    "[WARN] OpenAL native missing, repairing native libraries...".to_string(),
                );
            }
            std::fs::create_dir_all(&version_natives_dir).map_err(|e| e.to_string())?;
            if !native_arch_matches {
                Self::clear_arm64_patch_markers(&version_natives_dir);
                Self::clear_platform_native_files(&version_natives_dir);
            }

            // For Fabric/modded versions, we need to get natives from the vanilla JSON
            // Load vanilla JSON if this is a modded version
            let natives_json: serde_json::Value = if inherits_from_early.is_some()
                || options.version_id.starts_with("fabric-loader-")
            {
                let vanilla_json_path = self
                    .versions_dir
                    .join(natives_mc_version)
                    .join(format!("{}.json", natives_mc_version));
                if vanilla_json_path.exists() {
                    let vanilla_content = std::fs::read_to_string(&vanilla_json_path)
                        .map_err(|e| format!("Could not read vanilla version JSON: {}", e))?;
                    serde_json::from_str(&vanilla_content)
                        .map_err(|e| format!("Could not parse vanilla version JSON: {}", e))?
                } else {
                    log_callback(format!(
                        "[WARN] Vanilla JSON not found at {}, trying to install...",
                        vanilla_json_path.display()
                    ));
                    // Try to install vanilla MC
                    self.install_version(natives_mc_version, |p, msg| {
                        log_callback(format!("[Vanilla Install] {:.0}% - {}", p * 100.0, msg));
                    })
                    .await?;

                    // Re-read the JSON
                    let vanilla_content =
                        std::fs::read_to_string(&vanilla_json_path).map_err(|e| {
                            format!("Could not read vanilla version JSON after install: {}", e)
                        })?;
                    serde_json::from_str(&vanilla_content)
                        .map_err(|e| format!("Could not parse vanilla version JSON: {}", e))?
                }
            } else {
                version_json.clone()
            };

            // Download natives from the appropriate JSON (vanilla for modded, version for vanilla)
            if let Some(libraries) = natives_json["libraries"].as_array() {
                #[cfg(target_os = "windows")]
                let current_os = "windows";
                #[cfg(target_os = "macos")]
                let current_os = "osx";
                #[cfg(target_os = "linux")]
                let current_os = "linux";

                for lib in libraries {
                    // Check rules for new format natives
                    let mut allowed = true;
                    if let Some(rules) = lib.get("rules") {
                        if let Some(rules_arr) = rules.as_array() {
                            allowed = false;
                            for rule in rules_arr {
                                let action = rule["action"].as_str().unwrap_or("allow");
                                if let Some(os) = rule.get("os") {
                                    if let Some(name) = os["name"].as_str() {
                                        if name == current_os && action == "allow" {
                                            allowed = true;
                                        } else if name == current_os && action == "disallow" {
                                            allowed = false;
                                            break;
                                        }
                                    }
                                } else if action == "allow" {
                                    allowed = true;
                                }
                            }
                        }
                    }

                    if !allowed {
                        continue;
                    }

                    if let Some(downloads) = lib.get("downloads") {
                        // NEW FORMAT (1.21.5+): Natives are in "artifact" with OS-specific rules
                        let lib_name = lib["name"].as_str().unwrap_or("");
                        let is_native_lib = lib_name.contains("natives-");

                        if is_native_lib {
                            let should_use = Self::should_use_native_artifact(
                                lib_name,
                                current_os,
                                prefer_arm64_macos_natives,
                            );

                            if should_use {
                                if let Some(artifact) = downloads.get("artifact") {
                                    if let Some(url) = artifact["url"].as_str() {
                                        let path = artifact["path"].as_str().unwrap_or("");
                                        let jar_name = std::path::Path::new(path)
                                            .file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| {
                                                format!("{}-native.jar", natives_mc_version)
                                            });
                                        let native_jar_path = self.natives_dir.join(&jar_name);

                                        let needs_download = !native_jar_path.exists()
                                            || !Self::is_valid_jar_static(&native_jar_path);
                                        if needs_download {
                                            let _ = std::fs::remove_file(&native_jar_path);
                                            log_callback(format!(
                                                "[INFO] Downloading {}...",
                                                jar_name
                                            ));
                                            let _ = self.download_file(url, &native_jar_path).await;
                                        }

                                        // Extract natives
                                        if native_jar_path.exists()
                                            && Self::is_valid_jar_static(&native_jar_path)
                                        {
                                            if let Ok(file) = std::fs::File::open(&native_jar_path)
                                            {
                                                if let Ok(mut archive) = zip::ZipArchive::new(file)
                                                {
                                                    for j in 0..archive.len() {
                                                        if let Ok(mut entry) = archive.by_index(j) {
                                                            let name = entry.name().to_string();
                                                            let is_native =
                                                                Self::is_platform_native_file(
                                                                    &name,
                                                                );

                                                            if is_native {
                                                                let file_name =
                                                                    std::path::Path::new(&name)
                                                                        .file_name()
                                                                        .unwrap_or_default()
                                                                        .to_string_lossy()
                                                                        .to_string();
                                                                let out_path = version_natives_dir
                                                                    .join(&file_name);
                                                                // Always overwrite to ensure correct architecture
                                                                if let Ok(mut out_file) =
                                                                    std::fs::File::create(&out_path)
                                                                {
                                                                    let _ = std::io::copy(
                                                                        &mut entry,
                                                                        &mut out_file,
                                                                    );
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // OLD FORMAT: Natives are in "classifiers"
                        if let Some(classifiers) = downloads.get("classifiers") {
                            let native_keys =
                                Self::preferred_native_keys(current_os, prefer_arm64_macos_natives);

                            for native_key in native_keys {
                                if let Some(native) = classifiers.get(native_key) {
                                    if let Some(url) = native["url"].as_str() {
                                        let native_jar_path = self.native_archive_cache_path(
                                            native,
                                            format!("{}-{}.jar", natives_mc_version, native_key),
                                        );

                                        let needs_download = !native_jar_path.exists()
                                            || !Self::is_valid_jar_static(&native_jar_path);
                                        if needs_download {
                                            let _ = std::fs::remove_file(&native_jar_path);
                                            log_callback(format!(
                                                "[INFO] Downloading {}...",
                                                native_key
                                            ));
                                            let _ = self.download_file(url, &native_jar_path).await;
                                        }

                                        // Extract natives
                                        if native_jar_path.exists()
                                            && Self::is_valid_jar_static(&native_jar_path)
                                        {
                                            if let Ok(file) = std::fs::File::open(&native_jar_path)
                                            {
                                                if let Ok(mut archive) = zip::ZipArchive::new(file)
                                                {
                                                    for j in 0..archive.len() {
                                                        if let Ok(mut entry) = archive.by_index(j) {
                                                            let name = entry.name().to_string();
                                                            let is_native =
                                                                Self::is_platform_native_file(
                                                                    &name,
                                                                );

                                                            if is_native {
                                                                let file_name =
                                                                    std::path::Path::new(&name)
                                                                        .file_name()
                                                                        .unwrap_or_default()
                                                                        .to_string_lossy()
                                                                        .to_string();
                                                                let out_path = version_natives_dir
                                                                    .join(&file_name);
                                                                if let Ok(mut out_file) =
                                                                    std::fs::File::create(&out_path)
                                                                {
                                                                    let _ = std::io::copy(
                                                                        &mut entry,
                                                                        &mut out_file,
                                                                    );
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            log_callback("[INFO] Native libraries downloaded".to_string());

            if Self::has_openal_natives(&version_natives_dir) {
                log_callback("[INFO] OpenAL native verified".to_string());
            } else {
                log_callback("[WARN] OpenAL native still missing after repair attempt".to_string());
                #[cfg(target_os = "windows")]
                {
                    // Last-resort recovery: pull OpenAL DLLs from any cached native archives.
                    // This handles both LWJGL2 (lwjgl-platform natives) and LWJGL3 (lwjgl-openal natives).
                    let recovered = self.recover_windows_openal_from_known_archives(
                        &version_natives_dir,
                        java_hint_arch,
                    );
                    if recovered > 0 {
                        log_callback(format!(
                            "[INFO] Recovered {} Windows audio native file(s) from archives",
                            recovered
                        ));
                    }

                    if Self::has_openal_natives(&version_natives_dir) {
                        log_callback(
                            "[INFO] OpenAL native recovered from cached native archives"
                                .to_string(),
                        );
                        log_callback(format!(
                            "[DEBUG] OpenAL files: {}",
                            Self::describe_windows_openal_files(&version_natives_dir)
                        ));
                    } else {
                        log_callback(
                            "[WARN] OpenAL recovery failed; in-game sound may be unavailable"
                                .to_string(),
                        );
                    }
                }
            }
        }

        // Check if this is a modded version that inherits from vanilla
        let inherits_from = version_json["inheritsFrom"].as_str();
        let is_modded = inherits_from.is_some()
            || options.version_id.contains("forge")
            || options.version_id.contains("fabric")
            || options.version_id.contains("quilt")
            || options.version_id.contains("lapetus");

        // Load parent version JSON if this is a modded version
        // For Lapetus -> Fabric -> Vanilla chain, we need ALL JSONs for libraries
        let mut intermediate_parent_json: Option<serde_json::Value> = None; // Fabric JSON (for Lapetus)
        let parent_json: Option<serde_json::Value> = if let Some(parent_version) = inherits_from {
            let parent_json_path = self
                .versions_dir
                .join(parent_version)
                .join(format!("{}.json", parent_version));
            if parent_json_path.exists() {
                let parent_content = std::fs::read_to_string(&parent_json_path)
                    .map_err(|e| format!("Could not read parent version JSON: {}", e))?;
                let parent: serde_json::Value = serde_json::from_str(&parent_content)
                    .map_err(|e| format!("Could not parse parent version JSON: {}", e))?;

                // If parent also inherits (e.g., Fabric inherits from vanilla), load the grandparent
                if let Some(grandparent_version) = parent["inheritsFrom"].as_str() {
                    let grandparent_json_path = self
                        .versions_dir
                        .join(grandparent_version)
                        .join(format!("{}.json", grandparent_version));
                    if grandparent_json_path.exists() {
                        let grandparent_content = std::fs::read_to_string(&grandparent_json_path)
                            .map_err(|e| {
                            format!("Could not read grandparent version JSON: {}", e)
                        })?;
                        let grandparent: serde_json::Value =
                            serde_json::from_str(&grandparent_content).map_err(|e| {
                                format!("Could not parse grandparent version JSON: {}", e)
                            })?;
                        // Store the intermediate parent (Fabric) for its libraries
                        intermediate_parent_json = Some(parent);
                        // Return the vanilla (grandparent) JSON for natives/LWJGL
                        Some(grandparent)
                    } else {
                        Some(parent)
                    }
                } else {
                    Some(parent)
                }
            } else {
                // Parent version not installed - this shouldn't happen after repair
                log_callback(format!(
                    "[WARN] Parent version {} JSON not found",
                    parent_version
                ));
                None
            }
        } else {
            None
        };

        // For modded versions, ensure the parent JAR exists
        let actual_jar_path = if is_modded {
            if let Some(parent_version) = inherits_from {
                let parent_jar = self
                    .versions_dir
                    .join(parent_version)
                    .join(format!("{}.jar", parent_version));

                // Fabric/Quilt loaders don't have their own JAR - they inherit from vanilla
                // Forge also inherits from vanilla
                if parent_version.starts_with("fabric-loader-")
                    || parent_version.starts_with("quilt-loader-")
                {
                    // Parse MC version from loader version: fabric-loader-{loader_version}-{mc_version}
                    let mc_version = parent_version.rsplit('-').next().unwrap_or(parent_version);
                    let vanilla_jar = self
                        .versions_dir
                        .join(mc_version)
                        .join(format!("{}.jar", mc_version));
                    if !vanilla_jar.exists() {
                        return Err(format!("Vanilla Minecraft {} JAR not found. Please install Minecraft {} first.", mc_version, mc_version));
                    }
                    vanilla_jar
                } else if parent_jar.exists() {
                    // Parent JAR exists (this is the vanilla JAR for Forge)
                    parent_jar
                } else {
                    // Parent JAR doesn't exist - try to auto-install vanilla Minecraft
                    // For Forge versions, the parent_version might be the Forge version itself (bug in installer)
                    // Extract the actual MC version from the parent_version or version_id
                    let mc_version = if parent_version.contains("forge") {
                        // Extract MC version from Forge version ID: "1.8.9-forge1.8.9-11.15.1.2318-1.8.9" -> "1.8.9"
                        parent_version
                            .split("-forge")
                            .next()
                            .unwrap_or(parent_version)
                    } else {
                        parent_version
                    };

                    let vanilla_jar = self
                        .versions_dir
                        .join(mc_version)
                        .join(format!("{}.jar", mc_version));

                    if !vanilla_jar.exists() {
                        log_callback(format!(
                            "[INFO] Vanilla Minecraft {} not found, auto-installing...",
                            mc_version
                        ));

                        // Auto-install vanilla Minecraft using tokio runtime
                        let mc_version_owned = mc_version.to_string();
                        let launcher_clone = self.clone_for_install();

                        let install_result = tokio::task::block_in_place(|| {
                            tokio::runtime::Handle::current().block_on(async {
                                launcher_clone
                                    .install_version(&mc_version_owned, |_p, _s| {})
                                    .await
                            })
                        });

                        match install_result {
                            Ok(_) => {
                                log_callback(format!(
                                    "[INFO] Vanilla Minecraft {} installed successfully",
                                    mc_version
                                ));
                            }
                            Err(e) => {
                                return Err(format!("Failed to auto-install Vanilla Minecraft {}: {}. Please install it manually first.", mc_version, e));
                            }
                        }
                    }

                    vanilla_jar
                }
            } else {
                // Try to extract parent version from version ID (e.g., "1.17.1-forge-37.1.1" -> "1.17.1")
                let parent_version = options
                    .version_id
                    .split("-forge")
                    .next()
                    .or_else(|| options.version_id.split("-fabric").next())
                    .or_else(|| options.version_id.split("-quilt").next())
                    .unwrap_or(&options.version_id);
                let parent_jar = self
                    .versions_dir
                    .join(parent_version)
                    .join(format!("{}.jar", parent_version));
                if parent_jar.exists() {
                    parent_jar
                } else {
                    // Parent JAR doesn't exist - need to install vanilla Minecraft
                    return Err(format!(
                        "Vanilla Minecraft {} JAR not found. Please install Minecraft {} first.",
                        parent_version, parent_version
                    ));
                }
            }
        } else {
            if !jar_path.exists() {
                return Err("Version JAR not found. Please install first.".to_string());
            }
            jar_path.clone()
        };

        // For modded versions, use parent version JSON for LWJGL detection and natives
        let effective_version_json = if is_modded && parent_json.is_some() {
            parent_json.as_ref().unwrap()
        } else {
            &version_json
        };

        // Use the natives_mc_version we determined earlier for consistency
        let mc_version_for_natives = natives_mc_version;

        log_callback("[INFO] Finding Java installation...".to_string());

        // Find Java compatible with this Minecraft version
        let mc_version_for_java = inherits_from.unwrap_or(&options.version_id);
        let mut required_java = Self::get_required_java_version(mc_version_for_java);

        // Check if the version JSON specifies a higher Java requirement (for modpacks)
        // Some modpacks may require Java 22 even if the base MC version only needs Java 21
        if let Some(java_version_obj) = version_json.get("javaVersion") {
            if let Some(major_version) = java_version_obj
                .get("majorVersion")
                .and_then(|v| v.as_u64())
            {
                let modpack_java = major_version as u8;
                if modpack_java > required_java {
                    log_callback(format!("[INFO] Modpack requires Java {}, which is higher than MC's requirement (Java {})", modpack_java, required_java));
                    required_java = modpack_java;
                }
            }
        }

        // Check if this is old Forge (pre-1.13) which requires Java 8
        let is_old_forge = options.version_id.contains("forge") && {
            let mc_version = mc_version_for_java;
            let parts: Vec<&str> = mc_version.split('.').collect();
            if parts.len() >= 2 {
                parts[1].parse::<u32>().map(|v| v < 13).unwrap_or(false)
            } else {
                false
            }
        };

        log_callback(format!(
            "[INFO] Minecraft {} requires Java {}",
            mc_version_for_java, required_java
        ));
        let preferred_java_arch = self.preferred_java_arch_for_launch_version(&options.version_id);
        if matches!(preferred_java_arch, Some(JavaArchitecture::X86_64)) {
            if self.version_requires_x86_java_runtime(&options.version_id) {
                log_callback(
                    "[INFO] Detected x86_64-only native mod support; preferring x86_64 Java on Apple Silicon"
                        .to_string(),
                );
            } else {
                log_callback(
                    "[INFO] Apple Silicon legacy compatibility enabled: preferring x86_64 Java"
                        .to_string(),
                );
            }
        }

        // Try to find Java, auto-install if needed
        let mut java_path: Option<String> = options.java_path.clone().or_else(|| {
            self.find_java_for_required_version(required_java, preferred_java_arch)
                .map(|p| p.to_string_lossy().to_string())
        });

        if let Some(selected_java_path) = java_path.clone() {
            if !Self::is_java_executable_compatible(
                std::path::Path::new(&selected_java_path),
                required_java,
                preferred_java_arch,
            ) {
                log_callback(format!(
                    "[WARN] Java path '{}' is incompatible with Minecraft {}. Searching for a compatible runtime instead.",
                    selected_java_path, mc_version_for_java
                ));
                java_path = self
                    .find_java_for_required_version(required_java, preferred_java_arch)
                    .map(|p| p.to_string_lossy().to_string());
            }
        }

        // If Java not found, try to auto-install it
        if java_path.is_none() {
            log_callback(format!(
                "[INFO] Java {} not found, attempting auto-installation...",
                required_java
            ));

            // Try to install the required Java version - retry up to 2 times
            let mut install_error = String::new();
            for install_attempt in 1..=2 {
                log_callback(format!(
                    "[INFO] Java installation attempt {}/2...",
                    install_attempt
                ));

                match self
                    .install_preferred_java_version(
                        &options.version_id,
                        required_java,
                        &|progress, msg| {
                            log_callback(format!("[JAVA] {:.0}% - {}", progress * 100.0, msg));
                        },
                    )
                    .await
                {
                    Ok(_) => {
                        log_callback(format!(
                            "[INFO] Java {} installed successfully!",
                            required_java
                        ));
                        // Now try to find it again
                        java_path = self
                            .find_java_for_required_version(required_java, preferred_java_arch)
                            .map(|p| p.to_string_lossy().to_string());

                        // If still not found, check bundled path directly
                        if java_path.is_none() {
                            let bundled = self.get_bundled_java_path_version(required_java);
                            if let Some(path) = bundled {
                                if path.exists() {
                                    java_path = Some(path.to_string_lossy().to_string());
                                    log_callback(format!(
                                        "[INFO] Found Java at: {}",
                                        path.display()
                                    ));
                                }
                            }
                        }

                        if java_path.is_some() {
                            break;
                        }
                    }
                    Err(e) => {
                        install_error = e.clone();
                        log_callback(format!(
                            "[WARN] Java installation attempt {} failed: {}",
                            install_attempt, e
                        ));
                        if install_attempt < 2 {
                            log_callback("[INFO] Retrying Java installation...".to_string());
                        }
                    }
                }
            }

            // If still no Java after installation attempts, return error with helpful message
            if java_path.is_none() && !install_error.is_empty() {
                #[cfg(target_os = "windows")]
                return Err(format!(
                    "Failed to auto-install Java {}: {}\n\n\
                    Please install Java {} manually:\n\
                    1. Download from: https://adoptium.net/temurin/releases/?version={}\n\
                    2. Or run in PowerShell: winget install EclipseAdoptium.Temurin.{}.JDK\n\
                    3. Restart the launcher after installation",
                    required_java, install_error, required_java, required_java, required_java
                ));

                #[cfg(target_os = "macos")]
                return Err(format!(
                    "Failed to auto-install Java {}: {}\n\n\
                    Please install Java {} manually:\n\
                    brew install openjdk@{}",
                    required_java, install_error, required_java, required_java
                ));

                #[cfg(target_os = "linux")]
                return Err(format!(
                    "Failed to auto-install Java {}: {}\n\n\
                    Please install Java {} manually:\n\
                    sudo apt install openjdk-{}-jdk",
                    required_java, install_error, required_java, required_java
                ));
            }
        }

        // Special handling for old Forge - needs Java 8
        if java_path.is_none() && is_old_forge {
            log_callback(
                "[INFO] Java 8 not found for old Forge. Attempting auto-installation..."
                    .to_string(),
            );

            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            if matches!(preferred_java_arch, Some(JavaArchitecture::X86_64)) {
                log_callback(
                    "[INFO] Old Forge on Apple Silicon will use x86_64 Java 8 for compatibility."
                        .to_string(),
                );
                match self
                    .install_macos_java8_x64(&|progress, msg| {
                        log_callback(format!("[JAVA] {:.0}% - {}", progress * 100.0, msg));
                    })
                    .await
                {
                    Ok(_) => {
                        java_path = self
                            .find_java_for_required_version(required_java, preferred_java_arch)
                            .map(|p| p.to_string_lossy().to_string());
                    }
                    Err(e) => {
                        return Err(format!(
                            "Failed to auto-install compatible Java 8: {}\n\nPlease install x64 Java 8 manually and restart the launcher.",
                            e
                        ));
                    }
                }
            } else {
                match self.auto_install_java8(&log_callback).await {
                    Ok(path) => {
                        java_path = Some(path);
                    }
                    Err(e) => {
                        return Err(format!(
                            "Failed to auto-install Java 8: {}\n\n\
                        Please install Java 8 manually:\n\
                        brew install openjdk@8",
                            e
                        ));
                    }
                }
            }
        }

        let java_path = match java_path {
            Some(path) => path,
            None => {
                // Last resort - check bundled path one more time
                let bundled = self.get_bundled_java_path_version(required_java);
                if let Some(path) = bundled {
                    if path.exists() {
                        path.to_string_lossy().to_string()
                    } else {
                        #[cfg(target_os = "windows")]
                        return Err(format!(
                            "Java {} not found. Please install Java {} for Minecraft {}.\n\n\
                            Download from: https://adoptium.net/temurin/releases/?version={}\n\n\
                            Or install via winget:\n\
                            winget install EclipseAdoptium.Temurin.{}.JDK",
                            required_java,
                            required_java,
                            mc_version_for_java,
                            required_java,
                            required_java
                        ));
                        #[cfg(not(target_os = "windows"))]
                        return Err(format!(
                            "Java {} not found. Please install Java {} for Minecraft {}.",
                            required_java, required_java, mc_version_for_java
                        ));
                    }
                } else {
                    #[cfg(target_os = "windows")]
                    return Err(format!(
                        "Java {} not found. Please install Java {} for Minecraft {}.\n\n\
                        Download from: https://adoptium.net/temurin/releases/?version={}\n\n\
                        Or install via winget:\n\
                        winget install EclipseAdoptium.Temurin.{}.JDK",
                        required_java,
                        required_java,
                        mc_version_for_java,
                        required_java,
                        required_java
                    ));
                    #[cfg(not(target_os = "windows"))]
                    return Err(format!(
                        "Java {} not found. Please install Java {} for Minecraft {}.",
                        required_java, required_java, mc_version_for_java
                    ));
                }
            }
        };

        log_callback(format!("[INFO] Using Java: {}", java_path));

        let java_arch = Self::detect_java_architecture(&java_path);
        let prefer_arm64_macos_natives = Self::should_prefer_arm64_macos_natives(java_arch);
        #[cfg(target_os = "macos")]
        {
            let java_arch_label = match java_arch {
                JavaArchitecture::Arm64 => "arm64",
                JavaArchitecture::X86_64 => "x86_64",
                JavaArchitecture::Unknown => "unknown",
            };
            log_callback(format!(
                "[INFO] Java runtime architecture: {}",
                java_arch_label
            ));
        }

        let version_natives_dir = self.natives_dir.join(mc_version_for_natives);
        if !prefer_arm64_macos_natives {
            Self::clear_arm64_patch_markers(&version_natives_dir);
        }

        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            if prefer_arm64_macos_natives {
                log_callback("[INFO] Patching ARM64 natives...".to_string());
                self.patch_arm64_natives(mc_version_for_natives, effective_version_json)
                    .await?;
            } else {
                log_callback(
                    "[INFO] Skipping ARM64 native patch because the selected Java is x86_64"
                        .to_string(),
                );
            }
        }

        // Check if we need to use patched LWJGL 3.3.3 (for ARM64 macOS with LWJGL 3.2.x)
        let mc_version_str = inherits_from.unwrap_or(&options.version_id);
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        let (use_patched_lwjgl, lwjgl_patch_version) = {
            let needs_patch = prefer_arm64_macos_natives
                && Self::detect_lwjgl_version(effective_version_json) == 3
                && {
                    // Check if version is pre-1.19 (needs LWJGL patching).
                    // Use normalized base extraction so snapshots/RC IDs like "26.1-rc-1"
                    // are parsed as "26.1" (not "1"), preventing incorrect legacy patching.
                    let mc_version = Self::extract_base_minecraft_version(mc_version_str);
                    let (major_version, minor_version, _) =
                        Self::parse_mc_version_numbers(&mc_version);
                    let needs_patch = major_version == 1 && minor_version < 19;
                    println!(
                        "[LWJGL] MC version: {}, parsed: {}.{}, needs patch: {}",
                        mc_version, major_version, minor_version, needs_patch
                    );
                    needs_patch
                };
            println!(
                "[LWJGL] use_patched_lwjgl: {}, version: {}",
                needs_patch,
                if needs_patch { "3.3.3" } else { "native" }
            );
            (needs_patch, "3.3.3")
        };

        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        let (use_patched_lwjgl, lwjgl_patch_version) = (false, "3.3.3");

        log_callback("[INFO] Checking and downloading missing libraries...".to_string());

        // Download missing libraries before building classpath
        // This handles versions installed by other launchers that may have missing libs
        self.ensure_libraries_exist(
            &version_json,
            parent_json.as_ref(),
            intermediate_parent_json.as_ref(),
            &log_callback,
        )
        .await?;

        log_callback("[INFO] Building classpath...".to_string());

        // Build classpath - collect libraries from both this version and parent (if inherited)
        let mut classpath = Vec::new();

        // Determine current OS for library rules
        #[cfg(target_os = "windows")]
        let current_os = "windows";
        #[cfg(target_os = "macos")]
        let current_os = "osx";
        #[cfg(target_os = "linux")]
        let current_os = "linux";

        // Helper function to add libraries from a JSON
        // Track added artifacts to avoid duplicate libraries with different versions
        let mut added_artifacts: std::collections::HashSet<String> =
            std::collections::HashSet::new();

        let add_libraries = |classpath: &mut Vec<String>,
                             added_artifacts: &mut std::collections::HashSet<String>,
                             libraries: &[serde_json::Value],
                             libraries_dir: &std::path::Path,
                             use_patched_lwjgl: bool,
                             lwjgl_patch_version: &str,
                             current_os: &str| {
            let mut added_count = 0;
            let mut skipped_rules = 0;
            let mut skipped_duplicates = 0;
            let mut missing_files = 0;

            for lib in libraries {
                // Check rules
                let mut allowed = true;
                if let Some(rules) = lib.get("rules") {
                    if let Some(rules_arr) = rules.as_array() {
                        allowed = false;
                        for rule in rules_arr {
                            let action = rule["action"].as_str().unwrap_or("allow");
                            if let Some(os) = rule.get("os") {
                                if let Some(name) = os["name"].as_str() {
                                    if name == current_os && action == "allow" {
                                        allowed = true;
                                    } else if name == current_os && action == "disallow" {
                                        allowed = false;
                                        break;
                                    }
                                }
                            } else if action == "allow" {
                                allowed = true;
                            }
                        }
                    }
                }

                // Check clientreq for old Forge format (if false, skip for client)
                if let Some(clientreq) = lib.get("clientreq") {
                    if clientreq.as_bool() == Some(false) {
                        continue;
                    }
                }

                if !allowed {
                    skipped_rules += 1;
                    continue;
                }

                // Extract artifact key (group:artifact without version) to detect duplicates
                let artifact_key = if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                    // Maven format: group:artifact:version[:classifier]
                    let parts: Vec<&str> = name.split(':').collect();
                    if parts.len() >= 2 {
                        // Include classifier if present (for natives)
                        if parts.len() > 3 {
                            format!("{}:{}:{}", parts[0], parts[1], parts[3])
                        } else {
                            format!("{}:{}", parts[0], parts[1])
                        }
                    } else {
                        name.to_string()
                    }
                } else if let Some(artifact) = lib
                    .get("downloads")
                    .and_then(|d| d.get("artifact"))
                    .and_then(|a| a.get("path"))
                    .and_then(|p| p.as_str())
                {
                    // Extract from path: group/artifact/version/artifact-version.jar
                    let parts: Vec<&str> = artifact.split('/').collect();
                    if parts.len() >= 3 {
                        format!(
                            "{}/{}",
                            parts[..parts.len() - 2].join("/"),
                            parts[parts.len() - 3]
                        )
                    } else {
                        artifact.to_string()
                    }
                } else {
                    String::new()
                };

                // Skip if this artifact (ignoring version) was already added
                if !artifact_key.is_empty() && added_artifacts.contains(&artifact_key) {
                    skipped_duplicates += 1;
                    continue;
                }

                if allowed {
                    // Try new format first (downloads.artifact)
                    if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                        if let Some(path) = artifact["path"].as_str() {
                            // Convert forward slashes to platform-specific path separators
                            let normalized_path = path.replace('/', std::path::MAIN_SEPARATOR_STR);
                            let mut lib_path = libraries_dir.join(&normalized_path);

                            // For Forge libraries, we need BOTH the regular JAR (for launch handlers)
                            // AND the universal JAR (for FML classes like MinecraftModLanguageProvider)
                            if path.contains("net/minecraftforge/forge/")
                                && path.ends_with(".jar")
                                && !path.contains("-universal")
                            {
                                // First add the regular JAR (contains launch handlers)
                                if lib_path.exists()
                                    && !classpath.contains(&lib_path.to_string_lossy().to_string())
                                {
                                    classpath.push(lib_path.to_string_lossy().to_string());
                                    added_count += 1;
                                }

                                // Then check for and add the universal JAR (contains FML classes)
                                let universal_path = path
                                    .replace(".jar", "-universal.jar")
                                    .replace('/', std::path::MAIN_SEPARATOR_STR);
                                let universal_lib_path = libraries_dir.join(&universal_path);
                                if universal_lib_path.exists()
                                    && !classpath
                                        .contains(&universal_lib_path.to_string_lossy().to_string())
                                {
                                    classpath
                                        .push(universal_lib_path.to_string_lossy().to_string());
                                    added_count += 1;
                                }
                                continue; // Skip the normal add below since we handled it
                            }

                            // On ARM64 macOS, replace LWJGL JARs with patched version (both main and natives)
                            if use_patched_lwjgl && path.contains("org/lwjgl/") {
                                if let Some(artifact_name) = path.split('/').nth(2) {
                                    // Check if this is a native library
                                    if path.contains("natives") {
                                        // For natives, extract the classifier (e.g., natives-macos-arm64)
                                        // Path format: org/lwjgl/lwjgl-glfw/3.3.1/lwjgl-glfw-3.3.1-natives-macos-arm64.jar
                                        if let Some(filename) = path.split('/').last() {
                                            // Extract classifier from filename
                                            // e.g., lwjgl-glfw-3.3.1-natives-macos-arm64.jar -> natives-macos-arm64
                                            if let Some(classifier_start) =
                                                filename.find("-natives-")
                                            {
                                                let classifier = &filename
                                                    [classifier_start + 1..filename.len() - 4]; // Remove .jar
                                                let replacement_path = libraries_dir
                                                    .join("org/lwjgl")
                                                    .join(artifact_name)
                                                    .join(lwjgl_patch_version)
                                                    .join(format!(
                                                        "{}-{}-{}.jar",
                                                        artifact_name,
                                                        lwjgl_patch_version,
                                                        classifier
                                                    ));

                                                if replacement_path.exists() {
                                                    lib_path = replacement_path;
                                                }
                                            }
                                        }
                                    } else {
                                        // For main JARs
                                        let replacement_path = libraries_dir
                                            .join("org/lwjgl")
                                            .join(artifact_name)
                                            .join(lwjgl_patch_version)
                                            .join(format!(
                                                "{}-{}.jar",
                                                artifact_name, lwjgl_patch_version
                                            ));

                                        if replacement_path.exists() {
                                            lib_path = replacement_path;
                                        }
                                    }
                                }
                            }

                            if lib_path.exists() {
                                if !classpath.contains(&lib_path.to_string_lossy().to_string()) {
                                    classpath.push(lib_path.to_string_lossy().to_string());
                                    if !artifact_key.is_empty() {
                                        added_artifacts.insert(artifact_key.clone());
                                    }
                                    added_count += 1;
                                }
                            } else {
                                missing_files += 1;
                                // Log missing critical libraries for debugging
                                if path.contains("logging")
                                    || path.contains("log4j")
                                    || path.contains("slf4j")
                                {
                                    println!(
                                        "[WARN] Missing critical library: {} at {}",
                                        path,
                                        lib_path.display()
                                    );
                                }
                            }
                        }
                    }
                    // Old Forge format: just "name" field with Maven coordinates
                    else if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                        // Parse Maven coordinates: group:artifact:version
                        let parts: Vec<&str> = name.split(':').collect();
                        if parts.len() >= 3 {
                            let group = parts[0].replace('.', "/");
                            let artifact = parts[1];
                            let version = parts[2];

                            // Build path: group/artifact/version/artifact-version.jar
                            let jar_name = if parts.len() > 3 {
                                // Has classifier: artifact-version-classifier.jar
                                format!("{}-{}-{}.jar", artifact, version, parts[3])
                            } else {
                                format!("{}-{}.jar", artifact, version)
                            };

                            let lib_path = libraries_dir
                                .join(&group)
                                .join(artifact)
                                .join(version)
                                .join(&jar_name);

                            // For old Forge, also check for universal JAR
                            if name.contains("minecraftforge:forge:")
                                || name.contains("net.minecraftforge:forge:")
                            {
                                // Try universal jar first
                                let universal_name = jar_name.replace(".jar", "-universal.jar");
                                let universal_path = libraries_dir
                                    .join(&group)
                                    .join(artifact)
                                    .join(version)
                                    .join(&universal_name);

                                if universal_path.exists()
                                    && !classpath
                                        .contains(&universal_path.to_string_lossy().to_string())
                                {
                                    classpath.push(universal_path.to_string_lossy().to_string());
                                    if !artifact_key.is_empty() {
                                        added_artifacts.insert(artifact_key.clone());
                                    }
                                    added_count += 1;
                                }
                            }

                            if lib_path.exists() {
                                if !classpath.contains(&lib_path.to_string_lossy().to_string()) {
                                    classpath.push(lib_path.to_string_lossy().to_string());
                                    if !artifact_key.is_empty() {
                                        added_artifacts.insert(artifact_key.clone());
                                    }
                                    added_count += 1;
                                }
                            } else {
                                missing_files += 1;
                            }
                        }
                    }
                }
            }

            println!("[DEBUG] add_libraries: added={}, skipped_rules={}, skipped_duplicates={}, missing_files={}", added_count, skipped_rules, skipped_duplicates, missing_files);
        };

        // For modded versions, add mod loader libraries FIRST so they take precedence
        // This is important for library version conflicts (e.g., log4j versions)
        if let Some(libraries) = version_json["libraries"].as_array() {
            log_callback("[INFO] Adding Lapetus/Fabric loader libraries...".to_string());
            add_libraries(
                &mut classpath,
                &mut added_artifacts,
                libraries,
                &self.libraries_dir,
                use_patched_lwjgl,
                lwjgl_patch_version,
                current_os,
            );
        }

        // For Lapetus/nested inheritance, add intermediate parent (Fabric) libraries
        if let Some(ref intermediate) = intermediate_parent_json {
            if let Some(intermediate_libs) = intermediate["libraries"].as_array() {
                log_callback("[INFO] Adding Fabric loader libraries...".to_string());
                add_libraries(
                    &mut classpath,
                    &mut added_artifacts,
                    intermediate_libs,
                    &self.libraries_dir,
                    use_patched_lwjgl,
                    lwjgl_patch_version,
                    current_os,
                );
            }
        }

        // Then add libraries from parent version (vanilla libraries)
        if let Some(ref parent) = parent_json {
            log_callback("[INFO] Adding vanilla/parent libraries...".to_string());
            if let Some(parent_libs) = parent["libraries"].as_array() {
                log_callback(format!(
                    "[DEBUG] Parent has {} libraries",
                    parent_libs.len()
                ));
                add_libraries(
                    &mut classpath,
                    &mut added_artifacts,
                    parent_libs,
                    &self.libraries_dir,
                    use_patched_lwjgl,
                    lwjgl_patch_version,
                    current_os,
                );
            }
        } else {
            log_callback(
                "[WARN] No parent_json found - vanilla libraries may be missing!".to_string(),
            );
        }

        // For Forge 1.17+ with module system, don't add the vanilla JAR to classpath
        // The bootstrap launcher handles it via the module system
        let uses_module_system = std::iter::once(&version_json)
            .chain(intermediate_parent_json.iter())
            .any(|json| {
                json.get("arguments")
                    .and_then(|a| a.get("jvm"))
                    .and_then(|j| j.as_array())
                    .map(|arr| {
                        arr.iter().any(|a| {
                            a.as_str()
                                .map(|s| s == "-p" || s == "--module-path")
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false)
            });

        if !uses_module_system {
            // Add client JAR only for non-module versions (vanilla or older Forge)
            classpath.push(actual_jar_path.to_string_lossy().to_string());
        }

        // Debug: Log classpath for troubleshooting
        log_callback(format!("[DEBUG] Classpath has {} entries", classpath.len()));
        log_callback(format!(
            "[DEBUG] Vanilla JAR in classpath: {}",
            classpath.iter().any(|p| p.contains("1.20.1.jar"))
        ));
        log_callback(format!(
            "[DEBUG] Fabric loader in classpath: {}",
            classpath.iter().any(|p| p.contains("fabric-loader"))
        ));
        log_callback(format!(
            "[DEBUG] jopt-simple in classpath: {}",
            classpath.iter().any(|p| p.contains("jopt-simple"))
        ));

        // Check for critical logging library
        let has_logging = classpath.iter().any(|p| p.contains("logging"));
        log_callback(format!(
            "[DEBUG] com.mojang.logging in classpath: {}",
            has_logging
        ));
        if !has_logging {
            log_callback(
                "[WARN] Missing com.mojang.logging library - this will cause NoClassDefFoundError!"
                    .to_string(),
            );
        }

        // If jopt-simple is missing, try to add it manually (required for Fabric to launch Minecraft)
        if !classpath.iter().any(|p| p.contains("jopt-simple")) {
            // Use proper path construction for cross-platform compatibility
            let jopt_path = self
                .libraries_dir
                .join("net")
                .join("sf")
                .join("jopt-simple")
                .join("jopt-simple")
                .join("5.0.4")
                .join("jopt-simple-5.0.4.jar");
            if !jopt_path.exists() {
                // Download jopt-simple if missing
                log_callback("[INFO] Downloading jopt-simple library...".to_string());
                if let Some(parent) = jopt_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                let jopt_url = "https://libraries.minecraft.net/net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar";
                if let Ok(client) = reqwest::Client::builder()
                    .connect_timeout(std::time::Duration::from_secs(4))
                    .timeout(std::time::Duration::from_secs(15))
                    .build()
                {
                    if let Ok(response) = client.get(jopt_url).send().await {
                        if response.status().is_success() {
                            if let Ok(bytes) = response.bytes().await {
                                std::fs::write(&jopt_path, &bytes).ok();
                            }
                        }
                    }
                }
            }
            if jopt_path.exists() {
                log_callback(format!(
                    "[DEBUG] Adding jopt-simple from: {}",
                    jopt_path.display()
                ));
                classpath.push(jopt_path.to_string_lossy().to_string());
            } else {
                log_callback(format!(
                    "[WARN] jopt-simple not found at: {}",
                    jopt_path.display()
                ));
            }
        }

        // If logging library is missing, try to add it manually (critical for MC 1.18+)
        if !has_logging {
            let logging_path = self
                .libraries_dir
                .join("com")
                .join("mojang")
                .join("logging")
                .join("1.1.1")
                .join("logging-1.1.1.jar");
            if !logging_path.exists() {
                log_callback("[INFO] Downloading com.mojang.logging library...".to_string());
                if let Some(parent) = logging_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                let logging_url =
                    "https://libraries.minecraft.net/com/mojang/logging/1.1.1/logging-1.1.1.jar";
                if let Ok(client) = reqwest::Client::builder()
                    .connect_timeout(std::time::Duration::from_secs(4))
                    .timeout(std::time::Duration::from_secs(15))
                    .build()
                {
                    if let Ok(response) = client.get(logging_url).send().await {
                        if response.status().is_success() {
                            if let Ok(bytes) = response.bytes().await {
                                std::fs::write(&logging_path, &bytes).ok();
                                log_callback("[INFO] com.mojang.logging downloaded!".to_string());
                            }
                        }
                    }
                }
            }
            if logging_path.exists() {
                log_callback(format!(
                    "[DEBUG] Adding logging from: {}",
                    logging_path.display()
                ));
                classpath.push(logging_path.to_string_lossy().to_string());
            } else {
                log_callback(format!(
                    "[ERROR] Critical library not found: {}",
                    logging_path.display()
                ));
            }
        }

        if Self::needs_legacy_authlib_override(&classpath) {
            if let Some(override_path) = self.find_legacy_authlib_override_path() {
                classpath.insert(0, override_path.to_string_lossy().to_string());
                log_callback(format!(
                    "[Skin] Added legacy authlib override for offline skin support: {}",
                    override_path.display()
                ));
            } else {
                log_callback(
                    "[WARN] Legacy authlib override missing; offline skins may fail on Minecraft 1.8-1.12"
                        .to_string(),
                );
            }
        }

        // Build classpath string AFTER all libraries are added
        // Use platform-specific classpath separator
        #[cfg(target_os = "windows")]
        let classpath_str = classpath.join(";");
        #[cfg(not(target_os = "windows"))]
        let classpath_str = classpath.join(":");

        log_callback(format!(
            "[DEBUG] actual_jar_path: {}",
            actual_jar_path.display()
        ));

        // Get main class - for inherited versions, check intermediate parent first (e.g., Fabric)
        // then fall back to grandparent (vanilla). This handles Lapetus -> Fabric -> Vanilla chain.
        let main_class = version_json["mainClass"]
            .as_str()
            .or_else(|| {
                // Try intermediate parent (Fabric) first - this has the modded main class
                if let Some(ref intermediate) = intermediate_parent_json {
                    intermediate["mainClass"].as_str()
                } else {
                    None
                }
            })
            .or_else(|| {
                // Fall back to parent/grandparent JSON
                if let Some(ref parent) = parent_json {
                    parent["mainClass"].as_str()
                } else {
                    None
                }
            })
            .ok_or("Could not find main class")?;

        // Get asset index - for modded versions, get from parent version
        let assets = if let Some(asset_index) = version_json["assets"].as_str() {
            asset_index.to_string()
        } else if let Some(ref parent) = parent_json {
            // Get asset index from parent version JSON
            parent["assets"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| inherits_from.unwrap_or(&options.version_id).to_string())
        } else {
            // Try to extract from version ID for non-inherited versions
            let mc_version = options
                .version_id
                .split("-forge")
                .next()
                .or_else(|| options.version_id.split("-fabric").next())
                .or_else(|| options.version_id.split("-quilt").next())
                .unwrap_or(&options.version_id);
            mc_version.to_string()
        };

        let launch_display_name = Self::build_launch_display_name(&options.version_id);
        let launch_version_type = Self::build_launch_version_type(&options.version_id);

        // Build arguments
        let mut args = vec![];

        // Add Dragon Skins JVM agent for custom skin support
        if let Err(error) = self.ensure_agent_installed() {
            log_callback(format!(
                "[DragonSkins] Agent install check failed: {}",
                error
            ));
        }
        let agent_path = self
            .game_dir
            .join("DragonSkins")
            .join("dragon-skins-agent.jar");
        if agent_path.exists() {
            args.push("-Dnet.bytebuddy.experimental=true".to_string());
            args.push(format!("-javaagent:{}", agent_path.to_string_lossy()));
            log_callback("[DragonSkins] JVM agent loaded".to_string());
        } else {
            log_callback("[DragonSkins] Agent not found, custom skins disabled".to_string());
        }

        // Detect LWJGL version to use correct flags (use parent version for modded)
        let lwjgl_version = Self::detect_lwjgl_version(effective_version_json);

        log_callback(format!("[INFO] LWJGL version: {}", lwjgl_version));

        args.push(format!("-Ddragon.window.title={}", launch_display_name));

        #[cfg(target_os = "windows")]
        {
            let version_natives_dir = self.natives_dir.join(mc_version_for_natives);
            if !Self::has_openal_natives(&version_natives_dir) {
                log_callback(
                    "[WARN] OpenAL natives still missing before launch, running final audio recovery..."
                        .to_string(),
                );
                let recovered = self
                    .recover_windows_openal_from_known_archives(&version_natives_dir, java_arch);
                if recovered > 0 {
                    log_callback(format!(
                        "[INFO] Final recovery extracted {} audio native file(s)",
                        recovered
                    ));
                }
            }
            log_callback(format!(
                "[DEBUG] Windows audio natives: {}",
                Self::describe_windows_openal_files(&version_natives_dir)
            ));
        }

        // macOS-specific JVM arguments
        #[cfg(target_os = "macos")]
        {
            if lwjgl_version >= 3 {
                // LWJGL 3 requires -XstartOnFirstThread on macOS
                args.push("-XstartOnFirstThread".to_string());
            }
            // For LWJGL 2, we DON'T use -XstartOnFirstThread as it can cause window issues

            // Critical for macOS window visibility
            args.push("-Djava.awt.headless=false".to_string());
            args.push("-Dapple.awt.UIElement=false".to_string());
            args.push(format!(
                "-Dapple.awt.application.name={}",
                launch_display_name
            ));

            // For LWJGL 2, we need to use AWT properly
            if lwjgl_version < 3 {
                args.push("-Dapple.laf.useScreenMenuBar=true".to_string());
                args.push(format!(
                    "-Dcom.apple.mrj.application.apple.menu.about.name={}",
                    launch_display_name
                ));
            }

            // LWJGL 3 specific settings for macOS
            if lwjgl_version >= 3 {
                args.push("-Dorg.lwjgl.glfw.checkThread0=false".to_string());
                args.push("-Dorg.lwjgl.util.NoChecks=true".to_string());
            }
        }

        // Platform-specific classpath separator
        #[cfg(target_os = "windows")]
        let classpath_separator = ";";
        #[cfg(not(target_os = "windows"))]
        let classpath_separator = ":";

        let library_dir = self.libraries_dir.to_string_lossy().to_string();
        let primary_jar = actual_jar_path.to_string_lossy().to_string();
        let primary_jar_name = actual_jar_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("{}.jar", options.version_id));
        let natives_dir_str = self
            .natives_dir
            .join(mc_version_for_natives)
            .to_string_lossy()
            .to_string();
        let game_dir_str = self.game_dir.to_string_lossy().to_string();

        let process_jvm_arg_str = |arg_str: &str, source_version_id: &str| -> Option<String> {
            #[cfg(target_os = "windows")]
            {
                if arg_str.contains("XstartOnFirstThread")
                    || arg_str.contains("apple.")
                    || arg_str.contains("osx")
                {
                    return None;
                }
            }

            Some(
                arg_str
                    .replace("${library_directory}", &library_dir)
                    .replace("${classpath_separator}", classpath_separator)
                    .replace("${classpath}", &classpath_str)
                    .replace("${version_name}", source_version_id)
                    .replace("${launcher_name}", &launch_display_name)
                    .replace("${launcher_version}", "1.0")
                    .replace("${primary_jar}", &primary_jar)
                    .replace("${primary_jar_name}", &primary_jar_name)
                    .replace("${game_directory}", &game_dir_str)
                    .replace("${natives_directory}", &natives_dir_str)
                    .replace("${version_type}", &launch_version_type),
            )
        };

        let mut add_jvm_args_from_json = |source_json: &serde_json::Value, source_label: &str| {
            if let Some(arguments) = source_json.get("arguments") {
                if let Some(jvm_args) = arguments.get("jvm").and_then(|j| j.as_array()) {
                    if !jvm_args.is_empty() {
                        log_callback(format!("[INFO] Adding {} JVM arguments...", source_label));
                    }

                    let source_version_id =
                        source_json["id"].as_str().unwrap_or(&options.version_id);

                    for arg in jvm_args {
                        if let Some(arg_str) = arg.as_str() {
                            if let Some(processed) = process_jvm_arg_str(arg_str, source_version_id)
                            {
                                args.push(processed);
                            }
                        } else if arg.is_object() {
                            let mut allowed = true;
                            if let Some(rules) = arg.get("rules").and_then(|r| r.as_array()) {
                                allowed = false;
                                for rule in rules {
                                    let action = rule["action"].as_str().unwrap_or("allow");
                                    if let Some(os) = rule.get("os") {
                                        if let Some(name) = os["name"].as_str() {
                                            #[cfg(target_os = "windows")]
                                            let matches = name == "windows";
                                            #[cfg(target_os = "macos")]
                                            let matches = name == "osx";
                                            #[cfg(target_os = "linux")]
                                            let matches = name == "linux";

                                            if matches && action == "allow" {
                                                allowed = true;
                                            } else if matches && action == "disallow" {
                                                allowed = false;
                                                break;
                                            }
                                        }
                                    } else if action == "allow" {
                                        allowed = true;
                                    }
                                }
                            }

                            if allowed {
                                if let Some(value) = arg.get("value") {
                                    if let Some(val_str) = value.as_str() {
                                        if let Some(processed) =
                                            process_jvm_arg_str(val_str, source_version_id)
                                        {
                                            args.push(processed);
                                        }
                                    } else if let Some(val_arr) = value.as_array() {
                                        for val in val_arr {
                                            if let Some(val_str) = val.as_str() {
                                                if let Some(processed) =
                                                    process_jvm_arg_str(val_str, source_version_id)
                                                {
                                                    args.push(processed);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        add_jvm_args_from_json(&version_json, "version");
        if let Some(ref intermediate) = intermediate_parent_json {
            add_jvm_args_from_json(intermediate, "inherited loader");
        }

        // Dragon client uses standard Fabric loader - no special JVM args needed
        // (Dragon is just Fabric with UI branding)

        // Core memory settings
        args.extend([
            format!("-Xmx{}M", options.memory_max),
            format!("-Xms{}M", options.memory_min),
        ]);

        // POTATO PC OPTIMIZATIONS - Balanced performance tuning for low-end systems
        // These settings prioritize stability and FPS without breaking compatibility
        args.extend([
            // Garbage Collection - Optimized G1GC for minimal pause times
            "-XX:+UseG1GC".to_string(),
            "-XX:+ParallelRefProcEnabled".to_string(),
            "-XX:MaxGCPauseMillis=130".to_string(),
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
            "-XX:G1NewSizePercent=28".to_string(),
            "-XX:G1MaxNewSizePercent=50".to_string(),
            "-XX:G1HeapRegionSize=16M".to_string(),
            "-XX:G1ReservePercent=15".to_string(),
            "-XX:G1HeapWastePercent=5".to_string(),
            "-XX:G1MixedGCCountTarget=3".to_string(),
            "-XX:InitiatingHeapOccupancyPercent=10".to_string(),
            "-XX:G1MixedGCLiveThresholdPercent=85".to_string(),
            "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
            "-XX:SurvivorRatio=32".to_string(),
            "-XX:+PerfDisableSharedMem".to_string(),
            "-XX:MaxTenuringThreshold=1".to_string(),
            // FAST LAUNCH - Compilation and class loading
            "-XX:+AlwaysPreTouch".to_string(),
            "-XX:+UseStringDeduplication".to_string(),
            "-XX:+UseCompressedOops".to_string(),
            "-XX:+UseCompressedClassPointers".to_string(),
            // TIERED COMPILATION - Balanced startup and performance
            "-XX:+TieredCompilation".to_string(),
            // MEMORY OPTIMIZATIONS - Reduce memory footprint
            "-XX:CompressedClassSpaceSize=256M".to_string(),
            "-XX:ReservedCodeCacheSize=256M".to_string(),
        ]);

        let natives_dir_arg = self
            .natives_dir
            .join(mc_version_for_natives)
            .to_string_lossy()
            .to_string();

        // System properties for Minecraft/LWJGL - Performance optimizations
        args.extend([
            format!("-Djava.library.path={}", natives_dir_arg),
            format!("-Dorg.lwjgl.librarypath={}", natives_dir_arg),
            "-Dminecraft.launcher.brand=trapgaint-launcher".to_string(),
            "-Dminecraft.launcher.version=1.0".to_string(),
            // LWJGL PERFORMANCE - Safe optimizations
            "-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true".to_string(),
            "-Dorg.lwjgl.util.NoChecks=true".to_string(),
            "-Dorg.lwjgl.util.Debug=false".to_string(),
            // RENDERING - Reduce overhead
            "-Dsun.java2d.opengl=false".to_string(),
            "-Djava.net.preferIPv4Stack=true".to_string(),
            // FORGE/FABRIC - Skip validation for faster loading
            "-Dfml.ignoreInvalidMinecraftCertificates=true".to_string(),
            "-Dfml.ignorePatchDiscrepancies=true".to_string(),
        ]);
        if lwjgl_version < 3 {
            args.push(format!(
                "-Dnet.java.games.input.librarypath={}",
                natives_dir_arg
            ));
        }
        #[cfg(target_os = "windows")]
        {
            // LWJGL2 commonly expects explicit OpenAL32/OpenAL64 names on Windows.
            if lwjgl_version < 3 {
                let version_natives_dir = self.natives_dir.join(mc_version_for_natives);
                let openal_name =
                    Self::choose_windows_lwjgl2_openal_libname(&version_natives_dir, java_arch);
                if let Some(openal_name) = openal_name {
                    args.push(format!("-Dorg.lwjgl.openal.libname={}", openal_name));
                }
            }
        }

        // Add classpath - CRITICAL for Forge/Fabric to find their bootstrap classes
        // This must come after all JVM arguments but before the main class
        if !classpath.is_empty() {
            args.push("-cp".to_string());
            args.push(classpath_str.clone());
            log_callback(format!(
                "[DEBUG] Classpath added with {} entries",
                classpath.len()
            ));
        } else {
            log_callback(
                "[WARN] Classpath is empty - this will likely cause launch failure!".to_string(),
            );
        }

        // Use provided uuid/access_token or defaults for offline mode
        let mut uuid = options.uuid.clone().unwrap_or_else(|| {
            // Generate a random offline UUID
            uuid::Uuid::new_v4().to_string().replace("-", "")
        });
        let access_token = options
            .access_token
            .clone()
            .unwrap_or_else(|| "0".to_string());
        let use_msa_user_type = {
            let base_version = Self::extract_base_minecraft_version(mc_version_for_java);
            let (major, minor, _) = Self::parse_mc_version_numbers(&base_version);
            major > 1 || (major == 1 && minor >= 21)
        };
        // Older clients (pre-1.21) are more reliable with legacy user type.
        // 1.21+ expects modern account semantics and tolerates msa consistently.
        let user_type = if use_msa_user_type { "msa" } else { "legacy" };
        let mut user_properties = "{}".to_string();
        let mut profile_properties = "{}".to_string();
        let mut local_session_profile_bridge: Option<serde_json::Value> = None;
        let mut local_services_profile_bridge: Option<serde_json::Value> = None;
        let mut local_profile_property_keys: Vec<serde_json::Value> = Vec::new();
        let mut local_player_certificate_keys: Vec<serde_json::Value> = Vec::new();
        let mut offline_player_certificate_payload: Option<serde_json::Value> = None;
        let mut selected_skin_uuid_alias: Option<String> = None;
        let mut dragon_agent_textures_value: Option<String> = None;
        let mut dragon_agent_textures_signature: Option<String> = None;
        let mut dragon_agent_local_skin_hash: Option<String> = None;
        let mut dragon_agent_local_skin_url: Option<String> = None;
        let mut dragon_agent_local_cape_hash: Option<String> = None;
        let mut dragon_agent_local_cape_url: Option<String> = None;
        // Localhost texture URLs are not consistently accepted by all authlib/loader combos.
        // Keep cache-based textures.minecraft.net payloads as the default universal path.
        // Set LAPETUS_LOCAL_TEXTURE_URLS=1 only for targeted testing.
        let use_local_texture_urls = std::env::var("LAPETUS_LOCAL_TEXTURE_URLS")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        let uses_dragon_skin_pipeline =
            options.version_id.starts_with("dragon-") || options.version_id.starts_with("lapetus-");
        if uses_dragon_skin_pipeline {
            log_callback(
                "[Skin] Dragon profile detected; enabling universal authlib skin bridge fallback"
                    .to_string(),
            );
        }
        {
            let selected_skin_username = options
                .skin_username
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());
            if options.is_offline {
                if let Some(skin_username) = selected_skin_username.as_deref() {
                    if !skin_username.eq_ignore_ascii_case(&options.username) {
                        match self.resolve_mojang_uuid_for_username(skin_username).await {
                            Ok(Some(resolved_uuid)) => {
                                selected_skin_uuid_alias =
                                    Some(resolved_uuid.trim().replace('-', "").to_lowercase());
                                log_callback(format!(
                                    "[Skin] Added selected skin UUID alias for '{}': {}",
                                    skin_username,
                                    selected_skin_uuid_alias.as_deref().unwrap_or_default()
                                ));
                            }
                            Ok(None) => {}
                            Err(error) => {
                                log_callback(format!(
                                    "[Skin] Failed to resolve selected skin UUID alias for '{}': {}",
                                    skin_username, error
                                ));
                            }
                        }
                    }
                }
            }

            if options.is_offline {
                uuid = Self::offline_uuid_for_username(&options.username);
                log_callback(format!(
                    "[Skin] Using deterministic offline UUID for '{}': {}",
                    options.username, uuid
                ));
            } else if selected_skin_username.is_some() {
                log_callback(
                    "[Skin] Applying selected skin/cape pipeline for online account".to_string(),
                );
            }

            let mut selected_skin_url: Option<String> = None;
            let mut selected_cape_url: Option<String> = None;
            let mut skin_model = "default".to_string();
            let mut selected_cape_path: Option<PathBuf> = None;

            if let Ok(Some(skin)) = self.get_dragon_skin(&options.username) {
                skin_model = skin.model;
                if let Some(cape_path) = skin.cape_path {
                    if !cape_path.trim().is_empty() {
                        selected_cape_path = Some(PathBuf::from(cape_path));
                    }
                }
            }
            if let Some(skin_username) = selected_skin_username.as_deref() {
                if let Ok(Some(skin)) = self.get_dragon_skin(skin_username) {
                    if skin_model == "default" {
                        skin_model = skin.model;
                    }
                    if selected_cape_path.is_none() {
                        if let Some(cape_path) = skin.cape_path {
                            if !cape_path.trim().is_empty() {
                                selected_cape_path = Some(PathBuf::from(cape_path));
                            }
                        }
                    }
                }
            }

            let mut skin_candidates: Vec<PathBuf> = Vec::new();
            let username_skin_file = format!("{}.png", options.username);
            skin_candidates.push(
                self.game_dir
                    .join("DragonSkins")
                    .join("skins")
                    .join(&username_skin_file),
            );
            skin_candidates.push(self.game_dir.join("skins").join(&username_skin_file));
            skin_candidates.push(
                self.game_dir
                    .join("config")
                    .join("offlineskins")
                    .join(&username_skin_file),
            );

            if is_modded {
                let instance_dir = self.game_dir.join("instances").join(&options.version_id);
                skin_candidates.push(
                    instance_dir
                        .join("DragonSkins")
                        .join("skins")
                        .join(&username_skin_file),
                );
                skin_candidates.push(instance_dir.join("skins").join(&username_skin_file));
                skin_candidates.push(
                    instance_dir
                        .join("config")
                        .join("offlineskins")
                        .join(&username_skin_file),
                );
            }

            if let Some(skin_username) = selected_skin_username.as_deref() {
                if !skin_username.eq_ignore_ascii_case(&options.username) {
                    let selected_skin_file = format!("{}.png", skin_username);
                    skin_candidates.push(
                        self.game_dir
                            .join("DragonSkins")
                            .join("skins")
                            .join(&selected_skin_file),
                    );
                    if is_modded {
                        let instance_dir =
                            self.game_dir.join("instances").join(&options.version_id);
                        skin_candidates.push(
                            instance_dir
                                .join("DragonSkins")
                                .join("skins")
                                .join(&selected_skin_file),
                        );
                    }
                }
            }

            let mut selected_skin_bytes: Option<Vec<u8>> = None;
            for candidate in skin_candidates {
                if !candidate.exists() {
                    continue;
                }
                match std::fs::read(&candidate) {
                    Ok(bytes) if !bytes.is_empty() => {
                        log_callback(format!(
                            "[Skin] Using offline skin file: {}",
                            candidate.display()
                        ));
                        selected_skin_bytes = Some(bytes);
                        break;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        log_callback(format!(
                            "[Skin] Failed to read skin file '{}': {}",
                            candidate.display(),
                            error
                        ));
                    }
                }
            }

            if selected_skin_bytes.is_none() {
                if let Some(skin_username) = selected_skin_username.as_deref() {
                    let url = format!("https://mc-heads.net/skin/{}", skin_username);
                    match reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(8))
                        .build()
                    {
                        Ok(client) => match client.get(&url).send().await {
                            Ok(response) if response.status().is_success() => {
                                match response.bytes().await {
                                    Ok(bytes) if !bytes.is_empty() => {
                                        log_callback(format!(
                                            "[Skin] Downloaded fallback skin from mc-heads for '{}'",
                                            skin_username
                                        ));
                                        selected_skin_bytes = Some(bytes.to_vec());
                                    }
                                    Ok(_) => {}
                                    Err(error) => {
                                        log_callback(format!(
                                            "[Skin] Failed to read mc-heads skin bytes: {}",
                                            error
                                        ));
                                    }
                                }
                            }
                            Ok(response) => {
                                log_callback(format!(
                                    "[Skin] mc-heads skin lookup returned {} for '{}'",
                                    response.status(),
                                    skin_username
                                ));
                            }
                            Err(error) => {
                                log_callback(format!(
                                    "[Skin] mc-heads skin lookup failed for '{}': {}",
                                    skin_username, error
                                ));
                            }
                        },
                        Err(error) => {
                            log_callback(format!(
                                "[Skin] Failed to build fallback skin HTTP client: {}",
                                error
                            ));
                        }
                    }
                }
            }

            if let Some(skin_bytes) = selected_skin_bytes {
                let skin_hash = Self::sha1_hex_bytes(&skin_bytes);
                let local_skin_path = self
                    .game_dir
                    .join("DragonSkins")
                    .join("skins")
                    .join(format!("{}.png", options.username));
                if let Some(parent) = local_skin_path.parent() {
                    if let Err(error) = std::fs::create_dir_all(parent) {
                        log_callback(format!(
                            "[Skin] Failed to create local skin directory '{}': {}",
                            parent.display(),
                            error
                        ));
                    }
                }
                if let Err(error) = std::fs::write(&local_skin_path, &skin_bytes) {
                    log_callback(format!(
                        "[Skin] Failed to write local skin file '{}': {}",
                        local_skin_path.display(),
                        error
                    ));
                } else {
                    dragon_agent_local_skin_hash = Some(skin_hash.clone());
                    dragon_agent_local_skin_url = Some(format!(
                        "http://127.0.0.1:25585/skins/{}.png",
                        options.username
                    ));
                }

                if use_local_texture_urls {
                    if dragon_agent_local_skin_url.is_some() {
                        selected_skin_url = Some(format!(
                            "http://127.0.0.1:25585/skins/{}.png",
                            options.username
                        ));
                        log_callback(format!(
                            "[Skin] Using local skin URL for modern authlib: {}",
                            selected_skin_url.clone().unwrap_or_default()
                        ));
                    }
                } else {
                    match self.prime_vanilla_skin_cache(&skin_bytes) {
                        Ok(texture_url) => {
                            selected_skin_url = Some(texture_url);
                        }
                        Err(error) => {
                            log_callback(format!(
                                "[Skin] Failed to prime vanilla skin cache: {}",
                                error
                            ));
                        }
                    }
                }
            }

            let mut selected_cape_bytes: Option<Vec<u8>> = None;
            let has_explicit_cape_selection = self.has_selected_cape_config();
            let selected_cape_index = match self.get_selected_cape_index() {
                Ok(value) => value,
                Err(error) => {
                    log_callback(format!(
                        "[Cape] Failed to read selected cape config: {}",
                        error
                    ));
                    None
                }
            };

            // Always prioritize explicit preset selection to avoid stale cached capes overriding UI.
            if let Some(cape_index) = selected_cape_index {
                if let Some(preset_cape_path) = self.find_preset_cape_path(cape_index) {
                    match std::fs::read(&preset_cape_path) {
                        Ok(bytes) if !bytes.is_empty() => {
                            log_callback(format!(
                                "[Cape] Loaded selected cape preset {} from {}",
                                cape_index,
                                preset_cape_path.display()
                            ));
                            selected_cape_bytes = Some(bytes);
                        }
                        Ok(_) => {}
                        Err(error) => {
                            log_callback(format!(
                                "[Cape] Failed to read selected cape preset '{}': {}",
                                preset_cape_path.display(),
                                error
                            ));
                        }
                    }
                } else {
                    log_callback(format!(
                        "[Cape] Selected cape preset {} not found on disk",
                        cape_index
                    ));
                }
            }

            // Fallback only when there is no explicit selection config.
            if selected_cape_bytes.is_none() && !has_explicit_cape_selection {
                let mut cape_candidates: Vec<PathBuf> = Vec::new();
                if let Some(cape_path) = selected_cape_path {
                    cape_candidates.push(cape_path);
                }
                let username_cape_file = format!("{}.png", options.username);
                cape_candidates.push(
                    self.game_dir
                        .join("DragonSkins")
                        .join("capes")
                        .join(&username_cape_file),
                );
                if is_modded {
                    let instance_dir = self.game_dir.join("instances").join(&options.version_id);
                    cape_candidates.push(
                        instance_dir
                            .join("DragonSkins")
                            .join("capes")
                            .join(&username_cape_file),
                    );
                }
                if let Some(skin_username) = selected_skin_username.as_deref() {
                    if !skin_username.eq_ignore_ascii_case(&options.username) {
                        let selected_cape_file = format!("{}.png", skin_username);
                        cape_candidates.push(
                            self.game_dir
                                .join("DragonSkins")
                                .join("capes")
                                .join(&selected_cape_file),
                        );
                        if is_modded {
                            let instance_dir =
                                self.game_dir.join("instances").join(&options.version_id);
                            cape_candidates.push(
                                instance_dir
                                    .join("DragonSkins")
                                    .join("capes")
                                    .join(&selected_cape_file),
                            );
                        }
                    }
                }

                for candidate in cape_candidates {
                    if !candidate.exists() {
                        continue;
                    }
                    match std::fs::read(&candidate) {
                        Ok(bytes) if !bytes.is_empty() => {
                            log_callback(format!(
                                "[Cape] Using offline cape file: {}",
                                candidate.display()
                            ));
                            selected_cape_bytes = Some(bytes);
                            break;
                        }
                        Ok(_) => {}
                        Err(error) => {
                            log_callback(format!(
                                "[Cape] Failed to read cape file '{}': {}",
                                candidate.display(),
                                error
                            ));
                        }
                    }
                }
            } else if selected_cape_bytes.is_none() && has_explicit_cape_selection {
                log_callback(
                    "[Cape] Explicit cape selection is empty; skipping cached cape fallback"
                        .to_string(),
                );
            }

            if let Some(cape_bytes) = selected_cape_bytes {
                let cape_bytes = match Self::normalize_cape_texture_bytes(&cape_bytes) {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        log_callback(format!(
                            "[Cape] Failed to normalize cape texture bytes: {}",
                            error
                        ));
                        cape_bytes
                    }
                };
                let cape_hash = Self::sha1_hex_bytes(&cape_bytes);
                let local_cape_path = self
                    .game_dir
                    .join("DragonSkins")
                    .join("capes")
                    .join(format!("{}.png", options.username));
                if let Some(parent) = local_cape_path.parent() {
                    if let Err(error) = std::fs::create_dir_all(parent) {
                        log_callback(format!(
                            "[Cape] Failed to create local cape directory '{}': {}",
                            parent.display(),
                            error
                        ));
                    }
                }
                if let Err(error) = std::fs::write(&local_cape_path, &cape_bytes) {
                    log_callback(format!(
                        "[Cape] Failed to write local cape file '{}': {}",
                        local_cape_path.display(),
                        error
                    ));
                } else {
                    dragon_agent_local_cape_hash = Some(cape_hash.clone());
                    dragon_agent_local_cape_url = Some(format!(
                        "http://127.0.0.1:25585/capes/{}.png",
                        options.username
                    ));
                }

                if use_local_texture_urls {
                    if dragon_agent_local_cape_url.is_some() {
                        selected_cape_url = Some(format!(
                            "http://127.0.0.1:25585/capes/{}.png",
                            options.username
                        ));
                        log_callback(format!(
                            "[Cape] Using local cape URL for modern authlib: {}",
                            selected_cape_url.clone().unwrap_or_default()
                        ));
                    }
                } else {
                    match self.prime_vanilla_texture_cache(&cape_bytes) {
                        Ok(texture_url) => {
                            selected_cape_url = Some(texture_url);
                        }
                        Err(error) => {
                            log_callback(format!(
                                "[Cape] Failed to prime vanilla cape cache: {}",
                                error
                            ));
                        }
                    }
                }
            }

            if selected_skin_url.is_some() || selected_cape_url.is_some() {
                let mut textures = serde_json::Map::new();
                if let Some(skin_url) = selected_skin_url.clone() {
                    let mut skin_texture = serde_json::json!({ "url": skin_url });
                    if skin_model.eq_ignore_ascii_case("alex")
                        || skin_model.eq_ignore_ascii_case("slim")
                    {
                        skin_texture["metadata"] = serde_json::json!({ "model": "slim" });
                    }
                    textures.insert("SKIN".to_string(), skin_texture);
                }
                if let Some(cape_url) = selected_cape_url.clone() {
                    textures.insert("CAPE".to_string(), serde_json::json!({ "url": cape_url }));
                }

                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0);
                let profile_id = uuid.replace('-', "");
                let textures_payload = serde_json::json!({
                    "timestamp": now_ms,
                    "profileId": profile_id,
                    "profileName": options.username.clone(),
                    "textures": serde_json::Value::Object(textures)
                });
                // Sign local textures and publish the verifier key via /publickeys.
                // This improves compatibility with servers that enforce secure
                // profile property validation.
                let should_sign_textures = true;
                let encoded_textures =
                    general_purpose::STANDARD.encode(textures_payload.to_string());
                dragon_agent_textures_value = Some(encoded_textures.clone());
                if should_sign_textures {
                    match Self::sign_textures_property_value(&encoded_textures) {
                        Ok((signature_b64, public_key_b64)) => {
                            dragon_agent_textures_signature = Some(signature_b64.clone());
                            local_profile_property_keys.push(serde_json::json!({
                                "publicKey": public_key_b64
                            }));
                            log_callback(
                                "[Skin] Signed local textures property for secure multiplayer profile lookup"
                                    .to_string(),
                            );
                        }
                        Err(error) => {
                            log_callback(format!(
                                "[Skin] Failed to sign local textures property: {}",
                                error
                            ));
                        }
                    }
                } else {
                    log_callback(
                        "[Skin] Using unsigned local textures profile for offline multiplayer compatibility"
                            .to_string(),
                    );
                }
                let textures_property_map = serde_json::json!({
                    "textures": [encoded_textures]
                })
                .to_string();
                user_properties = textures_property_map.clone();
                profile_properties = textures_property_map;
                let mut textures_property = serde_json::json!({
                    "name": "textures",
                    "value": encoded_textures
                });
                if let Some(signature) = dragon_agent_textures_signature.clone() {
                    textures_property["signature"] = serde_json::json!(signature);
                }
                let properties_array = vec![textures_property];
                local_session_profile_bridge = Some(serde_json::json!({
                    "id": profile_id,
                    "name": options.username.clone(),
                    "properties": properties_array,
                    "profileActions": []
                }));
                let skin_variant = if skin_model.eq_ignore_ascii_case("alex")
                    || skin_model.eq_ignore_ascii_case("slim")
                {
                    "SLIM"
                } else {
                    "CLASSIC"
                };
                let mut skins_array: Vec<serde_json::Value> = Vec::new();
                let mut capes_array: Vec<serde_json::Value> = Vec::new();
                if let Some(skin_url) = selected_skin_url {
                    skins_array.push(serde_json::json!({
                        "id": "dragon-custom-skin",
                        "state": "ACTIVE",
                        "url": skin_url,
                        "variant": skin_variant
                    }));
                }
                if let Some(cape_url) = selected_cape_url {
                    capes_array.push(serde_json::json!({
                        "id": "dragon-custom-cape",
                        "state": "ACTIVE",
                        "url": cape_url,
                        "alias": "dragon"
                    }));
                }
                local_services_profile_bridge = Some(serde_json::json!({
                    "id": profile_id,
                    "name": options.username.clone(),
                    "skins": skins_array,
                    "capes": capes_array
                }));
                log_callback(
                    "[Skin] Offline skin/cape profile injected for client-side rendering"
                        .to_string(),
                );
            }

            // If no custom skin/cape was found but we're offline,
            // still create a minimal session bridge so the authlib host redirect activates.
            // This is required for offline UUID compatibility. Online users without a selected
            // skin/cape should use the default Mojang path to avoid unnecessary bridge hooks.
            if local_session_profile_bridge.is_none() && options.is_offline {
                let profile_id = uuid.replace('-', "");
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0);
                let textures_payload = serde_json::json!({
                    "timestamp": now_ms,
                    "profileId": profile_id,
                    "profileName": options.username.clone(),
                    "textures": {}
                });
                let encoded_textures =
                    general_purpose::STANDARD.encode(textures_payload.to_string());

                let textures_property = serde_json::json!({
                    "name": "textures",
                    "value": encoded_textures
                });
                local_session_profile_bridge = Some(serde_json::json!({
                    "id": profile_id,
                    "name": options.username.clone(),
                    "properties": [textures_property],
                    "profileActions": []
                }));
                local_services_profile_bridge = Some(serde_json::json!({
                    "id": profile_id,
                    "name": options.username.clone(),
                    "skins": [],
                    "capes": []
                }));
                log_callback(
                    "[Skin] Created minimal unsigned session bridge for offline/dragon multiplayer compatibility"
                        .to_string(),
                );
            }
        }

        if options.is_offline && local_session_profile_bridge.is_some() {
            match Self::build_offline_player_certificate_response(&uuid) {
                Ok((payload, verification_key)) => {
                    offline_player_certificate_payload = Some(payload);
                    local_player_certificate_keys.push(verification_key);
                    log_callback(
                        "[Skin] Generated offline profile key certificate for multiplayer compatibility"
                            .to_string(),
                    );
                }
                Err(error) => {
                    log_callback(format!(
                        "[Skin] Failed to generate offline profile key certificate: {}",
                        error
                    ));
                }
            }
        }

        // Bridge Authlib session profile lookup locally so selected skin is returned
        // through the same code path used for premium profiles.
        // Modern authlib reads minecraft.api.session.host directly; authlib 1.x
        // versions use the legacy classpath override injected above.
        if let Some(profile_template) = local_session_profile_bridge {
            use warp::Filter;
            use warp::Reply;
            let profile_template = Arc::new(profile_template);
            let bridge_log_path = Arc::new(self.game_dir.join("logs").join("skin-bridge.log"));
            if let Some(parent) = bridge_log_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let has_local_services_profile_bridge = local_services_profile_bridge.is_some();
            let own_profile_id = uuid.replace('-', "").to_lowercase();
            let mut local_profile_id_aliases: Vec<String> = Vec::new();
            local_profile_id_aliases.push(own_profile_id.clone());
            if let Some(original_uuid) = options.uuid.as_ref() {
                let normalized_original = original_uuid.trim().replace('-', "").to_lowercase();
                if normalized_original.len() == 32
                    && normalized_original.chars().all(|ch| ch.is_ascii_hexdigit())
                {
                    local_profile_id_aliases.push(normalized_original);
                }
            }
            if options.is_offline {
                local_profile_id_aliases
                    .push(Self::offline_uuid_for_username(&options.username).to_lowercase());
            }
            if let Some(selected_alias) = selected_skin_uuid_alias.as_ref() {
                let normalized_selected = selected_alias.trim().replace('-', "").to_lowercase();
                if normalized_selected.len() == 32
                    && normalized_selected.chars().all(|ch| ch.is_ascii_hexdigit())
                {
                    local_profile_id_aliases.push(normalized_selected);
                }
            }
            local_profile_id_aliases.sort();
            local_profile_id_aliases.dedup();
            let is_offline_session = options.is_offline;
            let session_proxy_client = Arc::new(reqwest::Client::new());
            let local_profile_property_keys = Arc::new(local_profile_property_keys);
            let local_player_certificate_keys = Arc::new(local_player_certificate_keys);
            let offline_player_certificate_payload = Arc::new(offline_player_certificate_payload);
            let local_profile_id_aliases = Arc::new(local_profile_id_aliases);
            let services_profile_template =
                Arc::new(local_services_profile_bridge.unwrap_or_else(|| {
                    serde_json::json!({
                        "id": uuid.replace('-', ""),
                        "name": options.username.clone(),
                        "skins": [],
                        "capes": []
                    })
                }));
            let optional_query = warp::query::raw()
                .map(Some)
                .or(warp::any().map(|| None))
                .unify();

            let local_profile_name = Arc::new(options.username.clone());

            let build_profile_reply = {
                let profile_template = profile_template.clone();
                let bridge_log_path = bridge_log_path.clone();
                let own_profile_id = own_profile_id.clone();
                let local_profile_id_aliases = local_profile_id_aliases.clone();
                let session_proxy_client = session_proxy_client.clone();
                let local_profile_name = local_profile_name.clone();
                move |requested_uuid: String, raw_query: Option<String>| {
                    let profile_template = profile_template.clone();
                    let bridge_log_path = bridge_log_path.clone();
                    let own_profile_id = own_profile_id.clone();
                    let local_profile_id_aliases = local_profile_id_aliases.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    let local_profile_name = local_profile_name.clone();
                    async move {
                        let normalized = requested_uuid.trim().replace('-', "").to_lowercase();
                        let normalized_valid = normalized.len() == 32
                            && normalized.chars().all(|ch| ch.is_ascii_hexdigit());
                        let requested_segment = if normalized_valid {
                            normalized.as_str()
                        } else {
                            requested_uuid.as_str()
                        };

                        let query_suffix = raw_query
                            .filter(|value| !value.trim().is_empty())
                            .map(|value| format!("?{}", value))
                            .unwrap_or_default();

                        Self::append_skin_bridge_log(
                            bridge_log_path.as_path(),
                            &format!(
                                "GET /session/minecraft/profile/{}{}",
                                requested_segment, query_suffix
                            ),
                        );

                        // Only override the active local profile.
                        // All other UUID lookups are proxied to Mojang so multiplayer player skins remain valid.
                        let is_local_profile_request = normalized_valid
                            && local_profile_id_aliases
                                .iter()
                                .any(|candidate| candidate == &normalized);
                        if is_local_profile_request {
                            let mut response = (*profile_template).clone();
                            response["id"] = serde_json::json!(normalized);
                            if let Some(properties) = response
                                .get_mut("properties")
                                .and_then(|value| value.as_array_mut())
                            {
                                for property in properties.iter_mut() {
                                    let is_textures = property
                                        .get("name")
                                        .and_then(|value| value.as_str())
                                        .map(|name| name == "textures")
                                        .unwrap_or(false);
                                    if !is_textures {
                                        continue;
                                    }
                                    let has_signature = property
                                        .get("signature")
                                        .and_then(|value| value.as_str())
                                        .map(|value| !value.trim().is_empty())
                                        .unwrap_or(false);
                                    if let Some(value) =
                                        property.get("value").and_then(|value| value.as_str())
                                    {
                                        if let Ok(decoded) = general_purpose::STANDARD.decode(value)
                                        {
                                            if let Ok(mut decoded_json) =
                                                serde_json::from_slice::<serde_json::Value>(
                                                    &decoded,
                                                )
                                            {
                                                decoded_json["profileId"] =
                                                    serde_json::json!(normalized);
                                                decoded_json["profileName"] = serde_json::json!(
                                                    (*local_profile_name).clone()
                                                );
                                                let now_ms = std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .map(|duration| duration.as_millis() as u64)
                                                    .unwrap_or(0);
                                                decoded_json["timestamp"] =
                                                    serde_json::json!(now_ms);

                                                if let Ok(reencoded) =
                                                    serde_json::to_string(&decoded_json)
                                                {
                                                    let reencoded_b64 =
                                                        general_purpose::STANDARD.encode(reencoded);
                                                    property["value"] =
                                                        serde_json::json!(reencoded_b64.clone());

                                                    if has_signature {
                                                        match Self::sign_textures_property_value(
                                                            &reencoded_b64,
                                                        ) {
                                                            Ok((signature_b64, _)) => {
                                                                property["signature"] = serde_json::json!(
                                                                    signature_b64
                                                                );
                                                            }
                                                            Err(error) => {
                                                                if let Some(property_obj) =
                                                                    property.as_object_mut()
                                                                {
                                                                    property_obj
                                                                        .remove("signature");
                                                                }
                                                                Self::append_skin_bridge_log(
                                                                    bridge_log_path.as_path(),
                                                                    &format!(
                                                                        "[WARN] Failed to re-sign local textures for alias {}: {}",
                                                                        normalized, error
                                                                    ),
                                                                );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                            let properties_len = response
                                .get("properties")
                                .and_then(|value| value.as_array())
                                .map(|values| values.len())
                                .unwrap_or(0);
                            let mut textures_signature_present = false;
                            let mut textures_value_len = 0usize;
                            let mut skin_url = String::new();
                            let mut cape_url = String::new();
                            if let Some(properties) = response
                                .get("properties")
                                .and_then(|value| value.as_array())
                            {
                                for property in properties {
                                    let is_textures = property
                                        .get("name")
                                        .and_then(|value| value.as_str())
                                        .map(|name| name == "textures")
                                        .unwrap_or(false);
                                    if !is_textures {
                                        continue;
                                    }
                                    textures_signature_present = property
                                        .get("signature")
                                        .and_then(|value| value.as_str())
                                        .map(|value| !value.is_empty())
                                        .unwrap_or(false);
                                    if let Some(value) =
                                        property.get("value").and_then(|value| value.as_str())
                                    {
                                        textures_value_len = value.len();
                                        if let Ok(decoded) = general_purpose::STANDARD.decode(value)
                                        {
                                            if let Ok(decoded_json) =
                                                serde_json::from_slice::<serde_json::Value>(
                                                    &decoded,
                                                )
                                            {
                                                skin_url = decoded_json
                                                    .pointer("/textures/SKIN/url")
                                                    .and_then(|value| value.as_str())
                                                    .unwrap_or("")
                                                    .to_string();
                                                cape_url = decoded_json
                                                    .pointer("/textures/CAPE/url")
                                                    .and_then(|value| value.as_str())
                                                    .unwrap_or("")
                                                    .to_string();
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                &format!(
                                    "[LOCAL_PROFILE] id={} properties={} textures_sig={} value_len={} skin_url={} cape_url={}",
                                    normalized,
                                    properties_len,
                                    textures_signature_present,
                                    textures_value_len,
                                    skin_url,
                                    cape_url
                                ),
                            );
                            return Ok::<_, std::convert::Infallible>(
                                warp::reply::json(&response).into_response(),
                            );
                        }
                        Self::append_skin_bridge_log(
                            bridge_log_path.as_path(),
                            &format!(
                                "[PROFILE_PROXY] requested={} normalized={} own_profile_id={} normalized_valid={}",
                                requested_uuid, normalized, own_profile_id, normalized_valid
                            ),
                        );

                        let upstream_url = format!(
                            "https://sessionserver.mojang.com/session/minecraft/profile/{}{}",
                            requested_segment, query_suffix
                        );
                        match session_proxy_client.get(&upstream_url).send().await {
                            Ok(upstream_response) => {
                                let status = warp::http::StatusCode::from_u16(
                                    upstream_response.status().as_u16(),
                                )
                                .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                let body = upstream_response
                                    .text()
                                    .await
                                    .unwrap_or_else(|_| "{}".to_string());
                                Ok(warp::reply::with_status(body, status).into_response())
                            }
                            Err(error) => {
                                Self::append_skin_bridge_log(
                                    bridge_log_path.as_path(),
                                    &format!(
                                        "[WARN] Session proxy failed for {}: {}",
                                        requested_segment, error
                                    ),
                                );
                                Ok(warp::reply::with_status(
                                    "{\"error\":\"session_proxy_failed\"}".to_string(),
                                    warp::http::StatusCode::BAD_GATEWAY,
                                )
                                .into_response())
                            }
                        }
                    }
                }
            };

            let profile_route = warp::path!("session" / "minecraft" / "profile" / String)
                .and(optional_query.clone())
                .and_then({
                    let build_profile_reply = build_profile_reply.clone();
                    move |requested_uuid: String, raw_query: Option<String>| {
                        build_profile_reply(requested_uuid, raw_query)
                    }
                });

            // Compatibility route for clients/libraries that query without `/session` prefix.
            let profile_route_alt = warp::path!("minecraft" / "profile" / String)
                .and(optional_query.clone())
                .and_then({
                    let build_profile_reply = build_profile_reply.clone();
                    move |requested_uuid: String, raw_query: Option<String>| {
                        build_profile_reply(requested_uuid, raw_query)
                    }
                });

            let health_route = warp::path!("session" / "health").map(|| {
                warp::reply::json(&serde_json::json!({
                    "status": "ok",
                    "service": "OfflineSkinSession"
                }))
            });

            let session_passthrough_route = warp::path("session")
                .and(warp::path("minecraft"))
                .and(warp::path::tail())
                .and(warp::method())
                .and(optional_query.clone())
                .and(warp::body::bytes())
                .and(warp::header::optional::<String>("authorization"))
                .and_then({
                    let bridge_log_path = bridge_log_path.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    let is_offline_session = is_offline_session;
                    let profile_template = profile_template.clone();
                    let own_profile_id = own_profile_id.clone();
                    move |tail: warp::path::Tail,
                          method: warp::http::Method,
                          raw_query: Option<String>,
                          body: warp::hyper::body::Bytes,
                          authorization: Option<String>| {
                        let bridge_log_path = bridge_log_path.clone();
                        let session_proxy_client = session_proxy_client.clone();
                        let profile_template = profile_template.clone();
                        let own_profile_id = own_profile_id.clone();
                        async move {
                            let tail_path = tail.as_str().trim_start_matches('/');
                            if tail_path.starts_with("profile/") {
                                return Ok::<_, std::convert::Infallible>(
                                    warp::reply::with_status(
                                        "{\"error\":\"handled_by_profile_route\"}".to_string(),
                                        warp::http::StatusCode::NOT_FOUND,
                                    )
                                    .into_response(),
                                );
                            }

                            // For offline accounts, intercept the "join" request and return
                            // HTTP 204 No Content (success) instead of proxying to Mojang.
                            // Mojang would reject the offline UUID, and that failure causes
                            // authlib to mark the session as invalid, preventing skin lookups
                            // for the local player during multiplayer.
                            if is_offline_session && tail_path == "join" {
                                Self::append_skin_bridge_log(
                                    bridge_log_path.as_path(),
                                    "POST /session/minecraft/join -> 204 (offline intercept)",
                                );
                                return Ok::<_, std::convert::Infallible>(
                                    warp::reply::with_status(
                                        String::new(),
                                        warp::http::StatusCode::NO_CONTENT,
                                    )
                                    .into_response(),
                                );
                            }

                            // For offline accounts, intercept "hasJoined" requests for the
                            // local player's UUID and return the profile with textures.
                            // This allows servers that do verify sessions to still get the
                            // player's skin data even for offline UUIDs.
                            if is_offline_session && tail_path.starts_with("hasJoined") {
                                Self::append_skin_bridge_log(
                                    bridge_log_path.as_path(),
                                    &format!("GET /session/minecraft/{}{} -> returning local profile (offline intercept)", tail_path, raw_query.as_deref().map(|q| format!("?{}", q)).unwrap_or_default()),
                                );
                                let mut response = (*profile_template).clone();
                                response["id"] = serde_json::json!(own_profile_id);
                                return Ok::<_, std::convert::Infallible>(
                                    warp::reply::json(&response).into_response(),
                                );
                            }

                            let query_suffix = raw_query
                                .filter(|value| !value.trim().is_empty())
                                .map(|value| format!("?{}", value))
                                .unwrap_or_default();
                            let upstream_url = format!(
                                "https://sessionserver.mojang.com/session/minecraft/{}{}",
                                tail_path, query_suffix
                            );
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                &format!("{} /session/minecraft/{}{}", method, tail_path, query_suffix),
                            );

                            let reqwest_method = method
                                .as_str()
                                .parse::<reqwest::Method>()
                                .unwrap_or(reqwest::Method::GET);
                            let mut upstream_request = session_proxy_client
                                .request(reqwest_method, &upstream_url)
                                .header("Content-Type", "application/json");
                            if !body.is_empty() {
                                upstream_request = upstream_request.body(body.clone());
                            }
                            if let Some(auth) = authorization {
                                upstream_request =
                                    upstream_request.header("Authorization", auth);
                            }

                            match upstream_request.send().await {
                                Ok(upstream_response) => {
                                    let status = warp::http::StatusCode::from_u16(
                                        upstream_response.status().as_u16(),
                                    )
                                    .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                    let body = upstream_response
                                        .text()
                                        .await
                                        .unwrap_or_else(|_| "{}".to_string());
                                    Ok::<_, std::convert::Infallible>(
                                        warp::reply::with_status(body, status).into_response(),
                                    )
                                }
                                Err(error) => {
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[WARN] Session passthrough failed for {} {}: {}",
                                            method, tail_path, error
                                        ),
                                    );
                                    Ok(warp::reply::with_status(
                                        "{\"error\":\"session_passthrough_failed\"}".to_string(),
                                        warp::http::StatusCode::BAD_GATEWAY,
                                    )
                                    .into_response())
                                }
                            }
                        }
                    }
                });

            let services_profile_route =
                warp::path!("minecraft" / "profile").and(warp::get()).map({
                    let services_profile_template = services_profile_template.clone();
                    let bridge_log_path = bridge_log_path.clone();
                    move || {
                        Self::append_skin_bridge_log(
                            bridge_log_path.as_path(),
                            "GET /minecraft/profile",
                        );
                        warp::reply::json(&*services_profile_template)
                    }
                });
            let player_attributes_route = warp::path!("player" / "attributes")
                .and(warp::get())
                .and_then({
                    let bridge_log_path = bridge_log_path.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    move || {
                        let bridge_log_path = bridge_log_path.clone();
                        let session_proxy_client = session_proxy_client.clone();
                        async move {
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                "GET /player/attributes",
                            );
                            if is_offline_session {
                                // Offline accounts do not have Microsoft credentials.
                                // Return a local success payload instead of upstream 401.
                                let payload = serde_json::json!({
                                    "privileges": {
                                        "onlineChat": { "enabled": true },
                                        "multiplayerServer": { "enabled": true },
                                        "multiplayerRealms": { "enabled": false },
                                        "telemetry": { "enabled": false },
                                        "optionalTelemetry": { "enabled": false }
                                    },
                                    "profanityFilterPreferences": {
                                        "enabled": false
                                    },
                                    "banStatus": {
                                        "bannedScopes": {}
                                    }
                                });
                                return Ok::<_, std::convert::Infallible>(
                                    warp::reply::json(&payload).into_response(),
                                );
                            }

                            match session_proxy_client
                                .get("https://api.minecraftservices.com/player/attributes")
                                .send()
                                .await
                            {
                                Ok(upstream_response) => {
                                    let status = warp::http::StatusCode::from_u16(
                                        upstream_response.status().as_u16(),
                                    )
                                    .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                    let body = upstream_response
                                        .text()
                                        .await
                                        .unwrap_or_else(|_| "{}".to_string());
                                    Ok(warp::reply::with_status(body, status).into_response())
                                }
                                Err(error) => {
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[WARN] Player attributes proxy failed: {}",
                                            error
                                        ),
                                    );
                                    Ok(warp::reply::with_status(
                                        "{\"error\":\"player_attributes_proxy_failed\"}"
                                            .to_string(),
                                        warp::http::StatusCode::BAD_GATEWAY,
                                    )
                                    .into_response())
                                }
                            }
                        }
                    }
                });
            let player_certificates_route = warp::path!("player" / "certificates")
                .and(warp::post())
                .and_then({
                    let bridge_log_path = bridge_log_path.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    let offline_player_certificate_payload =
                        offline_player_certificate_payload.clone();
                    move || {
                        let bridge_log_path = bridge_log_path.clone();
                        let session_proxy_client = session_proxy_client.clone();
                        let offline_player_certificate_payload =
                            offline_player_certificate_payload.clone();
                        async move {
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                "POST /player/certificates",
                            );
                            if is_offline_session {
                                if let Some(payload) = offline_player_certificate_payload.as_ref() {
                                    let signature_len = payload
                                        .get("publicKeySignature")
                                        .and_then(|value| value.as_str())
                                        .map(|value| value.len())
                                        .unwrap_or(0);
                                    let key_pair_present = payload
                                        .get("keyPair")
                                        .and_then(|value| value.as_object())
                                        .is_some();
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[OFFLINE_CERT] key_pair={} signature_len={}",
                                            key_pair_present, signature_len
                                        ),
                                    );
                                    return Ok::<_, std::convert::Infallible>(
                                        warp::reply::json(payload).into_response(),
                                    );
                                }
                                Self::append_skin_bridge_log(
                                    bridge_log_path.as_path(),
                                    "[OFFLINE_CERT] unavailable",
                                );
                                return Ok::<_, std::convert::Infallible>(
                                    warp::reply::with_status(
                                        "{\"error\":\"offline_profile_key_unavailable\"}"
                                            .to_string(),
                                        warp::http::StatusCode::SERVICE_UNAVAILABLE,
                                    )
                                    .into_response(),
                                );
                            }

                            match session_proxy_client
                                .post("https://api.minecraftservices.com/player/certificates")
                                .send()
                                .await
                            {
                                Ok(upstream_response) => {
                                    let status = warp::http::StatusCode::from_u16(
                                        upstream_response.status().as_u16(),
                                    )
                                    .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                    let body = upstream_response
                                        .text()
                                        .await
                                        .unwrap_or_else(|_| "{}".to_string());
                                    Ok(warp::reply::with_status(body, status).into_response())
                                }
                                Err(error) => {
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[WARN] Player certificates proxy failed: {}",
                                            error
                                        ),
                                    );
                                    Ok(warp::reply::with_status(
                                        "{\"error\":\"player_certificates_proxy_failed\"}"
                                            .to_string(),
                                        warp::http::StatusCode::BAD_GATEWAY,
                                    )
                                    .into_response())
                                }
                            }
                        }
                    }
                });
            let privacy_blocklist_route =
                warp::path!("privacy" / "blocklist").and(warp::get()).map({
                    let bridge_log_path = bridge_log_path.clone();
                    move || {
                        Self::append_skin_bridge_log(
                            bridge_log_path.as_path(),
                            "GET /privacy/blocklist",
                        );
                        warp::reply::json(&serde_json::json!({
                            "blockedProfiles": []
                        }))
                    }
                });
            let services_passthrough_route = warp::path::full()
                .and(warp::method())
                .and(optional_query.clone())
                .and(warp::body::bytes())
                .and(warp::header::optional::<String>("authorization"))
                .and_then({
                    let bridge_log_path = bridge_log_path.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    move |full_path: warp::path::FullPath,
                          method: warp::http::Method,
                          raw_query: Option<String>,
                          body: warp::hyper::body::Bytes,
                          authorization: Option<String>| {
                        let bridge_log_path = bridge_log_path.clone();
                        let session_proxy_client = session_proxy_client.clone();
                        async move {
                            let path = full_path.as_str();
                            let query_suffix = raw_query
                                .filter(|value| !value.trim().is_empty())
                                .map(|value| format!("?{}", value))
                                .unwrap_or_default();
                            let upstream_url = format!(
                                "https://api.minecraftservices.com{}{}",
                                path, query_suffix
                            );
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                &format!("{} {}{}", method, path, query_suffix),
                            );

                            let reqwest_method = method
                                .as_str()
                                .parse::<reqwest::Method>()
                                .unwrap_or(reqwest::Method::GET);
                            let mut upstream_request =
                                session_proxy_client.request(reqwest_method, &upstream_url);
                            if !body.is_empty() {
                                upstream_request = upstream_request.body(body.clone());
                            }
                            if let Some(auth) = authorization {
                                upstream_request = upstream_request.header("Authorization", auth);
                            }

                            match upstream_request.send().await {
                                Ok(upstream_response) => {
                                    let status = warp::http::StatusCode::from_u16(
                                        upstream_response.status().as_u16(),
                                    )
                                    .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                    let body = upstream_response
                                        .text()
                                        .await
                                        .unwrap_or_else(|_| "{}".to_string());
                                    Ok(warp::reply::with_status(body, status).into_response())
                                }
                                Err(error) => {
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[WARN] Services passthrough failed for {} {}: {}",
                                            method, path, error
                                        ),
                                    );
                                    Ok::<_, std::convert::Infallible>(
                                        warp::reply::with_status(
                                            "{\"error\":\"services_passthrough_failed\"}"
                                                .to_string(),
                                            warp::http::StatusCode::BAD_GATEWAY,
                                        )
                                        .into_response(),
                                    )
                                }
                            }
                        }
                    }
                });
            let public_keys_route = warp::path!("publickeys")
                .and(warp::get())
                .and_then({
                    let bridge_log_path = bridge_log_path.clone();
                    let session_proxy_client = session_proxy_client.clone();
                    let local_profile_property_keys = local_profile_property_keys.clone();
                    let local_player_certificate_keys = local_player_certificate_keys.clone();
                    move || {
                        let bridge_log_path = bridge_log_path.clone();
                        let session_proxy_client = session_proxy_client.clone();
                        let local_profile_property_keys = local_profile_property_keys.clone();
                        let local_player_certificate_keys = local_player_certificate_keys.clone();
                        async move {
                            Self::append_skin_bridge_log(
                                bridge_log_path.as_path(),
                                "GET /publickeys",
                            );
                            match session_proxy_client
                                .get("https://api.minecraftservices.com/publickeys")
                                .send()
                                .await
                            {
                                Ok(upstream_response) => {
                                    let status = warp::http::StatusCode::from_u16(
                                        upstream_response.status().as_u16(),
                                    )
                                    .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
                                    let body = upstream_response
                                        .bytes()
                                        .await
                                        .unwrap_or_default();
                                    let mut payload: serde_json::Value = serde_json::from_slice(&body)
                                        .unwrap_or_else(|_| {
                                            serde_json::json!({
                                                "profilePropertyKeys": [],
                                                "playerCertificateKeys": []
                                            })
                                        });
                                    let local_keys = (*local_profile_property_keys).clone();
                                    if let Some(keys) = payload
                                        .get_mut("profilePropertyKeys")
                                        .and_then(|value| value.as_array_mut())
                                    {
                                        keys.extend(local_keys);
                                    } else {
                                        payload["profilePropertyKeys"] =
                                            serde_json::Value::Array(local_keys);
                                    }
                                    let local_certificate_keys =
                                        (*local_player_certificate_keys).clone();
                                    if let Some(keys) = payload
                                        .get_mut("playerCertificateKeys")
                                        .and_then(|value| value.as_array_mut())
                                    {
                                        keys.extend(local_certificate_keys);
                                    } else {
                                        payload["playerCertificateKeys"] =
                                            serde_json::Value::Array(local_certificate_keys);
                                    }
                                    let profile_keys_count = payload
                                        .get("profilePropertyKeys")
                                        .and_then(|value| value.as_array())
                                        .map(|value| value.len())
                                        .unwrap_or(0);
                                    let cert_keys_count = payload
                                        .get("playerCertificateKeys")
                                        .and_then(|value| value.as_array())
                                        .map(|value| value.len())
                                        .unwrap_or(0);
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[PUBLICKEYS] merged profilePropertyKeys={} playerCertificateKeys={}",
                                            profile_keys_count, cert_keys_count
                                        ),
                                    );
                                    Ok::<_, std::convert::Infallible>(
                                        warp::reply::with_status(
                                            warp::reply::json(&payload),
                                            status,
                                        )
                                        .into_response(),
                                    )
                                }
                                Err(error) => {
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!("[WARN] Public keys proxy failed: {}", error),
                                    );
                                    Self::append_skin_bridge_log(
                                        bridge_log_path.as_path(),
                                        &format!(
                                            "[PUBLICKEYS] fallback profilePropertyKeys={} playerCertificateKeys={}",
                                            local_profile_property_keys.len(),
                                            local_player_certificate_keys.len()
                                        ),
                                    );
                                    Ok(warp::reply::json(&serde_json::json!({
                                        "profilePropertyKeys": (*local_profile_property_keys).clone(),
                                        "playerCertificateKeys": (*local_player_certificate_keys).clone()
                                    }))
                                    .into_response())
                                }
                            }
                        }
                    }
                });
            let routes = profile_route
                .or(profile_route_alt)
                .or(health_route)
                .or(session_passthrough_route)
                .or(services_profile_route)
                .or(player_attributes_route)
                .or(player_certificates_route)
                .or(privacy_blocklist_route)
                .or(public_keys_route)
                .or(services_passthrough_route)
                .boxed();
            let routes = routes.with(warp::cors().allow_any_origin());

            let (session_addr, session_server) =
                warp::serve(routes).bind_ephemeral(([127, 0, 0, 1], 0));
            tokio::spawn(session_server);

            let session_host = format!("http://{}", session_addr);
            Self::append_skin_bridge_log(
                bridge_log_path.as_path(),
                &format!(
                    "Bridge started at {} (offline={}, services_profile={}, own_profile_id={})",
                    session_host,
                    options.is_offline,
                    has_local_services_profile_bridge,
                    own_profile_id
                ),
            );
            Self::append_skin_bridge_log(
                bridge_log_path.as_path(),
                &format!(
                    "Bridge local profile aliases: {}",
                    local_profile_id_aliases.join(",")
                ),
            );
            args.push("-Dminecraft.api.auth.host=https://authserver.mojang.com".to_string());
            args.push("-Dminecraft.api.account.host=https://api.mojang.com".to_string());
            args.push(format!("-Dminecraft.api.session.host={}", session_host));
            let enable_local_services_bridge = options.is_offline
                || has_local_services_profile_bridge
                || !local_profile_property_keys.is_empty()
                || !local_player_certificate_keys.is_empty();
            if enable_local_services_bridge {
                args.push(format!("-Dminecraft.api.services.host={}", session_host));
                log_callback(
                    "[Skin] Local services bridge enabled for profile/certificate compatibility"
                        .to_string(),
                );
            } else {
                args.push(
                    "-Dminecraft.api.services.host=https://api.minecraftservices.com".to_string(),
                );
            }
            if options.is_offline && has_local_services_profile_bridge {
                log_callback(
                    "[Skin] Secure offline skin bridge enabled for multiplayer signature compatibility"
                        .to_string(),
                );
            }
            args.push("-Dminecraft.api.profiles.host=https://api.mojang.com".to_string());
            log_callback(format!(
                "[Skin] Local session bridge enabled: {}",
                session_host
            ));
        }

        if let Some(textures_value) = dragon_agent_textures_value.as_ref() {
            args.push(format!("-Ddragon.skins.textures.value={}", textures_value));
            if let Some(textures_signature) = dragon_agent_textures_signature.as_ref() {
                args.push(format!(
                    "-Ddragon.skins.textures.signature={}",
                    textures_signature
                ));
            }
            args.push(format!("-Ddragon.skins.username={}", options.username));
            args.push(format!(
                "-Ddragon.skins.uuid={}",
                uuid.replace('-', "").to_lowercase()
            ));
            if let Some(local_skin_hash) = dragon_agent_local_skin_hash.as_ref() {
                args.push(format!(
                    "-Ddragon.skins.local.skin.hash={}",
                    local_skin_hash
                ));
            }
            if let Some(local_skin_url) = dragon_agent_local_skin_url.as_ref() {
                args.push(format!("-Ddragon.skins.local.skin.url={}", local_skin_url));
            }
            if let Some(local_cape_hash) = dragon_agent_local_cape_hash.as_ref() {
                args.push(format!(
                    "-Ddragon.skins.local.cape.hash={}",
                    local_cape_hash
                ));
            }
            if let Some(local_cape_url) = dragon_agent_local_cape_url.as_ref() {
                args.push(format!("-Ddragon.skins.local.cape.url={}", local_cape_url));
            }
            log_callback("[DragonSkins] Passed textures payload to JVM agent".to_string());
        }

        // Use isolated game directories for modded versions and legacy vanilla versions.
        // Old vanilla releases should not share root saves/options with modern versions.
        let use_isolated_game_dir =
            is_modded || Self::get_required_java_version(mc_version_for_java) == 8;
        let instance_game_dir = if use_isolated_game_dir {
            let instances_dir = self.game_dir.join("instances").join(&options.version_id);
            std::fs::create_dir_all(&instances_dir).ok();
            std::fs::create_dir_all(instances_dir.join("mods")).ok();
            std::fs::create_dir_all(instances_dir.join("config")).ok();
            std::fs::create_dir_all(instances_dir.join("resourcepacks")).ok();
            std::fs::create_dir_all(instances_dir.join("shaderpacks")).ok();
            // NOTE: Do NOT create "saves" dir here - we may symlink it below

            if is_modded {
                log_callback(format!(
                    "[INFO] Using instance directory: {}",
                    instances_dir.display()
                ));
            } else {
                log_callback(format!(
                    "[INFO] Using isolated legacy game directory: {}",
                    instances_dir.display()
                ));
            }

            // Modded versions keep shared worlds for now; legacy vanilla stays isolated
            // so old clients do not try to open incompatible modern saves.
            let instance_saves = instances_dir.join("saves");
            if is_modded {
                let main_saves = self.game_dir.join("saves");
                // Only attempt symlink if instance saves doesn't exist yet (not even as a dir)
                if !instance_saves.exists() && main_saves.exists() {
                    let mut symlink_ok = false;
                    #[cfg(unix)]
                    {
                        symlink_ok = std::os::unix::fs::symlink(&main_saves, &instance_saves).is_ok();
                    }
                    #[cfg(windows)]
                    {
                        // Windows symlinks require Developer Mode or admin privileges.
                        // Try symlink first, then fall back to a junction, then copy.
                        symlink_ok = std::os::windows::fs::symlink_dir(&main_saves, &instance_saves).is_ok();
                        if !symlink_ok {
                            // Try a directory junction (works without elevated privileges)
                            let junction_cmd = std::process::Command::new("cmd")
                                .args(["/C", "mklink", "/J",
                                    &instance_saves.to_string_lossy(),
                                    &main_saves.to_string_lossy()])
                                .output();
                            if let Ok(output) = junction_cmd {
                                symlink_ok = output.status.success();
                            }
                        }
                        if !symlink_ok {
                            // Last resort: copy saves directory
                            log_callback("[WARN] Could not create symlink/junction for saves, copying worlds...".to_string());
                            let _ = copy_dir_all(&main_saves, &instance_saves);
                            symlink_ok = true; // directory exists now via copy
                        }
                    }
                    if symlink_ok {
                        log_callback("[INFO] Shared worlds linked to instance".to_string());
                    }
                }
                // If saves still doesn't exist after all attempts, create empty dir
                if !instance_saves.exists() {
                    std::fs::create_dir_all(&instance_saves).ok();
                }
            } else {
                // Legacy vanilla: create isolated saves dir
                std::fs::create_dir_all(&instance_saves).ok();
            }

            instances_dir
        } else {
            self.game_dir.clone()
        };

        args.extend([
            main_class.to_string(),
            "--username".to_string(),
            options.username.clone(),
            "--version".to_string(),
            options.version_id.clone(),
            "--gameDir".to_string(),
            instance_game_dir.to_string_lossy().to_string(),
            "--assetsDir".to_string(),
            self.assets_dir.to_string_lossy().to_string(),
            "--assetIndex".to_string(),
            assets.to_string(),
            "--accessToken".to_string(),
            access_token,
            "--uuid".to_string(),
            uuid.clone(),
            "--userProperties".to_string(),
            user_properties,
            "--profileProperties".to_string(),
            profile_properties,
            "--userType".to_string(),
            user_type.to_string(),
        ]);

        // Start Dragon Skins server if any custom skins exist (config or raw files).
        let skins_dir = self.game_dir.join("DragonSkins").join("skins");
        let has_skin_files = std::fs::read_dir(&skins_dir)
            .map(|entries| {
                entries.filter_map(Result::ok).any(|entry| {
                    entry
                        .path()
                        .extension()
                        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("png"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        let has_skins = has_skin_files
            || self
                .get_dragon_skins()
                .map(|skins| !skins.is_empty())
                .unwrap_or(false);
        if has_skins {
            log_callback("[DragonSkins] Ensuring skin server on localhost:25585".to_string());
            if let Err(error) = self.start_skin_server().await {
                log_callback(format!(
                    "[DragonSkins] Warning: Failed to ensure skin server: {}",
                    error
                ));
            }

            log_callback(
                "[Skin] Client-side skin pipeline enabled (resource-pack override disabled)"
                    .to_string(),
            );
        }

        // Add Forge/modded game arguments if present (only for modded versions)
        // Skip standard arguments that we already added above
        if is_modded {
            let standard_args = [
                "--username",
                "--version",
                "--gameDir",
                "--assetsDir",
                "--assetIndex",
                "--accessToken",
                "--userType",
                "--uuid",
                "--versionType",
                "--userProperties",
                "--profileProperties",
            ];

            let mut add_game_args_from_json =
                |source_json: &serde_json::Value, source_label: &str| {
                    if let Some(arguments) = source_json.get("arguments") {
                        if let Some(game_args) = arguments.get("game").and_then(|g| g.as_array()) {
                            if !game_args.is_empty() {
                                log_callback(format!(
                                    "[INFO] Adding {} game arguments...",
                                    source_label
                                ));
                            }

                            let mut skip_next = false;
                            for arg in game_args {
                                if let Some(arg_str) = arg.as_str() {
                                    if skip_next {
                                        skip_next = false;
                                        continue;
                                    }
                                    if standard_args.contains(&arg_str) {
                                        skip_next = true;
                                        continue;
                                    }
                                    if arg_str.starts_with("${") {
                                        continue;
                                    }
                                    args.push(arg_str.to_string());
                                }
                            }
                            return;
                        }
                    }

                    if let Some(mc_args) = source_json
                        .get("minecraftArguments")
                        .and_then(|a| a.as_str())
                    {
                        if !mc_args.is_empty() {
                            log_callback(format!(
                                "[INFO] Adding legacy {} game arguments...",
                                source_label
                            ));
                        }

                        let parts: Vec<&str> = mc_args.split_whitespace().collect();
                        let mut i = 0;
                        while i < parts.len() {
                            let arg = parts[i];
                            if arg.starts_with("${") {
                                i += 1;
                                continue;
                            }
                            if standard_args.contains(&arg) {
                                i += 2;
                                continue;
                            }
                            if arg.starts_with("--") {
                                args.push(arg.to_string());
                                if i + 1 < parts.len()
                                    && !parts[i + 1].starts_with("--")
                                    && !parts[i + 1].starts_with("${")
                                {
                                    args.push(parts[i + 1].to_string());
                                    i += 1;
                                }
                            }
                            i += 1;
                        }
                    }
                };

            add_game_args_from_json(&version_json, "version");
            if let Some(ref intermediate) = intermediate_parent_json {
                add_game_args_from_json(intermediate, "inherited loader");
            }
        }

        Self::upsert_game_arg(&mut args, "--versionType", launch_version_type.clone());
        Self::upsert_game_arg(
            &mut args,
            "--width",
            DEFAULT_GAME_WINDOW_WIDTH.to_string(),
        );
        Self::upsert_game_arg(
            &mut args,
            "--height",
            DEFAULT_GAME_WINDOW_HEIGHT.to_string(),
        );

        log_callback(format!(
            "[INFO] Launching {}...",
            launch_display_name
        ));
        println!("Launching {} with Java: {}", launch_display_name, java_path);
        println!("LWJGL version: {}", lwjgl_version);
        println!("Arguments: {:?}", args);

        // On macOS, use different launch methods for LWJGL 2 vs LWJGL 3
        #[cfg(target_os = "macos")]
        {
            use std::io::BufRead;
            use std::process::Stdio;

            // Use already-detected lwjgl_version instead of re-detecting
            if lwjgl_version >= 3 {
                // LWJGL 3: Use version-specific app bundle wrapper with log file
                let wrapper_dir = self.game_dir.join(".launcher_wrapper");
                let app_dir = wrapper_dir.join(format!("{}.app", launch_display_name));
                let contents_dir = app_dir.join("Contents");
                let macos_dir = contents_dir.join("MacOS");
                let resources_dir = contents_dir.join("Resources");
                let log_file = wrapper_dir.join(format!("minecraft-{}.log", options.version_id));

                std::fs::create_dir_all(&macos_dir).map_err(|e| e.to_string())?;
                std::fs::create_dir_all(&resources_dir).map_err(|e| e.to_string())?;

                // Extract Minecraft icon from version jar (use parent JAR for modded versions)
                let icon_path = resources_dir.join("minecraft.icns");
                if !icon_path.exists() {
                    // Use actual_jar_path which points to the correct JAR (parent for modded)
                    if actual_jar_path.exists() {
                        if let Ok(file) = std::fs::File::open(&actual_jar_path) {
                            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                                // Try to find the largest icon (256x256 preferred)
                                let icon_names = [
                                    "icons/icon_256x256.png",
                                    "icons/icon_128x128.png",
                                    "icons/icon_32x32.png",
                                    "pack.png",
                                ];
                                for icon_name in icon_names {
                                    if let Ok(mut entry) = archive.by_name(icon_name) {
                                        let png_path = resources_dir.join("minecraft.png");
                                        let mut data = Vec::new();
                                        if entry.read_to_end(&mut data).is_ok() {
                                            let _ = std::fs::write(&png_path, &data);
                                            // Convert PNG to ICNS using sips (macOS built-in)
                                            let _ = Command::new("sips")
                                                .args([
                                                    "-s",
                                                    "format",
                                                    "icns",
                                                    &png_path.to_string_lossy(),
                                                    "--out",
                                                    &icon_path.to_string_lossy(),
                                                ])
                                                .output();
                                            let _ = std::fs::remove_file(&png_path);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let info_plist = format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>minecraft_launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.minecraft.launcher.{}</string>
    <key>CFBundleName</key>
    <string>{}</string>
    <key>CFBundleDisplayName</key>
    <string>{}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>minecraft.icns</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>"#,
                    options.version_id, launch_display_name, launch_display_name
                );

                std::fs::write(contents_dir.join("Info.plist"), info_plist)
                    .map_err(|e| e.to_string())?;

                // Create script that redirects output to log file
                let mut script = String::from("#!/bin/bash\n\n");
                script.push_str("export JAVA_STARTED_ON_FIRST_THREAD_1=1\n");
                script.push_str(&format!("cd \"{}\"\n\n", self.game_dir.to_string_lossy()));
                script.push_str(&format!("exec \"{}\"", java_path));
                for arg in &args {
                    let escaped = arg
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("$", "\\$");
                    script.push_str(&format!(" \\\n    \"{}\"", escaped));
                }
                script.push_str(&format!(" 2>&1 | tee \"{}\"\n", log_file.to_string_lossy()));

                let script_path = macos_dir.join("minecraft_launcher");
                std::fs::write(&script_path, &script).map_err(|e| e.to_string())?;

                Command::new("chmod")
                    .args(["+x", &script_path.to_string_lossy()])
                    .output()
                    .map_err(|e| e.to_string())?;

                // Clear old log file
                let _ = std::fs::write(&log_file, "");

                // Launch directly instead of using 'open -a' to avoid -10669 error
                Command::new(&script_path)
                    .current_dir(&self.game_dir)
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .map_err(|e| format!("Failed to launch: {}", e))?;

                log_callback("[INFO] Minecraft (LWJGL 3) launched via app bundle".to_string());

                // Start a thread to tail the log file and send updates
                let log_callback_clone = log_callback.clone();
                let log_file_clone = log_file.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Ok(file) = std::fs::File::open(&log_file_clone) {
                        let reader = std::io::BufReader::new(file);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                if !line.trim().is_empty() {
                                    log_callback_clone(line);
                                }
                            }
                        }
                    }
                });

                println!("Minecraft (LWJGL 3) launched via app bundle");
            } else {
                // LWJGL 2: Launch directly with proper environment and capture output
                log_callback("[INFO] Starting Minecraft (LWJGL 2)...".to_string());

                let mut child = Command::new(&java_path)
                    .args(&args)
                    .current_dir(&self.game_dir)
                    .env("JAVA_STARTED_ON_FIRST_THREAD_1", "1")
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to launch: {}", e))?;

                let pid = child.id();
                log_callback(format!("[INFO] Minecraft launched with PID: {}", pid));

                // Spawn threads to read stdout and stderr
                if let Some(stdout) = child.stdout.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                log_cb(line);
                            }
                        }
                    });
                }

                if let Some(stderr) = child.stderr.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                log_cb(format!("[STDERR] {}", line));
                            }
                        }
                    });
                }

                println!("Minecraft (LWJGL 2) launched directly with PID: {:?}", pid);

                // Wait a moment then try to activate the window
                std::thread::sleep(std::time::Duration::from_secs(3));

                // Try to bring Java window to front
                let _ = Command::new("osascript")
                    .args([
                        "-e",
                        r#"
                        tell application "System Events"
                            set javaProcs to every process whose name contains "java"
                            repeat with proc in javaProcs
                                set frontmost of proc to true
                                tell proc
                                    set visible to true
                                end tell
                            end repeat
                        end tell
                    "#,
                    ])
                    .output();
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            log_callback("[INFO] Starting Minecraft...".to_string());

            // On Windows, use javaw.exe instead of java.exe to avoid console window
            #[cfg(target_os = "windows")]
            let java_executable = {
                let java_path_buf = std::path::PathBuf::from(&java_path);
                // For all versions, prefer javaw.exe to avoid console window
                // The previous issue with Fabric was likely due to other problems, not javaw.exe itself
                if java_path_buf
                    .file_name()
                    .map(|f| f == "java.exe")
                    .unwrap_or(false)
                {
                    let javaw_path = java_path_buf.with_file_name("javaw.exe");
                    if javaw_path.exists() {
                        javaw_path.to_string_lossy().to_string()
                    } else {
                        java_path.clone()
                    }
                } else {
                    java_path.clone()
                }
            };

            #[cfg(not(target_os = "windows"))]
            let java_executable = java_path.clone();

            log_callback(format!("[INFO] Using Java: {}", java_executable));
            log_callback(format!(
                "[INFO] Working directory: {}",
                self.game_dir.display()
            ));
            log_callback(format!("[INFO] Main class: {}", main_class));
            log_callback(format!("[INFO] Is modded: {}", is_modded));

            #[cfg(target_os = "windows")]
            {
                use std::io::BufRead;
                use std::os::windows::process::CommandExt;
                use std::process::Stdio;

                // Use both flags to suppress terminal/cmd popup reliably on Windows.
                const DETACHED_PROCESS: u32 = 0x00000008;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
                const QUICK_LAUNCH_PROBE_MS: u64 = 350;

                let mut child = Command::new(&java_executable)
                    .args(&args)
                    .current_dir(&self.game_dir)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
                    .spawn()
                    .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;

                let pid = child.id();
                log_callback(format!("[INFO] Minecraft launched with PID: {}", pid));

                // Capture output in background threads
                if let Some(stdout) = child.stdout.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                log_cb(format!("[GAME] {}", line));
                            }
                        }
                    });
                }

                if let Some(stderr) = child.stderr.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        let mut error_lines = Vec::new();
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                // Capture error lines for crash detection
                                if line.contains("Exception")
                                    || line.contains("Error")
                                    || line.contains("at ")
                                {
                                    error_lines.push(line.clone());
                                }
                                log_cb(format!("[ERROR] {}", line));
                            }
                        }
                        // If we captured error lines, log a summary
                        if !error_lines.is_empty() {
                            log_cb(format!(
                                "[CRASH] Game crashed with {} error lines. Check logs above.",
                                error_lines.len()
                            ));
                        }
                    });
                }

                // Short probe only; do not block launcher for multiple seconds.
                std::thread::sleep(std::time::Duration::from_millis(QUICK_LAUNCH_PROBE_MS));

                // Check if process is still running
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Process exited - likely crashed
                        if !status.success() {
                            log_callback(format!(
                                "[ERROR] Minecraft exited immediately with code: {:?}",
                                status.code()
                            ));
                            log_callback(
                                "[ERROR] Check the error messages above for details.".to_string(),
                            );
                            return Err(format!("Minecraft failed to start! Exit code: {:?}. Check the game logs for error details.", status.code()));
                        }
                    }
                    Ok(None) => {
                        // Process still running - good!
                        log_callback("[INFO] Game process is running...".to_string());

                        // For Fabric/modded versions, provide helpful message about loading time
                        if is_modded {
                            log_callback(
                                "[INFO] ═══════════════════════════════════════════════════"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] Fabric is loading mods - this may take 2-5 minutes"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] The game may appear stuck at 95% - this is NORMAL"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] Please be patient, especially on first launch".to_string(),
                            );
                            log_callback(
                                "[INFO] ═══════════════════════════════════════════════════"
                                    .to_string(),
                            );
                        }
                    }
                    Err(e) => {
                        log_callback(format!("[WARN] Could not check process status: {}", e));
                    }
                }

                println!("Minecraft launched with PID: {:?}", pid);
            }

            #[cfg(not(target_os = "windows"))]
            {
                use std::io::BufRead;
                use std::process::Stdio;
                const QUICK_LAUNCH_PROBE_MS: u64 = 350;

                let mut child = Command::new(&java_executable)
                    .args(&args)
                    .current_dir(&self.game_dir)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;

                let pid = child.id();
                log_callback(format!("[INFO] Minecraft launched with PID: {}", pid));

                // Spawn threads to read stdout and stderr
                if let Some(stdout) = child.stdout.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                log_cb(line);
                            }
                        }
                    });
                }

                if let Some(stderr) = child.stderr.take() {
                    let log_cb = log_callback.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        let mut error_lines = Vec::new();
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                if line.contains("Exception")
                                    || line.contains("Error")
                                    || line.contains("at ")
                                {
                                    error_lines.push(line.clone());
                                }
                                log_cb(format!("[STDERR] {}", line));
                            }
                        }
                        if !error_lines.is_empty() {
                            log_cb(format!(
                                "[CRASH] Game crashed with {} error lines. Check logs above.",
                                error_lines.len()
                            ));
                        }
                    });
                }

                // Short probe only; do not block launcher for multiple seconds.
                std::thread::sleep(std::time::Duration::from_millis(QUICK_LAUNCH_PROBE_MS));

                // Check if process is still running
                match child.try_wait() {
                    Ok(Some(status)) => {
                        if !status.success() {
                            log_callback(format!(
                                "[ERROR] Minecraft exited immediately with code: {:?}",
                                status.code()
                            ));
                            return Err(format!("Minecraft failed to start! Exit code: {:?}. Check the game logs for error details.", status.code()));
                        }
                    }
                    Ok(None) => {
                        log_callback("[INFO] Game process is running...".to_string());

                        // For Fabric/modded versions, provide helpful message about loading time
                        if is_modded {
                            log_callback(
                                "[INFO] ═══════════════════════════════════════════════════"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] Fabric is loading mods - this may take 2-5 minutes"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] The game may appear stuck at 95% - this is NORMAL"
                                    .to_string(),
                            );
                            log_callback(
                                "[INFO] Please be patient, especially on first launch".to_string(),
                            );
                            log_callback(
                                "[INFO] ═══════════════════════════════════════════════════"
                                    .to_string(),
                            );
                        }
                    }
                    Err(e) => {
                        log_callback(format!("[WARN] Could not check process status: {}", e));
                    }
                }

                println!("Minecraft launched with PID: {:?}", pid);
            }
        }

        Ok(())
    }

    /// Quick verification - only checks essential files exist (no hash verification)
    /// Returns true if version appears ready to launch
    pub fn quick_verify(&self, version_id: &str) -> bool {
        // Check if this is a modded version
        let is_modded = version_id.contains("forge")
            || version_id.contains("fabric")
            || version_id.contains("quilt")
            || version_id.contains("lapetus")
            || version_id.contains("-"); // Modpacks typically have dashes

        // For modded versions, check instances folder; for vanilla, check versions folder
        let version_dir = if is_modded {
            let instance_dir = self.game_dir.join("instances").join(version_id);
            if instance_dir.exists() {
                instance_dir
            } else {
                self.versions_dir.join(version_id)
            }
        } else {
            self.versions_dir.join(version_id)
        };

        let json_path = version_dir.join(format!("{}.json", version_id));

        // Check version JSON exists (in either location)
        let json_exists = json_path.exists()
            || self
                .versions_dir
                .join(version_id)
                .join(format!("{}.json", version_id))
                .exists();
        if !json_exists {
            return false;
        }

        // Use the JSON that exists
        let actual_json_path = if json_path.exists() {
            json_path
        } else {
            self.versions_dir
                .join(version_id)
                .join(format!("{}.json", version_id))
        };

        // Read version JSON to check inheritance
        let json_content = match std::fs::read_to_string(&actual_json_path) {
            Ok(c) => c,
            Err(_) => return false,
        };
        let version_json: serde_json::Value = match serde_json::from_str(&json_content) {
            Ok(j) => j,
            Err(_) => return false,
        };

        // Check if modded version
        let inherits_from = version_json["inheritsFrom"].as_str();
        let is_modded_json = inherits_from.is_some()
            || version_id.contains("forge")
            || version_id.contains("fabric")
            || version_id.contains("lapetus");

        if is_modded_json {
            // For modded versions, check parent exists
            if let Some(parent) = inherits_from {
                let parent_json = self
                    .versions_dir
                    .join(parent)
                    .join(format!("{}.json", parent));
                if !parent_json.exists() {
                    return false;
                }
                // For Fabric/Quilt loaders, check their parent too
                if parent.starts_with("fabric-loader-") || parent.starts_with("quilt-loader-") {
                    // Extract MC version from loader version
                    let mc_version = parent.rsplit('-').next().unwrap_or("");
                    let mc_jar = self
                        .versions_dir
                        .join(mc_version)
                        .join(format!("{}.jar", mc_version));
                    if !mc_jar.exists() {
                        return false;
                    }
                }
            }
        } else {
            // For vanilla, check JAR exists
            let jar_path = version_dir.join(format!("{}.jar", version_id));
            if !jar_path.exists() {
                return false;
            }
        }

        // Check natives directory exists and has files
        let natives_dir = self.natives_dir.join(version_id);
        if natives_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&natives_dir) {
                if entries.count() == 0 {
                    return false;
                }
            }
        }

        true
    }

    pub async fn repair_version<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<u32, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("Starting repair/verify for version: {}", version_id);
        progress_callback(0.0, format!("Verifying Minecraft {}...", version_id));

        // Quick check first - if essential files exist, do minimal verification
        let quick_ok = self.quick_verify(version_id);
        if quick_ok {
            println!("Quick verify passed, doing minimal checks...");
            progress_callback(0.5, "Quick verification passed...".to_string());
        }

        // Try to find the version JSON in multiple locations
        let version_dir = self.versions_dir.join(version_id);
        let json_path = version_dir.join(format!("{}.json", version_id));

        // Also check instances folder for modded versions
        let instance_dir = self.game_dir.join("instances").join(version_id);
        let instance_json_path = instance_dir.join(format!("{}.json", version_id));

        // Determine which JSON path to use
        let actual_json_path = if json_path.exists() {
            println!("Found JSON in versions folder: {:?}", json_path);
            json_path.clone()
        } else if instance_json_path.exists() {
            println!("Found JSON in instances folder: {:?}", instance_json_path);
            instance_json_path
        } else {
            println!("JSON not found in either location:");
            println!("  - Versions: {:?}", json_path);
            println!("  - Instances: {:?}", instance_json_path);
            return Err(format!(
                "Version {} JSON not found. Please reinstall.",
                version_id
            ));
        };

        let jar_path = version_dir.join(format!("{}.jar", version_id));

        let json_content = std::fs::read_to_string(&actual_json_path)
            .map_err(|e| format!("Could not read version JSON: {}", e))?;
        let version_json: serde_json::Value = serde_json::from_str(&json_content)
            .map_err(|e| format!("Could not parse version JSON: {}", e))?;

        let mut repaired = 0u32;

        // Check if this is a modded version (Forge/Fabric/etc) that inherits from vanilla
        let inherits_from = version_json["inheritsFrom"].as_str();
        let is_modded = inherits_from.is_some()
            || version_id.contains("forge")
            || version_id.contains("fabric");

        // Check and repair client JAR
        progress_callback(0.02, "Checking client JAR...".to_string());
        println!("Checking client JAR at: {:?}", jar_path);

        let client_url = version_json["downloads"]["client"]["url"].as_str();
        let client_sha1 = version_json["downloads"]["client"]["sha1"].as_str();

        // For modded versions, check the inherited vanilla JAR instead
        if is_modded {
            if let Some(parent_version) = inherits_from {
                let parent_json = self
                    .versions_dir
                    .join(parent_version)
                    .join(format!("{}.json", parent_version));

                // For Fabric/Quilt parent versions, only check JSON exists (they don't have their own JAR)
                let parent_is_loader = parent_version.starts_with("fabric-loader-")
                    || parent_version.starts_with("quilt-loader-");
                let parent_jar = self
                    .versions_dir
                    .join(parent_version)
                    .join(format!("{}.jar", parent_version));

                let parent_needs_install = if parent_is_loader {
                    // Loader versions only need JSON file
                    !parent_json.exists()
                } else {
                    // Vanilla versions need both JSON and JAR
                    !parent_json.exists() || !parent_jar.exists()
                };

                if parent_needs_install {
                    println!(
                        "Parent version {} not fully installed, installing automatically...",
                        parent_version
                    );

                    // Check if parent is a Fabric version
                    if parent_version.starts_with("fabric-loader-") {
                        progress_callback(
                            0.03,
                            format!(
                                "Installing Fabric {} (required for Lapetus)...",
                                parent_version
                            ),
                        );

                        // Parse fabric version: fabric-loader-{loader_version}-{mc_version}
                        let parts: Vec<&str> = parent_version
                            .strip_prefix("fabric-loader-")
                            .unwrap_or(parent_version)
                            .split('-')
                            .collect();
                        if parts.len() >= 2 {
                            let loader_version = parts[0];
                            let mc_version = parts[parts.len() - 1]; // MC version is at the end

                            // First ensure vanilla MC is installed
                            let vanilla_jar = self
                                .versions_dir
                                .join(mc_version)
                                .join(format!("{}.jar", mc_version));
                            if !vanilla_jar.exists() {
                                progress_callback(
                                    0.03,
                                    format!("Installing Minecraft {} first...", mc_version),
                                );
                                self.install_version(mc_version, |p, msg| {
                                    println!(
                                        "Installing {}: {:.0}% - {}",
                                        mc_version,
                                        p * 100.0,
                                        msg
                                    );
                                })
                                .await?;
                            }

                            // Now install Fabric
                            let fabric_info = fabric::FabricVersionInfo {
                                id: parent_version.to_string(),
                                mc_version: mc_version.to_string(),
                                loader_version: loader_version.to_string(),
                                stable: true,
                            };

                            self.install_fabric(&fabric_info, |p, msg| {
                                println!("Installing Fabric: {:.0}% - {}", p * 100.0, msg);
                            })
                            .await?;
                        }
                    } else {
                        // Regular vanilla parent
                        progress_callback(
                            0.03,
                            format!(
                                "Installing vanilla {} (required for modded version)...",
                                parent_version
                            ),
                        );
                        self.install_version(parent_version, |p, msg| {
                            println!("Installing {}: {:.0}% - {}", parent_version, p * 100.0, msg);
                        })
                        .await?;
                    }

                    println!("Parent version {} installed successfully", parent_version);
                    repaired += 1;
                } else {
                    println!(
                        "Modded version inherits from {}, parent JAR exists",
                        parent_version
                    );
                }
            }
            // Modded versions don't need their own JAR file
            println!("Skipping JAR check for modded version");
        } else if !jar_path.exists() {
            println!("Client JAR missing, downloading...");
            progress_callback(0.03, "Client JAR missing, downloading...".to_string());
            if let Some(url) = client_url {
                self.download_file(url, &jar_path).await?;
                repaired += 1;
                println!("Downloaded client JAR");
            } else {
                return Err("Could not find client download URL".to_string());
            }
        } else if let Some(expected_sha1) = client_sha1 {
            // Verify JAR hash
            match self.calculate_sha1(&jar_path) {
                Ok(actual_sha1) => {
                    if actual_sha1 != expected_sha1 {
                        println!(
                            "Client JAR hash mismatch! Expected: {}, Got: {}",
                            expected_sha1, actual_sha1
                        );
                        progress_callback(
                            0.03,
                            "Client JAR corrupted, re-downloading...".to_string(),
                        );
                        if let Some(url) = client_url {
                            let _ = std::fs::remove_file(&jar_path);
                            self.download_file(url, &jar_path).await?;
                            repaired += 1;
                            println!("Re-downloaded client JAR");
                        }
                    } else {
                        println!("Client JAR verified OK");
                    }
                }
                Err(e) => {
                    println!("Could not verify JAR hash: {}", e);
                }
            }
        }

        progress_callback(0.05, "Checking libraries...".to_string());

        // If quick verify passed, skip detailed library checking for faster launch
        if quick_ok {
            progress_callback(0.9, "Files verified, ready to launch!".to_string());
            progress_callback(1.0, "Verification complete!".to_string());
            return Ok(repaired);
        }

        // Check and repair libraries
        let mut libs_checked = 0;
        let mut libs_missing = 0;

        // Determine current OS for library rules
        #[cfg(target_os = "windows")]
        let current_os = "windows";
        #[cfg(target_os = "macos")]
        let current_os = "osx";
        #[cfg(target_os = "linux")]
        let current_os = "linux";

        if let Some(libraries) = version_json["libraries"].as_array() {
            let total_libs = libraries.len();
            println!("Checking {} libraries...", total_libs);

            for (i, lib) in libraries.iter().enumerate() {
                // Check rules
                let mut allowed = true;
                if let Some(rules) = lib.get("rules") {
                    if let Some(rules_arr) = rules.as_array() {
                        allowed = false;
                        for rule in rules_arr {
                            let action = rule["action"].as_str().unwrap_or("allow");
                            if let Some(os) = rule.get("os") {
                                if let Some(name) = os["name"].as_str() {
                                    if name == current_os && action == "allow" {
                                        allowed = true;
                                    } else if name == current_os && action == "disallow" {
                                        allowed = false;
                                        break;
                                    }
                                }
                            } else if action == "allow" {
                                allowed = true;
                            }
                        }
                    }
                }

                if !allowed {
                    continue;
                }

                if let Some(downloads) = lib.get("downloads") {
                    // Check main artifact
                    if let Some(artifact) = downloads.get("artifact") {
                        if let (Some(url), Some(path)) =
                            (artifact["url"].as_str(), artifact["path"].as_str())
                        {
                            // Convert forward slashes to platform-specific path separators
                            let normalized_path = path.replace('/', std::path::MAIN_SEPARATOR_STR);
                            let lib_path = self.libraries_dir.join(&normalized_path);
                            libs_checked += 1;

                            if !lib_path.exists() {
                                libs_missing += 1;
                                if let Some(parent) = lib_path.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }

                                println!("Library missing: {}", path);
                                for attempt in 0..3 {
                                    match self.download_file(url, &lib_path).await {
                                        Ok(_) => {
                                            // Validate the downloaded JAR
                                            if Self::is_valid_jar_static(&lib_path) {
                                                repaired += 1;
                                                break;
                                            } else {
                                                println!(
                                                    "Downloaded JAR is corrupted, retrying: {}",
                                                    path
                                                );
                                                let _ = std::fs::remove_file(&lib_path);
                                            }
                                        }
                                        Err(e) => {
                                            if attempt == 2 {
                                                eprintln!(
                                                    "Failed to download library {}: {}",
                                                    path, e
                                                );
                                            }
                                        }
                                    }
                                }
                            } else {
                                // File exists, validate it's not corrupted
                                if !Self::is_valid_jar_static(&lib_path) {
                                    libs_missing += 1;
                                    println!("Library corrupted, re-downloading: {}", path);
                                    let _ = std::fs::remove_file(&lib_path);

                                    for attempt in 0..3 {
                                        match self.download_file(url, &lib_path).await {
                                            Ok(_) => {
                                                if Self::is_valid_jar_static(&lib_path) {
                                                    repaired += 1;
                                                    break;
                                                } else {
                                                    let _ = std::fs::remove_file(&lib_path);
                                                }
                                            }
                                            Err(e) => {
                                                if attempt == 2 {
                                                    eprintln!(
                                                        "Failed to download library {}: {}",
                                                        path, e
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Check natives - use platform-specific keys
                    if let Some(classifiers) = downloads.get("classifiers") {
                        #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-windows-arm64",
                            "natives-windows",
                            "natives-windows-64",
                            "natives-windows-x86_64",
                        ];
                        #[cfg(all(target_os = "windows", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-windows",
                            "natives-windows-64",
                            "natives-windows-x86_64",
                            "natives-windows-arm64",
                        ];
                        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-macos-arm64",
                            "natives-osx-arm64",
                            "natives-macos",
                            "natives-osx",
                        ];
                        #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-osx",
                            "natives-macos",
                            "natives-macos-arm64",
                            "natives-osx-arm64",
                        ];
                        #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
                        let native_keys = [
                            "natives-linux-arm64",
                            "natives-linux-aarch64",
                            "natives-linux",
                            "natives-linux-64",
                            "natives-linux-x86_64",
                        ];
                        #[cfg(all(target_os = "linux", not(target_arch = "aarch64")))]
                        let native_keys = [
                            "natives-linux",
                            "natives-linux-64",
                            "natives-linux-x86_64",
                            "natives-linux-arm64",
                            "natives-linux-aarch64",
                        ];

                        for native_key in native_keys {
                            if let Some(native) = classifiers.get(native_key) {
                                if let Some(url) = native["url"].as_str() {
                                    let native_jar_path = self.native_archive_cache_path(
                                        native,
                                        format!("{}-{}.jar", version_id, native_key),
                                    );

                                    let needs_download = !native_jar_path.exists()
                                        || !Self::is_valid_jar_static(&native_jar_path);
                                    if needs_download {
                                        let _ = std::fs::remove_file(&native_jar_path);
                                        println!("Native missing: {}", native_key);
                                        let _ = self.download_file(url, &native_jar_path).await;
                                        repaired += 1;
                                    }

                                    // Extract natives
                                    let version_natives_dir = self.natives_dir.join(version_id);
                                    let _ = std::fs::create_dir_all(&version_natives_dir);

                                    if native_jar_path.exists()
                                        && Self::is_valid_jar_static(&native_jar_path)
                                    {
                                        if let Ok(file) = std::fs::File::open(&native_jar_path) {
                                            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                                                for j in 0..archive.len() {
                                                    if let Ok(mut entry) = archive.by_index(j) {
                                                        let name = entry.name().to_string();
                                                        // Extract platform-specific native libraries
                                                        let is_native =
                                                            Self::is_platform_native_file(&name);

                                                        if is_native {
                                                            let file_name =
                                                                std::path::Path::new(&name)
                                                                    .file_name()
                                                                    .unwrap_or_default()
                                                                    .to_string_lossy()
                                                                    .to_string();
                                                            let out_path = version_natives_dir
                                                                .join(&file_name);
                                                            if let Ok(mut out_file) =
                                                                std::fs::File::create(&out_path)
                                                            {
                                                                let _ = std::io::copy(
                                                                    &mut entry,
                                                                    &mut out_file,
                                                                );
                                                                repaired += 1;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // Old Forge format: just "name" field with Maven coordinates
                else if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                    // Skip server-only libraries
                    if let Some(clientreq) = lib.get("clientreq") {
                        if clientreq.as_bool() == Some(false) {
                            continue;
                        }
                    }

                    // Parse Maven coordinates: group:artifact:version
                    let parts: Vec<&str> = name.split(':').collect();
                    if parts.len() >= 3 {
                        let group = parts[0].replace('.', "/");
                        let artifact = parts[1];
                        let version_str = parts[2];

                        let jar_name = if parts.len() > 3 {
                            format!("{}-{}-{}.jar", artifact, version_str, parts[3])
                        } else {
                            format!("{}-{}.jar", artifact, version_str)
                        };

                        let lib_path = self
                            .libraries_dir
                            .join(&group)
                            .join(artifact)
                            .join(version_str)
                            .join(&jar_name);

                        libs_checked += 1;

                        if !lib_path.exists() {
                            libs_missing += 1;
                            if let Some(parent) = lib_path.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }

                            // Get the Maven URL from the library or use default
                            let base_url = lib
                                .get("url")
                                .and_then(|u| u.as_str())
                                .unwrap_or("https://libraries.minecraft.net/");

                            let download_url = format!(
                                "{}{}/{}/{}/{}",
                                base_url, group, artifact, version_str, jar_name
                            );

                            println!("Library missing (old format): {} -> {}", name, download_url);

                            // Try to download
                            for attempt in 0..3 {
                                match self.download_file(&download_url, &lib_path).await {
                                    Ok(_) => {
                                        repaired += 1;
                                        break;
                                    }
                                    Err(_) => {
                                        if attempt == 2 {
                                            // Try Forge Maven as fallback
                                            let forge_url = format!(
                                                "https://maven.minecraftforge.net/{}/{}/{}/{}",
                                                group, artifact, version_str, jar_name
                                            );
                                            if self
                                                .download_file(&forge_url, &lib_path)
                                                .await
                                                .is_ok()
                                            {
                                                repaired += 1;
                                            } else {
                                                eprintln!("Failed to download library: {}", name);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if i % 20 == 0 || i == total_libs - 1 {
                    let progress = 0.05 + (0.15 * (i as f32 / total_libs as f32));
                    progress_callback(
                        progress,
                        format!("Checking libraries ({}/{})...", i + 1, total_libs),
                    );
                }
            }
        }

        println!(
            "Libraries: {} checked, {} were missing",
            libs_checked, libs_missing
        );

        progress_callback(0.2, "Checking assets...".to_string());

        // For modded versions, get asset index from parent version
        let asset_index_json = if is_modded {
            if let Some(parent_version) = inherits_from {
                let parent_json_path = self
                    .versions_dir
                    .join(parent_version)
                    .join(format!("{}.json", parent_version));
                if let Ok(parent_content) = std::fs::read_to_string(&parent_json_path) {
                    if let Ok(parent_json) =
                        serde_json::from_str::<serde_json::Value>(&parent_content)
                    {
                        parent_json.get("assetIndex").cloned()
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                version_json.get("assetIndex").cloned()
            }
        } else {
            version_json.get("assetIndex").cloned()
        };

        // Check and repair assets
        if let Some(asset_index) = asset_index_json {
            if let (Some(url), Some(id)) = (asset_index["url"].as_str(), asset_index["id"].as_str())
            {
                let index_dir = self.assets_dir.join("indexes");
                let _ = std::fs::create_dir_all(&index_dir);
                let index_path = index_dir.join(format!("{}.json", id));

                // Download asset index if missing
                if !index_path.exists() {
                    println!("Asset index missing, downloading...");
                    progress_callback(0.21, "Downloading asset index...".to_string());
                    self.download_file(url, &index_path).await?;
                    repaired += 1;
                }

                if let Ok(index_content) = std::fs::read_to_string(&index_path) {
                    if let Ok(index_json) =
                        serde_json::from_str::<serde_json::Value>(&index_content)
                    {
                        if let Some(objects) = index_json["objects"].as_object() {
                            let objects_dir = self.assets_dir.join("objects");
                            let _ = std::fs::create_dir_all(&objects_dir);
                            let total = objects.len();
                            let mut missing = Vec::new();

                            // First pass: find missing assets
                            progress_callback(0.22, format!("Scanning {} assets...", total));
                            println!("Scanning {} assets...", total);

                            for (_name, obj) in objects.iter() {
                                if let Some(hash) = obj["hash"].as_str() {
                                    let prefix = &hash[..2];
                                    let asset_path = objects_dir.join(prefix).join(hash);

                                    if !asset_path.exists() {
                                        missing.push(hash.to_string());
                                    }
                                }
                            }

                            println!("Found {} missing assets out of {}", missing.len(), total);

                            if !missing.is_empty() {
                                progress_callback(
                                    0.25,
                                    format!("Downloading {} missing assets...", missing.len()),
                                );

                                // Second pass: download missing assets
                                let missing_total = missing.len();
                                for (i, hash) in missing.iter().enumerate() {
                                    let prefix = &hash[..2];
                                    let asset_dir = objects_dir.join(prefix);
                                    let asset_path = asset_dir.join(hash);

                                    let _ = std::fs::create_dir_all(&asset_dir);
                                    let url = format!(
                                        "https://resources.download.minecraft.net/{}/{}",
                                        prefix, hash
                                    );

                                    for attempt in 0..3 {
                                        match self.download_file(&url, &asset_path).await {
                                            Ok(_) => {
                                                repaired += 1;
                                                break;
                                            }
                                            Err(_) => {
                                                if attempt < 2 {
                                                    tokio::time::sleep(
                                                        tokio::time::Duration::from_millis(100),
                                                    )
                                                    .await;
                                                }
                                            }
                                        }
                                    }

                                    if i % 50 == 0 || i == missing_total - 1 {
                                        let progress =
                                            0.25 + (0.75 * (i as f32 / missing_total as f32));
                                        progress_callback(
                                            progress,
                                            format!(
                                                "Downloading assets ({}/{})...",
                                                i + 1,
                                                missing_total
                                            ),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        println!("Verification complete! Repaired {} files.", repaired);
        progress_callback(
            1.0,
            format!("Verification complete! Fixed {} files.", repaired),
        );
        Ok(repaired)
    }

    fn sha1_hex_bytes(bytes: &[u8]) -> String {
        let mut hasher = Sha1::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    fn sha1_hash_unencoded_chars(value: &str) -> String {
        let mut hasher = Sha1::new();
        for code_unit in value.encode_utf16() {
            hasher.update(code_unit.to_le_bytes());
        }
        format!("{:x}", hasher.finalize())
    }

    fn offline_uuid_for_username(username: &str) -> String {
        let digest = md5::compute(format!("OfflinePlayer:{}", username).as_bytes());
        let mut bytes = digest.0;
        // Match vanilla Java's UUID.nameUUIDFromBytes variant/version bits.
        bytes[6] = (bytes[6] & 0x0f) | 0x30;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        uuid::Uuid::from_bytes(bytes).to_string().replace('-', "")
    }

    fn textures_signing_material() -> Result<(RsaPrivateKey, String), String> {
        let cache = TEXTURES_SIGNING_KEY_CACHE.get_or_init(|| Mutex::new(None));
        if let Ok(cache_guard) = cache.lock() {
            if let Some((private_key, public_key_b64)) = cache_guard.as_ref() {
                return Ok((private_key.clone(), public_key_b64.clone()));
            }
        }

        let mut rng = OsRng;
        // Match Mojang's larger signature size so authlib can evaluate mixed
        // official/custom keys without failing early on signature length.
        let private_key = RsaPrivateKey::new(&mut rng, 4096)
            .map_err(|e| format!("Failed to generate RSA key pair: {}", e))?;
        let public_key = RsaPublicKey::from(&private_key);
        let public_key_der = public_key
            .to_public_key_der()
            .map_err(|e| format!("Failed to encode RSA public key: {}", e))?;
        let public_key_b64 = general_purpose::STANDARD.encode(public_key_der.as_ref());

        if let Ok(mut cache_guard) = cache.lock() {
            *cache_guard = Some((private_key.clone(), public_key_b64.clone()));
        }

        Ok((private_key, public_key_b64))
    }

    fn sign_textures_property_value(value: &str) -> Result<(String, String), String> {
        let (private_key, public_key_b64) = Self::textures_signing_material()?;
        let signing_key = SigningKey::<Sha1>::new(private_key);
        let signature = signing_key.sign(value.as_bytes());
        let signature_b64 = general_purpose::STANDARD.encode(signature.to_vec());
        Ok((signature_b64, public_key_b64))
    }

    fn parse_uuid_lossy(value: &str) -> Option<uuid::Uuid> {
        let trimmed = value.trim();
        if let Ok(parsed) = uuid::Uuid::parse_str(trimmed) {
            return Some(parsed);
        }
        let compact = trimmed.replace('-', "");
        if compact.len() != 32 || !compact.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return None;
        }
        let dashed = format!(
            "{}-{}-{}-{}-{}",
            &compact[0..8],
            &compact[8..12],
            &compact[12..16],
            &compact[16..20],
            &compact[20..32]
        );
        uuid::Uuid::parse_str(&dashed).ok()
    }

    fn encode_der_as_pem(label: &str, der: &[u8]) -> String {
        let encoded = general_purpose::STANDARD.encode(der);
        let mut pem = String::new();
        pem.push_str("-----BEGIN ");
        pem.push_str(label);
        pem.push_str("-----\n");
        for chunk in encoded.as_bytes().chunks(64) {
            pem.push_str(&String::from_utf8_lossy(chunk));
            pem.push('\n');
        }
        pem.push_str("-----END ");
        pem.push_str(label);
        pem.push_str("-----");
        pem
    }

    fn build_offline_player_certificate_response(
        profile_uuid: &str,
    ) -> Result<(serde_json::Value, serde_json::Value), String> {
        let parsed_uuid = Self::parse_uuid_lossy(profile_uuid)
            .ok_or_else(|| format!("Invalid profile UUID '{}'", profile_uuid))?;
        let cache_key = parsed_uuid.simple().to_string();
        let now_ms = chrono::Utc::now().timestamp_millis();

        let cert_cache = OFFLINE_CERT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(cache_guard) = cert_cache.lock() {
            if let Some((cached_payload, cached_verifier, cached_expires_at_ms)) =
                cache_guard.get(&cache_key)
            {
                // Reuse cached certs while they remain valid to avoid expensive
                // RSA generation on every launch.
                if *cached_expires_at_ms > now_ms + 300_000 {
                    return Ok((cached_payload.clone(), cached_verifier.clone()));
                }
            }
        }

        // Signer key mimics Mojang's PROFILE_KEY verifier path for offline sessions.
        let mut rng = OsRng;
        let services_private_key = RsaPrivateKey::new(&mut rng, 4096)
            .map_err(|e| format!("Failed to generate services signing key: {}", e))?;
        let services_public_key = RsaPublicKey::from(&services_private_key);
        let services_public_der = services_public_key
            .to_public_key_der()
            .map_err(|e| format!("Failed to encode services public key: {}", e))?;
        let services_public_b64 = general_purpose::STANDARD.encode(services_public_der.as_ref());

        // The per-session player key pair used for secure profile/chat flows.
        let profile_private_key = RsaPrivateKey::new(&mut rng, 1024)
            .map_err(|e| format!("Failed to generate profile key pair: {}", e))?;
        let profile_public_key = RsaPublicKey::from(&profile_private_key);
        let profile_public_der = profile_public_key
            .to_public_key_der()
            .map_err(|e| format!("Failed to encode profile public key: {}", e))?;
        let profile_private_der = profile_private_key
            .to_pkcs8_der()
            .map_err(|e| format!("Failed to encode profile private key: {}", e))?;

        let now = chrono::Utc::now();
        let expires_at = now + chrono::Duration::hours(48);
        let refreshed_after = now + chrono::Duration::hours(36);
        let expires_at_text = expires_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let refreshed_after_text =
            refreshed_after.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        // Signature payload format follows Minecraft's profile key verifier:
        // [uuid_msb|uuid_lsb|expires_at_epoch_ms|public_key_der].
        let mut signed_payload = Vec::with_capacity(24 + profile_public_der.as_ref().len());
        signed_payload.extend_from_slice(parsed_uuid.as_bytes());
        signed_payload.extend_from_slice(&expires_at.timestamp_millis().to_be_bytes());
        signed_payload.extend_from_slice(profile_public_der.as_ref());

        let signing_key = SigningKey::<Sha1>::new(services_private_key);
        let public_key_signature = signing_key.sign(&signed_payload);
        let public_key_signature_b64 =
            general_purpose::STANDARD.encode(public_key_signature.to_vec());

        let response_payload = serde_json::json!({
            "keyPair": {
                "privateKey": Self::encode_der_as_pem("RSA PRIVATE KEY", profile_private_der.as_bytes()),
                "publicKey": Self::encode_der_as_pem("RSA PUBLIC KEY", profile_public_der.as_ref())
            },
            "publicKeySignature": public_key_signature_b64,
            "publicKeySignatureV2": public_key_signature_b64,
            "expiresAt": expires_at_text,
            "refreshedAfter": refreshed_after_text
        });
        let verifier_key_payload = serde_json::json!({
            "publicKey": services_public_b64
        });

        if let Ok(mut cache_guard) = cert_cache.lock() {
            cache_guard.insert(
                cache_key,
                (
                    response_payload.clone(),
                    verifier_key_payload.clone(),
                    expires_at.timestamp_millis(),
                ),
            );
        }

        Ok((response_payload, verifier_key_payload))
    }

    fn append_skin_bridge_log(path: &std::path::Path, message: &str) {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        let line = format!("[{}] {}\n", timestamp, message);
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }

    fn prime_vanilla_texture_cache(&self, texture_bytes: &[u8]) -> Result<String, String> {
        let texture_hash = Self::sha1_hex_bytes(texture_bytes);
        let texture_url = format!("https://textures.minecraft.net/texture/{}", texture_hash);
        let texture_url_http = format!("http://textures.minecraft.net/texture/{}", texture_hash);

        // Prime multiple cache key layouts so skins/capes load on legacy and
        // modern clients (different MC/authlib versions hash either the raw
        // texture hash or the full URL using different Java hash paths).
        let mut cache_keys = vec![
            texture_hash.clone(),
            Self::sha1_hash_unencoded_chars(&texture_hash),
            Self::sha1_hex_bytes(texture_url.as_bytes()),
            Self::sha1_hash_unencoded_chars(&texture_url),
            Self::sha1_hex_bytes(texture_url_http.as_bytes()),
            Self::sha1_hash_unencoded_chars(&texture_url_http),
        ];
        cache_keys.sort();
        cache_keys.dedup();

        let mut skin_cache_roots = vec![
            self.assets_dir.join("skins"),
            self.game_dir.join("assets").join("skins"),
        ];
        skin_cache_roots.sort();
        skin_cache_roots.dedup();

        for cache_key in cache_keys {
            let cache_prefix = if cache_key.len() > 2 {
                &cache_key[..2]
            } else {
                "xx"
            };

            for cache_root in &skin_cache_roots {
                let nested_cache_dir = cache_root.join(cache_prefix);
                std::fs::create_dir_all(&nested_cache_dir).map_err(|e| {
                    format!(
                        "Failed to create vanilla skin cache dir '{}': {}",
                        nested_cache_dir.display(),
                        e
                    )
                })?;

                let nested_cache_path = nested_cache_dir.join(&cache_key);
                std::fs::write(&nested_cache_path, texture_bytes).map_err(|e| {
                    format!(
                        "Failed to write vanilla skin cache '{}': {}",
                        nested_cache_path.display(),
                        e
                    )
                })?;

                // Legacy clients/loaders may use a flat cache layout without prefix folders.
                let flat_cache_path = cache_root.join(&cache_key);
                std::fs::write(&flat_cache_path, texture_bytes).map_err(|e| {
                    format!(
                        "Failed to write vanilla flat skin cache '{}': {}",
                        flat_cache_path.display(),
                        e
                    )
                })?;
            }
        }

        Ok(texture_url)
    }

    fn prime_vanilla_skin_cache(&self, skin_bytes: &[u8]) -> Result<String, String> {
        self.prime_vanilla_texture_cache(skin_bytes)
    }

    fn preset_cape_filename(index: i32) -> Option<&'static str> {
        match index {
            0 => Some("cape1.png"),
            1 => Some("cape2.png"),
            2 => Some("cape3.png"),
            3 => Some("cape4.png"),
            4 => Some("cape5.gif"),
            5 => Some("cape10.png"),
            6 => Some("cape11.png"),
            7 => Some("cape12.png"),
            8 => Some("cape13.png"),
            9 => Some("cape14.gif"),
            10 => Some("cape15.gif"),
            11 => Some("cape16.gif"),
            12 => Some("cape17.png"),
            13 => Some("cape18.gif"),
            14 => Some("cape6.png"),
            15 => Some("cape7.png"),
            16 => Some("cape8.png"),
            17 => Some("cape9.png"),
            18 => Some("do.gif"),
            _ => None,
        }
    }

    fn normalize_cape_texture_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
        const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
        if bytes.len() >= PNG_MAGIC.len() && &bytes[..PNG_MAGIC.len()] == PNG_MAGIC {
            return Ok(bytes.to_vec());
        }

        match image::load_from_memory(bytes) {
            Ok(dynamic_image) => {
                let mut output = Vec::new();
                let mut cursor = std::io::Cursor::new(&mut output);
                dynamic_image
                    .write_to(&mut cursor, image::ImageFormat::Png)
                    .map_err(|e| format!("Failed to encode cape as PNG: {}", e))?;
                Ok(output)
            }
            Err(error) => Err(format!("Unsupported cape image format: {}", error)),
        }
    }

    fn find_preset_cape_path(&self, selected_cape_index: i32) -> Option<PathBuf> {
        let filename = Self::preset_cape_filename(selected_cape_index)?;
        let mut candidates = vec![
            self.game_dir
                .join("DragonSkins")
                .join("capes")
                .join(filename),
            PathBuf::from("resources/capes").join(filename),
            PathBuf::from("src-tauri/resources/capes").join(filename),
            PathBuf::from("client/public/capes").join(filename),
            PathBuf::from("dist/public/capes").join(filename),
            PathBuf::from("dist/capes").join(filename),
        ];

        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(exe_dir) = current_exe.parent() {
                candidates.push(exe_dir.join("../Resources/capes").join(filename));
                candidates.push(exe_dir.join("../Resources/resources/capes").join(filename));
                candidates.push(
                    exe_dir
                        .join("../Resources/dist/public/capes")
                        .join(filename),
                );
                candidates.push(exe_dir.join("../Resources/dist/capes").join(filename));
            }
        }

        candidates.into_iter().find_map(|path| {
            if !path.exists() {
                return None;
            }
            std::fs::canonicalize(&path).ok().or(Some(path))
        })
    }

    async fn resolve_mojang_uuid_for_username(
        &self,
        username: &str,
    ) -> Result<Option<String>, String> {
        let trimmed = username.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let lookup_url = format!(
            "https://api.mojang.com/users/profiles/minecraft/{}",
            trimmed
        );
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| format!("Failed to build Mojang lookup client: {}", e))?;

        let response = client
            .get(&lookup_url)
            .send()
            .await
            .map_err(|e| format!("Failed Mojang UUID lookup request: {}", e))?;

        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Ok(None);
        }

        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Mojang UUID response: {}", e))?;
        let Some(id_raw) = value.get("id").and_then(|id| id.as_str()) else {
            return Ok(None);
        };
        let normalized = id_raw.trim().replace('-', "").to_lowercase();
        if normalized.len() == 32 && normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
            Ok(Some(normalized))
        } else {
            Ok(None)
        }
    }

    fn calculate_sha1(&self, path: &PathBuf) -> Result<String, String> {
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut hasher = Sha1::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }

    /// Auto-install Java 8 using Homebrew (macOS only)
    async fn auto_install_java8<F>(&self, log_callback: &F) -> Result<String, String>
    where
        F: Fn(String) + Send + Sync,
    {
        log_callback(
            "[INFO] Java 8 not found. Attempting auto-installation via Homebrew...".to_string(),
        );

        // Check if Homebrew is installed
        let brew_check = std::process::Command::new("which").arg("brew").output();

        if brew_check.is_err() || !brew_check.unwrap().status.success() {
            return Err(
                "Homebrew not found. Please install Homebrew first: https://brew.sh".to_string(),
            );
        }

        log_callback("[INFO] Installing Azul Zulu Java 8 (ARM64 compatible)...".to_string());
        log_callback("[INFO] This may take a few minutes and require your password...".to_string());

        // Install zulu@8 cask (supports ARM64, unlike openjdk@8)
        let install_result = std::process::Command::new("brew")
            .args(["install", "--cask", "zulu@8"])
            .output()
            .map_err(|e| format!("Failed to run brew install: {}", e))?;

        if !install_result.status.success() {
            let stderr = String::from_utf8_lossy(&install_result.stderr);
            let stdout = String::from_utf8_lossy(&install_result.stdout);

            // Check if already installed
            if stdout.contains("already installed") || stderr.contains("already installed") {
                log_callback("[INFO] Zulu Java 8 is already installed.".to_string());
            } else {
                return Err(format!("Failed to install Java 8: {}\n{}", stderr, stdout));
            }
        } else {
            log_callback("[INFO] Java 8 installed successfully!".to_string());
        }

        // Now find the installed Java 8
        if let Some(path) = self.find_java_by_version(8) {
            log_callback(format!("[INFO] Found Java 8 at: {}", path));
            return Ok(path);
        }

        // Try Zulu path directly
        let zulu_path = "/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java";
        if std::path::Path::new(zulu_path).exists() {
            log_callback(format!("[INFO] Found Java 8 at: {}", zulu_path));
            return Ok(zulu_path.to_string());
        }

        Err("Java 8 was installed but could not be found. Please restart the launcher.".to_string())
    }

    fn needs_x86_java(_version_id: &str) -> bool {
        // With ARM64 LWJGL natives patching, we don't need x86 Java anymore
        false
    }

    fn find_x86_java(&self) -> Option<String> {
        None
    }

    /// Download and patch ARM64 LWJGL natives for older Minecraft versions on Apple Silicon
    async fn patch_arm64_natives(
        &self,
        version_id: &str,
        version_json: &serde_json::Value,
    ) -> Result<(), String> {
        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        {
            return Ok(()); // Only needed on Apple Silicon
        }

        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            // Determine LWJGL version from libraries
            let lwjgl_version = Self::detect_lwjgl_version(version_json);
            println!(
                "Detected LWJGL version: {} for Minecraft {}",
                lwjgl_version, version_id
            );

            // Check if this version needs ARM64 patching (pre-1.19 doesn't have native ARM64 support)
            let (major, minor, _) = Self::parse_mc_version_numbers(version_id);
            let needs_patch = major == 1 && minor < 19;

            if !needs_patch {
                println!(
                    "Minecraft {} has native ARM64 support, skipping patch",
                    version_id
                );
                return Ok(());
            }

            println!("Patching ARM64 natives for Minecraft {}...", version_id);

            let version_natives_dir = self.natives_dir.join(version_id);
            std::fs::create_dir_all(&version_natives_dir).map_err(|e| e.to_string())?;

            let client = reqwest::Client::builder()
                .user_agent("MinecraftLauncher/1.0")
                .build()
                .map_err(|e| e.to_string())?;

            if lwjgl_version >= 3 {
                // LWJGL 3 - used by MC 1.13+
                self.patch_lwjgl3_arm64(&client, &version_natives_dir)
                    .await?;
            } else {
                // LWJGL 2 - used by MC 1.12.2 and older
                self.patch_lwjgl2_arm64(&client, &version_natives_dir)
                    .await?;
            }

            println!("ARM64 natives patching complete");
            Ok(())
        }
    }

    fn detect_lwjgl_version(version_json: &serde_json::Value) -> u32 {
        // First check libraries in the JSON
        if let Some(libraries) = version_json["libraries"].as_array() {
            for lib in libraries {
                if let Some(name) = lib["name"].as_str() {
                    // Check for LWJGL 3 (org.lwjgl:lwjgl:3.x.x)
                    if name.starts_with("org.lwjgl:lwjgl:3") {
                        return 3;
                    }
                    // Check for LWJGL 2 (org.lwjgl.lwjgl:lwjgl:2.x.x)
                    if name.starts_with("org.lwjgl.lwjgl:lwjgl:2") {
                        return 2;
                    }
                }
            }
        }

        // For modded versions, check inheritsFrom to determine MC version
        if let Some(inherits) = version_json["inheritsFrom"].as_str() {
            return Self::lwjgl_version_for_mc(inherits);
        }

        // Check the id field for version info
        if let Some(id) = version_json["id"].as_str() {
            return Self::lwjgl_version_for_mc(id);
        }

        // Default to LWJGL 2 for very old versions
        2
    }

    /// Determine LWJGL version based on Minecraft version string
    fn lwjgl_version_for_mc(version_str: &str) -> u32 {
        // Extract MC version from strings like "1.17.1-forge-37.1.1" or "1.17.1"
        let mc_version = version_str.split('-').next().unwrap_or(version_str);
        let (major, minor, _) = Self::parse_mc_version_numbers(mc_version);
        if major > 1 || (major == 1 && minor >= 13) {
            // Modern snapshots/future versions and 1.13+ use LWJGL 3
            return 3;
        }

        // MC 1.12.2 and older use LWJGL 2
        2
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    async fn patch_lwjgl3_arm64(
        &self,
        client: &reqwest::Client,
        version_natives_dir: &std::path::Path,
    ) -> Result<(), String> {
        // For LWJGL 3 versions (1.13-1.18), we need ARM64 natives
        // This function ONLY extracts natives to the natives directory
        // It does NOT download JARs to the libraries directory to avoid version conflicts

        let marker_file = version_natives_dir.join(".lwjgl_patched");
        if marker_file.exists() {
            println!("Patched LWJGL natives already present");
            return Ok(());
        }

        // Remove old markers
        let _ = std::fs::remove_file(version_natives_dir.join(".lwjgl333_patched"));
        let _ = std::fs::remove_file(version_natives_dir.join(".lwjgl331_patched"));
        let _ = std::fs::remove_file(version_natives_dir.join(".lwjgl_prism_patched"));

        println!("Downloading LWJGL ARM64 natives for macOS...");

        // Use LWJGL 3.3.3 for ARM64 natives (has proper ARM64 support)
        let lwjgl_version = "3.3.3";

        // Only download and extract natives - NOT the main JARs
        // The main JARs should come from the version JSON (e.g., 3.3.1 for MC 1.20.1)
        let lwjgl3_natives = [
            "lwjgl",
            "lwjgl-glfw",
            "lwjgl-openal",
            "lwjgl-opengl",
            "lwjgl-stb",
            "lwjgl-tinyfd",
            "lwjgl-jemalloc",
        ];

        for artifact in lwjgl3_natives {
            let url = format!(
                "https://repo1.maven.org/maven2/org/lwjgl/{artifact}/{version}/{artifact}-{version}-natives-macos-arm64.jar",
                artifact = artifact,
                version = lwjgl_version
            );
            let jar_filename = format!("{}-{}-arm64.jar", artifact, lwjgl_version);
            let jar_path = self.natives_dir.join(&jar_filename);

            println!("Downloading {}...", jar_filename);
            if let Ok(response) = client.get(&url).send().await {
                if response.status().is_success() {
                    if let Ok(bytes) = response.bytes().await {
                        let _ = std::fs::write(&jar_path, &bytes);
                    }
                }
            }

            // Extract natives
            if jar_path.exists() {
                if let Ok(file) = std::fs::File::open(&jar_path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(file) {
                        for i in 0..archive.len() {
                            if let Ok(mut entry) = archive.by_index(i) {
                                let entry_name = entry.name().to_string();
                                if entry_name.ends_with(".dylib") {
                                    let file_name = std::path::Path::new(&entry_name)
                                        .file_name()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .to_string();
                                    let out_path = version_natives_dir.join(&file_name);

                                    if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                                        let _ = std::io::copy(&mut entry, &mut out_file);
                                        println!("Extracted: {}", file_name);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Download ARM64 natives from Maven Central (LWJGL 3.3.3 has proper ARM64 support)
        println!("Downloading LWJGL 3.3.3 ARM64 natives from Maven...");

        let native_artifacts = [
            "lwjgl",
            "lwjgl-glfw",
            "lwjgl-openal",
            "lwjgl-opengl",
            "lwjgl-stb",
            "lwjgl-tinyfd",
            "lwjgl-jemalloc",
        ];

        for artifact in native_artifacts {
            let native_url = format!(
                "https://repo1.maven.org/maven2/org/lwjgl/{artifact}/{version}/{artifact}-{version}-natives-macos-arm64.jar",
                artifact = artifact,
                version = lwjgl_version
            );

            println!("Downloading {}-natives-macos-arm64.jar...", artifact);
            match client.get(&native_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        if let Ok(bytes) = response.bytes().await {
                            let temp_jar =
                                self.natives_dir.join(format!("{}-natives.jar", artifact));
                            let _ = std::fs::write(&temp_jar, &bytes);

                            // Extract dylibs from the jar
                            if let Ok(file) = std::fs::File::open(&temp_jar) {
                                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                                    for i in 0..archive.len() {
                                        if let Ok(mut entry) = archive.by_index(i) {
                                            let name = entry.name().to_string();
                                            if name.ends_with(".dylib") || name.ends_with(".jnilib")
                                            {
                                                let filename = std::path::Path::new(&name)
                                                    .file_name()
                                                    .unwrap_or_default()
                                                    .to_string_lossy()
                                                    .to_string();
                                                let out_path = version_natives_dir.join(&filename);
                                                if let Ok(mut out_file) =
                                                    std::fs::File::create(&out_path)
                                                {
                                                    let _ =
                                                        std::io::copy(&mut entry, &mut out_file);
                                                    println!("  Extracted: {}", filename);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = std::fs::remove_file(&temp_jar);
                        }
                    }
                }
                Err(e) => println!("Failed to download {}: {}", artifact, e),
            }
        }

        // jinput for controller support
        let jinput_url = "https://github.com/nicknameisthekey/jinput-m1/releases/download/v1.0.0/libjinput-osx.dylib";
        let jinput_path = version_natives_dir.join("libjinput-osx.dylib");

        if !jinput_path.exists() {
            println!("Downloading ARM64 jinput...");
            if let Ok(response) = client.get(jinput_url).send().await {
                if response.status().is_success() {
                    if let Ok(bytes) = response.bytes().await {
                        let _ = std::fs::write(&jinput_path, &bytes);
                    }
                }
            }
        }

        // Also try the jar version
        let jinput_jar_url = "https://github.com/r58Playz/jinput-m1/raw/main/plugins/OSX/bin/jinput-platform-2.0.5.jar";
        let jinput_jar = self.natives_dir.join("jinput-arm64.jar");

        if !jinput_jar.exists() {
            if let Ok(response) = client.get(jinput_jar_url).send().await {
                if response.status().is_success() {
                    if let Ok(bytes) = response.bytes().await {
                        let _ = std::fs::write(&jinput_jar, &bytes);
                    }
                }
            }
        }

        if jinput_jar.exists() {
            if let Ok(file) = std::fs::File::open(&jinput_jar) {
                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                    for i in 0..archive.len() {
                        if let Ok(mut entry) = archive.by_index(i) {
                            let entry_name = entry.name().to_string();
                            if entry_name.ends_with(".dylib") || entry_name.ends_with(".jnilib") {
                                let file_name = std::path::Path::new(&entry_name)
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();
                                let out_path = version_natives_dir.join(&file_name);

                                if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                                    let _ = std::io::copy(&mut entry, &mut out_file);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Build or copy patched GLFW that suppresses error 65548 (macOS icon error)
        let patched_glfw = self.game_dir.join("patched-libs/libglfw-patched.dylib");
        if !patched_glfw.exists() {
            println!("Building patched GLFW (suppresses macOS icon error)...");
            self.build_patched_glfw(&patched_glfw).await?;
        }

        if patched_glfw.exists() {
            let target_glfw = version_natives_dir.join("libglfw.dylib");
            if let Err(e) = std::fs::copy(&patched_glfw, &target_glfw) {
                println!("Warning: Could not copy patched GLFW: {}", e);
            } else {
                println!("Installed patched GLFW (suppresses macOS icon error)");
            }
        }

        let _ = std::fs::write(&marker_file, "lwjgl-3.3.3");
        Ok(())
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    async fn build_patched_glfw(&self, output_path: &std::path::Path) -> Result<(), String> {
        // Use bundled patched GLFW from app resources
        // This is pre-built and included in the app bundle

        println!("Installing bundled patched GLFW library...");

        // Create patched-libs directory
        if let Some(parent) = output_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        // Try to get the bundled resource from the app
        // In dev mode, it's in src-tauri/resources/
        // In production, it's in the app bundle's Resources folder
        let bundled_paths = [
            // Production: inside app bundle
            std::env::current_exe().ok().and_then(|p| {
                p.parent()
                    .map(|p| p.join("../Resources/libglfw-patched.dylib"))
            }),
            // Dev mode: in src-tauri/resources
            Some(std::path::PathBuf::from("resources/libglfw-patched.dylib")),
            Some(std::path::PathBuf::from(
                "src-tauri/resources/libglfw-patched.dylib",
            )),
            // Already installed in game dir
            Some(self.game_dir.join("patched-libs/libglfw-patched.dylib")),
        ];

        for path_opt in bundled_paths.iter() {
            if let Some(path) = path_opt {
                if path.exists() {
                    println!("Found bundled GLFW at: {:?}", path);
                    std::fs::copy(path, output_path)
                        .map_err(|e| format!("Failed to copy bundled GLFW: {}", e))?;
                    println!("Successfully installed patched GLFW");
                    return Ok(());
                }
            }
        }

        // Fallback: try to use system GLFW from Homebrew (if available)
        let homebrew_glfw = std::path::Path::new("/opt/homebrew/lib/libglfw.dylib");
        let homebrew_glfw_cellar =
            std::path::Path::new("/opt/homebrew/Cellar/glfw/3.4/lib/libglfw.3.4.dylib");

        for glfw_path in [homebrew_glfw, homebrew_glfw_cellar] {
            if glfw_path.exists() {
                println!("Using Homebrew GLFW as fallback (may show icon dialog)...");
                std::fs::copy(glfw_path, output_path)
                    .map_err(|e| format!("Failed to copy Homebrew GLFW: {}", e))?;
                return Ok(());
            }
        }

        // Final fallback: download standard GLFW from Maven
        println!("Downloading standard GLFW from Maven...");
        let client = reqwest::Client::new();
        let maven_url = "https://repo1.maven.org/maven2/org/lwjgl/lwjgl-glfw/3.3.3/lwjgl-glfw-3.3.3-natives-macos-arm64.jar";

        match client.get(maven_url).send().await {
            Ok(response) if response.status().is_success() => {
                if let Ok(bytes) = response.bytes().await {
                    let temp_jar = self.game_dir.join("temp-glfw.jar");
                    std::fs::write(&temp_jar, &bytes).map_err(|e| e.to_string())?;

                    // Extract libglfw.dylib from jar
                    if let Ok(file) = std::fs::File::open(&temp_jar) {
                        if let Ok(mut archive) = zip::ZipArchive::new(file) {
                            for i in 0..archive.len() {
                                if let Ok(mut entry) = archive.by_index(i) {
                                    if entry.name().contains("glfw")
                                        && entry.name().ends_with(".dylib")
                                    {
                                        let mut data = Vec::new();
                                        if entry.read_to_end(&mut data).is_ok() {
                                            std::fs::write(output_path, &data)
                                                .map_err(|e| e.to_string())?;
                                            let _ = std::fs::remove_file(&temp_jar);
                                            println!("Warning: Using standard GLFW - icon error dialog may appear");
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    let _ = std::fs::remove_file(&temp_jar);
                }
            }
            _ => {}
        }

        Err("Could not install GLFW library. Please check your internet connection.".to_string())
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    async fn patch_lwjgl2_arm64(
        &self,
        client: &reqwest::Client,
        version_natives_dir: &std::path::Path,
    ) -> Result<(), String> {
        // Check if already patched
        let lwjgl_path = version_natives_dir.join("liblwjgl.dylib");
        if lwjgl_path.exists() {
            if let Ok(output) = std::process::Command::new("file").arg(&lwjgl_path).output() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                if output_str.contains("arm64") {
                    println!("ARM64 LWJGL2 natives already present");
                    return Ok(());
                }
            }
        }

        println!("Downloading ARM64 LWJGL 2 natives...");

        // Download ARM64 LWJGL 2.9.4 natives from MinecraftMachina
        let lwjgl_arm64_url = "https://github.com/MinecraftMachina/lwjgl/releases/download/2.9.4-20150209-mmachina.2/lwjgl-platform-2.9.4-nightly-20150209-natives-osx.jar";
        let lwjgl_jar_path = self.natives_dir.join("lwjgl2-arm64-natives.jar");

        if !lwjgl_jar_path.exists() {
            match client.get(lwjgl_arm64_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        if let Ok(bytes) = response.bytes().await {
                            let _ = std::fs::write(&lwjgl_jar_path, &bytes);
                            println!("Downloaded ARM64 LWJGL 2 natives");
                        }
                    } else {
                        println!(
                            "Failed to download LWJGL2 ARM64: HTTP {}",
                            response.status()
                        );
                    }
                }
                Err(e) => println!("Failed to download LWJGL2 ARM64: {}", e),
            }
        }

        // Extract LWJGL natives
        if lwjgl_jar_path.exists() {
            if let Ok(file) = std::fs::File::open(&lwjgl_jar_path) {
                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                    for i in 0..archive.len() {
                        if let Ok(mut entry) = archive.by_index(i) {
                            let entry_name = entry.name().to_string();
                            if entry_name.ends_with(".dylib") || entry_name.ends_with(".jnilib") {
                                let file_name = std::path::Path::new(&entry_name)
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();
                                let out_path = version_natives_dir.join(&file_name);

                                if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                                    let _ = std::io::copy(&mut entry, &mut out_file);
                                    println!("Extracted ARM64 native: {}", file_name);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Download ARM64 jinput natives
        let jinput_arm64_url = "https://github.com/r58Playz/jinput-m1/raw/main/plugins/OSX/bin/jinput-platform-2.0.5.jar";
        let jinput_jar_path = self.natives_dir.join("jinput2-arm64-natives.jar");

        if !jinput_jar_path.exists() {
            println!("Downloading ARM64 jinput natives...");
            match client.get(jinput_arm64_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        if let Ok(bytes) = response.bytes().await {
                            let _ = std::fs::write(&jinput_jar_path, &bytes);
                        }
                    }
                }
                Err(e) => println!("Failed to download jinput ARM64: {}", e),
            }
        }

        // Extract jinput natives
        if jinput_jar_path.exists() {
            if let Ok(file) = std::fs::File::open(&jinput_jar_path) {
                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                    for i in 0..archive.len() {
                        if let Ok(mut entry) = archive.by_index(i) {
                            let entry_name = entry.name().to_string();
                            if entry_name.ends_with(".dylib") || entry_name.ends_with(".jnilib") {
                                let file_name = std::path::Path::new(&entry_name)
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();
                                let out_path = version_natives_dir.join(&file_name);

                                if let Ok(mut out_file) = std::fs::File::create(&out_path) {
                                    let _ = std::io::copy(&mut entry, &mut out_file);
                                    println!("Extracted ARM64 native: {}", file_name);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn find_java_by_version(&self, version: u8) -> Option<String> {
        #[cfg(target_os = "macos")]
        let paths: Vec<&str> = match version {
            25 => vec![
                "/opt/homebrew/opt/openjdk@25/bin/java",
                "/usr/local/opt/openjdk@25/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-25.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/zulu-25.jdk/Contents/Home/bin/java",
            ],
            21 => vec![
                "/opt/homebrew/opt/openjdk@21/bin/java",
                "/usr/local/opt/openjdk@21/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home/bin/java",
            ],
            17 => vec![
                "/opt/homebrew/opt/openjdk@17/bin/java",
                "/usr/local/opt/openjdk@17/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home/bin/java",
            ],
            16 => vec![
                "/opt/homebrew/opt/openjdk@16/bin/java",
                "/usr/local/opt/openjdk@16/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-16.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-16.jdk/Contents/Home/bin/java",
            ],
            11 => vec![
                "/opt/homebrew/opt/openjdk@11/bin/java",
                "/usr/local/opt/openjdk@11/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-11.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/zulu-11.jdk/Contents/Home/bin/java",
            ],
            8 => vec![
                "/opt/homebrew/opt/openjdk@8/bin/java",
                "/usr/local/opt/openjdk@8/bin/java",
                "/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/openjdk-8.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java",
                "/Library/Java/JavaVirtualMachines/adoptopenjdk-8.jdk/Contents/Home/bin/java",
            ],
            _ => vec![],
        };

        #[cfg(target_os = "windows")]
        let paths: Vec<&str> = match version {
            25 => vec![
                "C:\\Program Files\\Java\\jdk-25\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe",
                "C:\\Program Files\\Zulu\\zulu-25\\bin\\java.exe",
                "C:\\Program Files\\Microsoft\\jdk-25\\bin\\java.exe",
            ],
            21 => vec![
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe",
                "C:\\Program Files\\Zulu\\zulu-21\\bin\\java.exe",
                "C:\\Program Files\\Microsoft\\jdk-21\\bin\\java.exe",
            ],
            17 => vec![
                "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin\\java.exe",
                "C:\\Program Files\\Zulu\\zulu-17\\bin\\java.exe",
                "C:\\Program Files\\Microsoft\\jdk-17\\bin\\java.exe",
            ],
            16 => vec![
                "C:\\Program Files\\Java\\jdk-16\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-16\\bin\\java.exe",
            ],
            11 => vec![
                "C:\\Program Files\\Java\\jdk-11\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-11\\bin\\java.exe",
                "C:\\Program Files\\Zulu\\zulu-11\\bin\\java.exe",
            ],
            8 => vec![
                "C:\\Program Files\\Java\\jdk1.8.0_*\\bin\\java.exe",
                "C:\\Program Files\\Java\\jre1.8.0_*\\bin\\java.exe",
                "C:\\Program Files\\Eclipse Adoptium\\jdk-8\\bin\\java.exe",
                "C:\\Program Files\\Zulu\\zulu-8\\bin\\java.exe",
            ],
            _ => vec![],
        };

        #[cfg(target_os = "linux")]
        let paths: Vec<&str> = match version {
            25 => vec![
                "/usr/lib/jvm/java-25-openjdk/bin/java",
                "/usr/lib/jvm/temurin-25-jdk/bin/java",
                "/usr/lib/jvm/java-25-openjdk-amd64/bin/java",
            ],
            21 => vec![
                "/usr/lib/jvm/java-21-openjdk/bin/java",
                "/usr/lib/jvm/temurin-21-jdk/bin/java",
                "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
            ],
            17 => vec![
                "/usr/lib/jvm/java-17-openjdk/bin/java",
                "/usr/lib/jvm/temurin-17-jdk/bin/java",
                "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
            ],
            16 => vec![
                "/usr/lib/jvm/java-16-openjdk/bin/java",
                "/usr/lib/jvm/java-16-openjdk-amd64/bin/java",
            ],
            11 => vec![
                "/usr/lib/jvm/java-11-openjdk/bin/java",
                "/usr/lib/jvm/temurin-11-jdk/bin/java",
                "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
            ],
            8 => vec![
                "/usr/lib/jvm/java-8-openjdk/bin/java",
                "/usr/lib/jvm/temurin-8-jdk/bin/java",
                "/usr/lib/jvm/java-8-openjdk-amd64/bin/java",
            ],
            _ => vec![],
        };

        for path in paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        None
    }

    fn find_any_java(&self) -> Option<String> {
        println!("[DEBUG] find_any_java: Starting comprehensive Java search...");

        // Check JAVA_HOME first
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            println!("[DEBUG] Checking JAVA_HOME: {}", java_home);
            #[cfg(target_os = "windows")]
            let java_path = std::path::Path::new(&java_home).join("bin/java.exe");
            #[cfg(not(target_os = "windows"))]
            let java_path = std::path::Path::new(&java_home).join("bin/java");

            if java_path.exists() {
                // Verify this Java actually works
                if let Ok(output) = std::process::Command::new(&java_path)
                    .arg("-version")
                    .output()
                {
                    if output.status.success() {
                        println!(
                            "[DEBUG] Found working Java via JAVA_HOME: {}",
                            java_path.display()
                        );
                        return Some(java_path.to_string_lossy().to_string());
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        let paths = vec![
            "/opt/homebrew/opt/openjdk@21/bin/java",
            "/opt/homebrew/opt/openjdk@17/bin/java",
            "/opt/homebrew/opt/openjdk/bin/java",
            "/opt/homebrew/bin/java",
            "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java",
            "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java",
            "/usr/bin/java",
        ];

        #[cfg(target_os = "windows")]
        let mut paths: Vec<String> = Vec::new();

        #[cfg(target_os = "windows")]
        {
            // Scan Program Files for all Java installations
            let program_files_dirs = vec!["C:\\Program Files", "C:\\Program Files (x86)"];

            for pf in &program_files_dirs {
                // Eclipse Adoptium / Temurin
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Eclipse Adoptium", pf)) {
                    for entry in entries.flatten() {
                        let java_exe = entry.path().join("bin").join("java.exe");
                        if java_exe.exists() {
                            paths.push(java_exe.to_string_lossy().to_string());
                        }
                    }
                }

                // Oracle/OpenJDK Java
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Java", pf)) {
                    for entry in entries.flatten() {
                        let java_exe = entry.path().join("bin").join("java.exe");
                        if java_exe.exists() {
                            paths.push(java_exe.to_string_lossy().to_string());
                        }
                    }
                }

                // Microsoft OpenJDK
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Microsoft", pf)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains("jdk") {
                            let java_exe = entry.path().join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }

                // Zulu JDK
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Zulu", pf)) {
                    for entry in entries.flatten() {
                        let java_exe = entry.path().join("bin").join("java.exe");
                        if java_exe.exists() {
                            paths.push(java_exe.to_string_lossy().to_string());
                        }
                    }
                }

                // Amazon Corretto
                if let Ok(entries) = std::fs::read_dir(format!("{}\\Amazon Corretto", pf)) {
                    for entry in entries.flatten() {
                        let java_exe = entry.path().join("bin").join("java.exe");
                        if java_exe.exists() {
                            paths.push(java_exe.to_string_lossy().to_string());
                        }
                    }
                }
            }

            // Add common hardcoded paths as fallback
            paths.extend(vec![
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe".to_string(),
                "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe".to_string(),
                "C:\\Program Files\\Java\\jdk-8\\bin\\java.exe".to_string(),
                "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe".to_string(),
                "C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin\\java.exe".to_string(),
            ]);
        }

        #[cfg(target_os = "linux")]
        let mut paths = vec![
            "/usr/bin/java",
            "/usr/lib/jvm/default-java/bin/java",
            "/usr/lib/jvm/java-21-openjdk/bin/java",
            "/usr/lib/jvm/java-17-openjdk/bin/java",
            "/usr/lib/jvm/java-8-openjdk/bin/java",
        ];

        println!("[DEBUG] Checking {} potential Java paths...", paths.len());

        for path in &paths {
            let path_obj = std::path::Path::new(path);
            if path_obj.exists() {
                println!("[DEBUG] Found Java at: {}", path);
                // Verify this Java actually works (not just a stub)
                if let Ok(output) = std::process::Command::new(path).arg("-version").output() {
                    if output.status.success() {
                        let version_str = String::from_utf8_lossy(&output.stderr);
                        println!(
                            "[DEBUG] Java version output: {}",
                            version_str.lines().next().unwrap_or("")
                        );
                        return Some(path.to_string());
                    } else {
                        println!("[DEBUG] Java at {} failed version check", path);
                    }
                } else {
                    println!("[DEBUG] Java at {} failed to execute", path);
                }
            }
        }

        // Try which/where command as last resort
        #[cfg(target_os = "windows")]
        {
            println!("[DEBUG] Trying 'where java' command...");
            if let Ok(output) = Command::new("where").arg("java").output() {
                if output.status.success() {
                    let paths_str = String::from_utf8_lossy(&output.stdout);
                    for path in paths_str.lines() {
                        let path = path.trim();
                        if !path.is_empty() && std::path::Path::new(path).exists() {
                            // Verify it works
                            if let Ok(ver_output) =
                                std::process::Command::new(path).arg("-version").output()
                            {
                                if ver_output.status.success() {
                                    println!("[DEBUG] Found working Java via 'where': {}", path);
                                    return Some(path.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            println!("[DEBUG] Trying 'which java' command...");
            if let Ok(output) = Command::new("which").arg("java").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        // Verify it works
                        if let Ok(ver_output) =
                            std::process::Command::new(&path).arg("-version").output()
                        {
                            if ver_output.status.success() {
                                println!("[DEBUG] Found working Java via 'which': {}", path);
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }

        println!("[DEBUG] No Java found in any location");
        None
    }
}
