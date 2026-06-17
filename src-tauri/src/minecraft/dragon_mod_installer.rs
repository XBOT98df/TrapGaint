use serde::Deserialize;
use std::cmp::Ordering;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const MODRINTH_API_URL: &str = "https://api.modrinth.com/v2";
const GITHUB_API_URL: &str = "https://api.github.com";
const DRAGON_CLIENT_REPO: &str = "dhhd67807-lgtm/dragon-client-mod";

// Required mods for Dragon Client with their Modrinth project IDs
const REQUIRED_MODS: &[(&str, &str)] = &[];

// Performance mods to install in "Exclusive" folder (visible to users)
// These are optional performance enhancements + required dependencies
const EXCLUSIVE_MODS: &[(&str, &str)] = &[
    ("fabric-api", "P7dR8mSH"), // Fabric API (required)
];

// Mods to exclude for specific Minecraft versions
const EXCLUSIVE_VERSION_EXCLUSIONS: &[(&str, &str)] = &[
    // No exclusions needed - only Fabric API is installed
];

// No version exclusions needed for required mods
const VERSION_EXCLUSIONS: &[(&str, &str)] = &[];

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    project_id: String,
    version_number: String,
    #[allow(dead_code)]
    game_versions: Vec<String>,
    #[allow(dead_code)]
    loaders: Vec<String>,
    files: Vec<ModrinthFile>,
}

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    url: String,
    filename: String,
    primary: bool,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Clone)]
struct ExpectedDragonMod {
    download_url: String,
    filename: String,
    sha256: Option<String>,
    size: u64,
}

impl super::MinecraftLauncher {
    #[cfg(target_os = "macos")]
    fn clear_immutable_flag(path: &Path) {
        let _ = std::process::Command::new("chflags")
            .arg("nouchg")
            .arg(path)
            .output();
    }

    #[cfg(not(target_os = "macos"))]
    fn clear_immutable_flag(_path: &Path) {}

    fn remove_existing_dragon_file(path: &Path) -> Result<(), String> {
        if !path.exists() {
            return Ok(());
        }

        Self::clear_immutable_flag(path);
        fs::remove_file(path).map_err(|e| {
            format!(
                "Failed to remove existing Dragon Client jar {}: {}",
                path.display(),
                e
            )
        })
    }

    fn extract_dragon_mod_version(filename: &str, mc_version: &str) -> Option<String> {
        filename
            .strip_prefix(&format!("dragon-client-{}-", mc_version))
            .and_then(|s| s.strip_suffix(".jar"))
            .map(|s| s.to_string())
    }

    fn compare_dragon_mod_versions(a: &str, b: &str) -> Ordering {
        let parse = |value: &str| -> Vec<u32> {
            value
                .split('.')
                .map(|part| part.parse::<u32>().unwrap_or(0))
                .collect()
        };

        let a_parts = parse(a);
        let b_parts = parse(b);
        let max_len = a_parts.len().max(b_parts.len());

        for index in 0..max_len {
            let a_part = *a_parts.get(index).unwrap_or(&0);
            let b_part = *b_parts.get(index).unwrap_or(&0);
            match a_part.cmp(&b_part) {
                Ordering::Equal => continue,
                non_equal => return non_equal,
            }
        }

        Ordering::Equal
    }

    fn dragon_mods_dir(&self, version_id: &str) -> PathBuf {
        if version_id.starts_with("dragon-") {
            self.game_dir
                .join("instances")
                .join(version_id)
                .join("mods")
        } else {
            self.game_dir.join("mods")
        }
    }

    fn find_installed_dragon_mod_jar(&self, version_id: &str) -> Option<PathBuf> {
        let mods_dir = self.dragon_mods_dir(version_id);
        let entries = fs::read_dir(&mods_dir).ok()?;

        entries.flatten().find_map(|entry| {
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename.starts_with("dragon-client") && filename.ends_with(".jar") {
                Some(entry.path())
            } else {
                None
            }
        })
    }

    fn remove_all_dragon_client_jars(&self, version_id: &str) -> Result<usize, String> {
        let mods_dir = self.dragon_mods_dir(version_id);
        if !mods_dir.exists() {
            return Ok(0);
        }

        let mut removed = 0usize;
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let filename = entry.file_name().to_string_lossy().to_lowercase();
                let is_dragon_jar = filename.starts_with("dragon-client")
                    && (filename.ends_with(".jar") || filename.ends_with(".jar.download"));
                if is_dragon_jar {
                    Self::remove_existing_dragon_file(&entry.path())?;
                    removed += 1;
                }
            }
        }

        fs::remove_file(mods_dir.join(".dragon-client-version")).ok();
        Ok(removed)
    }

    fn install_dragon_compat_stub(
        &self,
        version_id: &str,
        mc_version: &str,
    ) -> Result<String, String> {
        let mods_dir = self.dragon_mods_dir(version_id);
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create Dragon mods directory: {}", e))?;

        let filename = format!("dragon-client-{}-compat.jar", mc_version);
        let mod_path = mods_dir.join(&filename);
        Self::remove_existing_dragon_file(&mod_path).ok();

        let file = fs::File::create(&mod_path)
            .map_err(|e| format!("Failed to create Dragon compatibility mod: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let fabric_mod_json = serde_json::json!({
            "schemaVersion": 1,
            "id": "dragonclient",
            "version": "0.0.0-compat",
            "name": "Dragon Client (Compatibility Mode)",
            "description": format!(
                "Temporary Dragon compatibility shim for Minecraft {} while the full Dragon Client build is unavailable.",
                mc_version
            ),
            "environment": "client",
            "depends": {
                "fabricloader": ">=0.14.0",
                "minecraft": format!(">={}", mc_version),
                "fabric-api": "*"
            }
        });

        zip.start_file("fabric.mod.json", options)
            .map_err(|e| format!("Failed to write compatibility mod metadata: {}", e))?;
        let json_bytes = serde_json::to_vec_pretty(&fabric_mod_json)
            .map_err(|e| format!("Failed to encode compatibility mod metadata: {}", e))?;
        zip.write_all(&json_bytes)
            .map_err(|e| format!("Failed to write compatibility mod file: {}", e))?;
        zip.finish()
            .map_err(|e| format!("Failed to finalize compatibility mod: {}", e))?;

        fs::write(mods_dir.join(".dragon-client-version"), "compat").ok();
        Ok(filename)
    }

    fn unsupported_dragon_status(
        mc_version: &str,
        removed_count: usize,
        compat_filename: &str,
    ) -> String {
        if removed_count > 0 {
            format!(
                "Dragon Client for Minecraft {} is not released yet. Removed {} incompatible Dragon jar(s) and installed {} (compatibility mode).",
                mc_version, removed_count, compat_filename
            )
        } else {
            format!(
                "Dragon Client for Minecraft {} is not released yet. Installed {} (compatibility mode).",
                mc_version, compat_filename
            )
        }
    }

    fn find_local_dev_dragon_mod(&self, mc_version: &str) -> Option<PathBuf> {
        let mut search_roots = Vec::new();

        if let Ok(current_dir) = std::env::current_dir() {
            search_roots.push(current_dir.join("dragon-client-mod"));
            search_roots.push(current_dir.join("../dragon-client-mod"));
        }

        if let Some(repo_root) = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent() {
            search_roots.push(repo_root.join("dragon-client-mod"));
        }

        let version_dir_name = format!("{}-fabric", mc_version);
        let file_prefix = format!("dragon-client-{}-", mc_version);
        let mut best_match: Option<(PathBuf, String, std::time::SystemTime)> = None;

        for root in search_roots {
            let libs_dir = root
                .join("versions")
                .join(&version_dir_name)
                .join("build")
                .join("libs");
            if !libs_dir.exists() {
                continue;
            }

            let Ok(entries) = fs::read_dir(&libs_dir) else {
                continue;
            };

            for entry in entries.flatten() {
                let path = entry.path();
                let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };

                if !filename.starts_with(&file_prefix) || !filename.ends_with(".jar") {
                    continue;
                }

                let Some(version) = Self::extract_dragon_mod_version(filename, mc_version) else {
                    continue;
                };

                let Ok(metadata) = entry.metadata() else {
                    continue;
                };

                if metadata.len() < 50_000 {
                    continue;
                }

                let modified = metadata
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                match &best_match {
                    Some((_, current_version, current_modified)) => {
                        match Self::compare_dragon_mod_versions(&version, current_version) {
                            Ordering::Greater => best_match = Some((path, version, modified)),
                            Ordering::Equal if modified > *current_modified => {
                                best_match = Some((path, version, modified))
                            }
                            _ => {}
                        }
                    }
                    None => best_match = Some((path, version, modified)),
                }
            }
        }

        best_match.map(|(path, _, _)| path)
    }

    fn sync_local_dev_dragon_mod(&self, version_id: &str) -> Result<Option<String>, String> {
        let mc_version = if version_id.starts_with("dragon-") {
            version_id.strip_prefix("dragon-").unwrap_or(version_id)
        } else {
            version_id
        };

        let Some(local_jar) = self.find_local_dev_dragon_mod(mc_version) else {
            return Ok(None);
        };

        let mods_dir = self.dragon_mods_dir(version_id);
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create Dragon mods directory: {}", e))?;

        let filename = local_jar
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Local Dragon Client jar has an invalid filename".to_string())?
            .to_string();

        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let entry_name = entry.file_name().to_string_lossy().to_string();
                if entry_name.starts_with("dragon-client")
                    && entry_name.ends_with(".jar")
                    && entry_name != filename
                {
                    Self::remove_existing_dragon_file(&entry.path())?;
                }
            }
        }

        let dest_path = mods_dir.join(&filename);
        Self::remove_existing_dragon_file(&dest_path)?;
        fs::copy(&local_jar, &dest_path)
            .map_err(|e| format!("Failed to copy local Dragon Client jar: {}", e))?;

        let version_number = filename
            .strip_prefix(&format!("dragon-client-{}-", mc_version))
            .and_then(|s| s.strip_suffix(".jar"))
            .unwrap_or("unknown");

        fs::write(mods_dir.join(".dragon-client-version"), version_number).ok();

        println!(
            "[Dragon] Synced local dev Dragon Client jar for {}: {}",
            mc_version,
            dest_path.display()
        );

        Ok(Some(filename))
    }

    pub fn use_local_dev_dragon_mod(&self, version_id: &str) -> Result<String, String> {
        self.sync_local_dev_dragon_mod(version_id)?
            .ok_or_else(|| format!("No local Dragon Client jar found for {}", version_id))
    }

    async fn get_expected_dragon_mod_metadata(
        &self,
        mc_version: &str,
    ) -> Result<Option<ExpectedDragonMod>, String> {
        let Some(mod_version) = super::dragon_updater::check_for_updates(mc_version).await? else {
            return Ok(None);
        };

        let filename = mod_version
            .url
            .rsplit('/')
            .next()
            .unwrap_or("dragon-client.jar")
            .to_string();

        Ok(Some(ExpectedDragonMod {
            download_url: mod_version.url,
            filename,
            sha256: Some(mod_version.sha256),
            size: mod_version.size.unwrap_or(0),
        }))
    }

    /// Check if Dragon Client mod is installed for a Dragon instance
    pub fn is_dragon_mod_installed(&self, version_id: &str) -> bool {
        let mods_dir = self.dragon_mods_dir(version_id);

        if !mods_dir.exists() {
            return false;
        }

        // Check if any dragon-client JAR exists
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let filename = entry.file_name().to_string_lossy().to_string();
                if filename.starts_with("dragon-client") && filename.ends_with(".jar") {
                    return true;
                }
            }
        }

        false
    }

    /// Get the latest Dragon Client mod version from GitHub releases for a specific Minecraft version
    async fn get_dragon_mod_from_github(
        &self,
        mc_version: &str,
    ) -> Result<(String, String, u64), String> {
        let client = reqwest::Client::builder()
            .user_agent("DragonLauncher/1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        // Get latest release
        let url = format!(
            "{}/repos/{}/releases/latest",
            GITHUB_API_URL, DRAGON_CLIENT_REPO
        );

        println!("[Dragon Mod] Fetching latest release from GitHub: {}", url);

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch GitHub releases: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API returned status: {}. Make sure the dragon-client-mod repository has releases with mod JARs.", response.status()));
        }

        let release: GitHubRelease = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse GitHub release: {}", e))?;

        println!("[Dragon Mod] Found release: {}", release.tag_name);
        println!(
            "[Dragon Mod] Available assets: {:?}",
            release.assets.iter().map(|a| &a.name).collect::<Vec<_>>()
        );

        // Find the JAR for this MC version (e.g., "dragon-client-1.21.1-1.0.0.jar")
        let asset = release.assets.iter()
            .find(|a| a.name.contains(&format!("-{}-", mc_version)) && a.name.ends_with(".jar"))
            .ok_or_else(|| format!(
                "No Dragon Client JAR found for Minecraft {} in latest release {}. Available assets: {:?}. \
                Please ensure the dragon-client-mod is built and released with JARs named like 'dragon-client-{}-X.X.X.jar'",
                mc_version, release.tag_name, release.assets.iter().map(|a| &a.name).collect::<Vec<_>>(), mc_version
            ))?;

        println!("[Dragon Mod] Found mod JAR: {}", asset.name);

        Ok((
            asset.browser_download_url.clone(),
            asset.name.clone(),
            asset.size,
        ))
    }

    /// Get a mod version from Modrinth for a specific Minecraft version
    async fn get_modrinth_mod(
        &self,
        project_id: &str,
        mc_version: &str,
    ) -> Result<Option<ModrinthVersion>, String> {
        let client = reqwest::Client::builder()
            .user_agent("DragonLauncher/1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        // Get project versions filtered by game version and loader
        let url = format!(
            "{}/project/{}/version?game_versions=[\"{}\"]&loaders=[\"fabric\"]",
            MODRINTH_API_URL, project_id, mc_version
        );

        let response = client.get(&url).send().await.map_err(|e| {
            format!(
                "Failed to fetch Modrinth versions for {}: {}",
                project_id, e
            )
        })?;

        if !response.status().is_success() {
            // Mod might not be available for this version
            println!(
                "[Dragon Mod] Mod {} not available for Minecraft {}",
                project_id, mc_version
            );
            return Ok(None);
        }

        let versions: Vec<ModrinthVersion> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Modrinth versions: {}", e))?;

        // Get the first (latest) version
        Ok(versions.into_iter().next())
    }

    /// Install all required mods for Dragon Client in hidden folder
    async fn install_required_mods<F>(
        &self,
        version_id: &str,
        mc_version: &str,
        progress_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Use hidden mods folder
        let instance_dir = if version_id.starts_with("dragon-") {
            self.game_dir.join("instances").join(version_id)
        } else {
            self.game_dir.clone()
        };

        let mods_dir = instance_dir.join("mods");

        // Create mods directory
        println!(
            "[Dragon Mod] Creating mods directory: {}",
            mods_dir.display()
        );
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;

        // Verify directory was created
        if !mods_dir.exists() {
            return Err(format!(
                "Mods directory was not created: {}",
                mods_dir.display()
            ));
        }
        println!("[Dragon Mod] ✓ Mods directory created");

        let total_mods = REQUIRED_MODS.len();

        for (index, (mod_name, project_id)) in REQUIRED_MODS.iter().enumerate() {
            // Check if this mod should be excluded for this version
            let is_excluded = VERSION_EXCLUSIONS.iter().any(|(version, excluded_mod)| {
                *version == mc_version && *excluded_mod == *mod_name
            });

            if is_excluded {
                println!(
                    "[Dragon Mod] Skipping {} for Minecraft {} (excluded)",
                    mod_name, mc_version
                );
                continue;
            }
            let base_progress = 0.1 + (0.4 * (index as f32 / total_mods as f32));

            progress_callback(base_progress, format!("Checking {}...", mod_name));

            // Check if mod is already installed
            let mod_installed = if let Ok(entries) = fs::read_dir(&mods_dir) {
                entries.flatten().any(|entry| {
                    let filename = entry.file_name().to_string_lossy().to_lowercase();
                    filename.contains(&mod_name.to_lowercase()) && filename.ends_with(".jar")
                })
            } else {
                false
            };

            if mod_installed {
                println!("[Dragon Mod] {} already installed", mod_name);
                continue;
            }

            progress_callback(base_progress + 0.01, format!("Downloading {}...", mod_name));

            // Try to get mod from Modrinth
            match self.get_modrinth_mod(project_id, mc_version).await {
                Ok(Some(mod_version)) => {
                    // Find the primary file
                    if let Some(file) = mod_version
                        .files
                        .iter()
                        .find(|f| f.primary)
                        .or_else(|| mod_version.files.first())
                    {
                        println!("[Dragon Mod] Downloading {} from: {}", mod_name, file.url);

                        // Download the mod
                        if let Ok(bytes) = self
                            .download_file_with_progress(&file.url, file.size, |p| {
                                let download_progress = base_progress + 0.01 + (0.03 * p);
                                progress_callback(
                                    download_progress,
                                    format!("Downloading {}... {}%", mod_name, (p * 100.0) as u32),
                                );
                            })
                            .await
                        {
                            // Save to mods directory
                            let mod_path = mods_dir.join(&file.filename);
                            println!(
                                "[Dragon Mod] Saving {} to: {}",
                                mod_name,
                                mod_path.display()
                            );

                            fs::write(&mod_path, &bytes)
                                .map_err(|e| format!("Failed to save {}: {}", mod_name, e))?;

                            // Verify file was saved
                            if !mod_path.exists() {
                                println!(
                                    "[Dragon Mod] ERROR: File was not saved: {}",
                                    mod_path.display()
                                );
                                continue;
                            }

                            println!(
                                "[Dragon Mod] ✓ Installed {}: {} ({} bytes)",
                                mod_name,
                                file.filename,
                                bytes.len()
                            );
                        } else {
                            println!("[Dragon Mod] Failed to download {}", mod_name);
                        }
                    }
                }
                Ok(None) => {
                    println!(
                        "[Dragon Mod] {} not available for Minecraft {}, skipping",
                        mod_name, mc_version
                    );
                }
                Err(e) => {
                    println!("[Dragon Mod] Failed to fetch {}: {}, skipping", mod_name, e);
                }
            }
        }

        Ok(())
    }

    /// Install exclusive performance mods directly in main mods folder
    async fn install_exclusive_mods<F>(
        &self,
        version_id: &str,
        mc_version: &str,
        progress_callback: &F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("[Dragon] ========== INSTALL EXCLUSIVE MODS START ==========");
        println!("[Dragon] Version ID: {}", version_id);
        println!("[Dragon] MC Version: {}", mc_version);
        println!("[Dragon] Game Dir: {}", self.game_dir.display());

        let instance_dir = if version_id.starts_with("dragon-") {
            self.game_dir.join("instances").join(version_id)
        } else {
            self.game_dir.clone()
        };

        println!("[Dragon] Instance Dir: {}", instance_dir.display());

        // Install directly to main mods folder (Fabric loads from here)
        let mods_dir = instance_dir.join("mods");

        // Create mods directory
        println!("[Dragon] Creating mods directory: {}", mods_dir.display());
        match fs::create_dir_all(&mods_dir) {
            Ok(_) => println!("[Dragon] ✓ Mods directory created successfully"),
            Err(e) => {
                println!("[Dragon] ✗ Failed to create mods directory: {}", e);
                return Err(format!("Failed to create mods directory: {}", e));
            }
        }

        // Verify directory exists
        if mods_dir.exists() {
            println!("[Dragon] ✓ Mods directory exists and is accessible");
        } else {
            println!("[Dragon] ✗ WARNING: Mods directory does not exist after creation!");
        }

        let total_mods = EXCLUSIVE_MODS.len();
        println!("[Dragon] Total mods to install: {}", total_mods);
        println!(
            "[Dragon] Mods list: {:?}",
            EXCLUSIVE_MODS
                .iter()
                .map(|(name, _)| name)
                .collect::<Vec<_>>()
        );

        for (index, (mod_name, project_id)) in EXCLUSIVE_MODS.iter().enumerate() {
            println!(
                "[Dragon] ========== Processing mod {}/{}: {} ==========",
                index + 1,
                total_mods,
                mod_name
            );
            println!("[Dragon] Project ID: {}", project_id);

            // Check if this mod should be excluded for this version
            let is_excluded = EXCLUSIVE_VERSION_EXCLUSIONS
                .iter()
                .any(|(version, excluded_mod)| {
                    *version == mc_version && *excluded_mod == *mod_name
                });

            if is_excluded {
                println!(
                    "[Dragon] ✗ Skipping {} for Minecraft {} (excluded)",
                    mod_name, mc_version
                );
                continue;
            }

            println!(
                "[Dragon] ✓ Mod {} is not excluded for version {}",
                mod_name, mc_version
            );

            let base_progress = 0.5 + (0.4 * (index as f32 / total_mods as f32));

            progress_callback(base_progress, format!("Checking {}...", mod_name));

            // Check if mod is already installed
            println!(
                "[Dragon] Checking if {} is already installed in mods folder...",
                mod_name
            );
            let mod_installed = if let Ok(entries) = fs::read_dir(&mods_dir) {
                let installed = entries.flatten().any(|entry| {
                    let filename = entry.file_name().to_string_lossy().to_lowercase();
                    filename.contains(&mod_name.to_lowercase()) && filename.ends_with(".jar")
                });
                if installed {
                    println!("[Dragon] ✓ {} already installed", mod_name);
                } else {
                    println!("[Dragon] ✗ {} not found in mods folder", mod_name);
                }
                installed
            } else {
                println!("[Dragon] ✗ Could not read mods directory");
                false
            };

            if mod_installed {
                println!("[Dragon] Skipping {} (already installed)", mod_name);
                continue;
            }

            progress_callback(base_progress + 0.01, format!("Downloading {}...", mod_name));
            println!("[Dragon] Fetching {} from Modrinth API...", mod_name);

            // Try to get mod from Modrinth
            match self.get_modrinth_mod(project_id, mc_version).await {
                Ok(Some(mod_version)) => {
                    println!(
                        "[Dragon] ✓ Found {} version: {}",
                        mod_name, mod_version.version_number
                    );
                    println!("[Dragon] Files available: {}", mod_version.files.len());

                    if let Some(file) = mod_version
                        .files
                        .iter()
                        .find(|f| f.primary)
                        .or_else(|| mod_version.files.first())
                    {
                        println!("[Dragon] ✓ Selected file: {}", file.filename);
                        println!("[Dragon] File size: {} bytes", file.size);
                        println!("[Dragon] Download URL: {}", file.url);

                        if let Ok(bytes) = self
                            .download_file_with_progress(&file.url, file.size, |p| {
                                let download_progress = base_progress + 0.01 + (0.03 * p);
                                progress_callback(
                                    download_progress,
                                    format!("Downloading {}... {}%", mod_name, (p * 100.0) as u32),
                                );
                            })
                            .await
                        {
                            println!("[Dragon] ✓ Downloaded {} ({} bytes)", mod_name, bytes.len());

                            let mod_path = mods_dir.join(&file.filename);
                            println!("[Dragon] Saving to: {}", mod_path.display());

                            match fs::write(&mod_path, &bytes) {
                                Ok(_) => {
                                    println!("[Dragon] ✓ File written successfully");

                                    if mod_path.exists() {
                                        println!(
                                            "[Dragon] ✓✓ VERIFIED: {} installed to mods folder",
                                            mod_name
                                        );
                                    } else {
                                        println!("[Dragon] ✗✗ ERROR: File does not exist after write: {}", mod_path.display());
                                    }
                                }
                                Err(e) => {
                                    println!("[Dragon] ✗ Failed to write file: {}", e);
                                    return Err(format!("Failed to save {}: {}", mod_name, e));
                                }
                            }
                        } else {
                            println!("[Dragon] ✗ Failed to download {}", mod_name);
                        }
                    } else {
                        println!("[Dragon] ✗ No files available for {}", mod_name);
                    }
                }
                Ok(None) => {
                    println!(
                        "[Dragon] ✗ {} not available for Minecraft {}",
                        mod_name, mc_version
                    );
                }
                Err(e) => {
                    println!("[Dragon] ✗ API error fetching {}: {}", mod_name, e);
                }
            }
        }

        println!("[Dragon] ========== INSTALL EXCLUSIVE MODS COMPLETE ==========");
        Ok(())
    }

    /// Helper function to download a file with progress callback
    async fn download_file_with_progress<F>(
        &self,
        url: &str,
        total_size: u64,
        progress_callback: F,
    ) -> Result<Vec<u8>, String>
    where
        F: Fn(f32) + Send + Sync,
    {
        let client = reqwest::Client::builder()
            .user_agent("DragonLauncher/1.0")
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let mut downloaded: u64 = 0;
        let mut bytes = Vec::new();

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
            downloaded += chunk.len() as u64;
            bytes.extend_from_slice(&chunk);

            if total_size > 0 {
                let progress = downloaded as f32 / total_size as f32;
                progress_callback(progress);
            }
        }

        Ok(bytes)
    }

    /// Install Dragon Client mod for a Dragon instance from GitHub directly to mods folder
    pub async fn install_dragon_mod<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("[Dragon] ========================================");
        println!("[Dragon] INSTALL DRAGON MOD CALLED");
        println!("[Dragon] Version ID: {}", version_id);
        println!("[Dragon] ========================================");

        progress_callback(0.0, "Checking for Dragon Client mod...".to_string());

        let mc_version = if version_id.starts_with("dragon-") {
            version_id.strip_prefix("dragon-").unwrap_or(version_id)
        } else {
            version_id
        };

        println!("[Dragon] Extracted MC version: {}", mc_version);

        let mods_dir = self.dragon_mods_dir(version_id);

        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;

        progress_callback(0.02, "Cleaning up old mods...".to_string());
        let old_mods_to_remove: Vec<&str> = vec![];

        if mods_dir.exists() {
            if let Ok(entries) = fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let entry_filename = entry.file_name().to_string_lossy().to_lowercase();
                    if entry_filename.ends_with(".jar") {
                        for old_mod in &old_mods_to_remove {
                            if entry_filename.contains(old_mod) {
                                println!(
                                    "[Dragon] Removing old mod: {}",
                                    entry.file_name().to_string_lossy()
                                );
                                fs::remove_file(entry.path()).ok();
                                break;
                            }
                        }
                    }
                }
            }
        }

        progress_callback(0.05, "Installing mods to mods folder...".to_string());
        self.install_exclusive_mods(version_id, mc_version, &progress_callback)
            .await?;

        progress_callback(
            0.9,
            format!(
                "Fetching Dragon Client for Minecraft {} from GitHub...",
                mc_version
            ),
        );

        let manifest_result = self.get_expected_dragon_mod_metadata(mc_version).await;
        if matches!(manifest_result, Ok(None)) {
            let removed_count = self.remove_all_dragon_client_jars(version_id)?;
            let compat_filename = self.install_dragon_compat_stub(version_id, mc_version)?;
            let status =
                Self::unsupported_dragon_status(mc_version, removed_count, &compat_filename);
            println!("[Dragon] {}", status);
            progress_callback(1.0, status);
            return Ok(());
        }

        let manifest_entry = match manifest_result {
            Ok(entry) => entry,
            Err(e) => {
                println!(
                    "[Dragon] Warning: could not fetch Dragon manifest for {}: {}",
                    mc_version, e
                );
                None
            }
        };
        let resolved_mod = match manifest_entry.clone() {
            Some(entry) => entry,
            None => {
                let (download_url, filename, size) =
                    self.get_dragon_mod_from_github(mc_version).await?;
                ExpectedDragonMod {
                    download_url,
                    filename,
                    sha256: None,
                    size,
                }
            }
        };

        progress_callback(0.92, format!("Downloading {}...", resolved_mod.filename));

        let bytes = self
            .download_file_with_progress(&resolved_mod.download_url, resolved_mod.size, |p| {
                let progress = 0.92 + (0.06 * p);
                progress_callback(progress, format!("Downloading... {}%", (p * 100.0) as u32));
            })
            .await?;

        if bytes.len() < 4 || &bytes[0..4] != [0x50, 0x4B, 0x03, 0x04] {
            return Err("Downloaded file is not a valid JAR file".to_string());
        }

        progress_callback(0.98, "Installing Dragon Client mod...".to_string());

        let temp_mod_path = mods_dir.join(format!("{}.download", resolved_mod.filename));
        fs::write(&temp_mod_path, &bytes).map_err(|e| format!("Failed to save mod: {}", e))?;

        if let Some(expected_sha) = resolved_mod.sha256.as_ref() {
            if !super::dragon_updater::verify_sha256(&temp_mod_path, expected_sha)? {
                fs::remove_file(&temp_mod_path).ok();
                return Err(format!(
                    "Downloaded Dragon Client failed SHA256 verification: {}",
                    resolved_mod.filename
                ));
            }
        }

        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let entry_filename = entry.file_name().to_string_lossy().to_string();
                if entry_filename.starts_with("dragon-client") && entry_filename.ends_with(".jar") {
                    println!("[Dragon] Removing old version: {}", entry_filename);
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        use std::process::Command as WinCmd;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        WinCmd::new("attrib")
                            .arg("-h")
                            .arg(entry.path().to_string_lossy().to_string())
                            .creation_flags(CREATE_NO_WINDOW)
                            .output()
                            .ok();
                    }
                    Self::remove_existing_dragon_file(&entry.path())?;
                }
            }
        }

        let mod_path = mods_dir.join(&resolved_mod.filename);
        println!("[Dragon] Saving Dragon Client to: {}", mod_path.display());

        Self::remove_existing_dragon_file(&mod_path)?;
        fs::rename(&temp_mod_path, &mod_path)
            .map_err(|e| format!("Failed to finalize Dragon Client install: {}", e))?;

        if !mod_path.exists() {
            return Err(format!(
                "Dragon Client mod was not saved to: {}",
                mod_path.display()
            ));
        }

        println!("[Dragon] ✓ Saved Dragon Client ({} bytes)", bytes.len());

        println!(
            "[Dragon] ✓ Dragon Client JAR file installed: {}",
            resolved_mod.filename
        );

        let version_number = resolved_mod
            .filename
            .strip_prefix(&format!("dragon-client-{}-", mc_version))
            .and_then(|s| s.strip_suffix(".jar"))
            .unwrap_or("unknown");

        let version_file = mods_dir.join(".dragon-client-version");
        fs::write(&version_file, version_number).ok();

        progress_callback(1.0, format!("Dragon Client {} installed!", version_number));

        println!(
            "[Dragon] Installed mod: {} ({} bytes) from GitHub",
            resolved_mod.filename,
            bytes.len()
        );

        Ok(())
    }

    /// Update Dragon Client mod to latest version for a specific Dragon instance
    pub async fn update_dragon_mod<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<bool, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(0.0, "Checking for updates...".to_string());

        let mc_version = if version_id.starts_with("dragon-") {
            version_id.strip_prefix("dragon-").unwrap_or(version_id)
        } else {
            version_id
        };

        let mods_dir = self.dragon_mods_dir(version_id);
        let version_file = mods_dir.join(".dragon-client-version");

        let current_version = if version_file.exists() {
            fs::read_to_string(&version_file).ok()
        } else {
            None
        };

        let installed_jar = self.find_installed_dragon_mod_jar(version_id);
        let manifest_result = self.get_expected_dragon_mod_metadata(mc_version).await;
        if matches!(manifest_result, Ok(None)) {
            let removed_count = self.remove_all_dragon_client_jars(version_id)?;
            let compat_filename = self.install_dragon_compat_stub(version_id, mc_version)?;
            let status =
                Self::unsupported_dragon_status(mc_version, removed_count, &compat_filename);
            println!("[Dragon] {}", status);
            progress_callback(1.0, status);
            return Ok(removed_count > 0);
        }

        let manifest_entry = match manifest_result {
            Ok(entry) => entry,
            Err(e) => {
                println!(
                    "[Dragon] Warning: could not fetch Dragon manifest for {}: {}",
                    mc_version, e
                );
                None
            }
        };
        let resolved_mod = match manifest_entry.clone() {
            Some(entry) => entry,
            None => {
                let (download_url, filename, size) =
                    self.get_dragon_mod_from_github(mc_version).await?;
                ExpectedDragonMod {
                    download_url,
                    filename,
                    sha256: None,
                    size,
                }
            }
        };

        let latest_version = resolved_mod
            .filename
            .strip_prefix(&format!("dragon-client-{}-", mc_version))
            .and_then(|s| s.strip_suffix(".jar"))
            .unwrap_or("unknown");

        let latest_filename = manifest_entry
            .as_ref()
            .map(|expected| expected.filename.as_str())
            .unwrap_or(resolved_mod.filename.as_str());

        let installed_is_current = if let Some(path) = installed_jar.as_ref() {
            let installed_filename = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();

            if installed_filename != latest_filename {
                let installed_version =
                    Self::extract_dragon_mod_version(installed_filename, mc_version);
                let latest_version_from_filename =
                    Self::extract_dragon_mod_version(latest_filename, mc_version);

                matches!(
                    (installed_version.as_deref(), latest_version_from_filename.as_deref()),
                    (Some(installed), Some(latest))
                        if Self::compare_dragon_mod_versions(installed, latest) == Ordering::Greater
                )
            } else if let Some(expected) = manifest_entry.as_ref() {
                expected.filename == installed_filename
                    && expected
                        .sha256
                        .as_ref()
                        .map(|expected_sha| {
                            super::dragon_updater::verify_sha256(path, expected_sha)
                        })
                        .transpose()?
                        .unwrap_or(true)
            } else if let Some(current) = &current_version {
                current.trim() == latest_version
            } else {
                true
            }
        } else {
            false
        };

        if installed_is_current {
            if let Some(current) = &current_version {
                progress_callback(1.0, "Dragon Client is up to date".to_string());
                println!(
                    "[Dragon] Latest installed Dragon Client version: {}",
                    current.trim()
                );
            } else {
                progress_callback(1.0, "Dragon Client is up to date".to_string());
            }
            return Ok(false);
        }

        progress_callback(
            0.1,
            format!(
                "Update available: {} -> {}",
                current_version.as_deref().unwrap_or("unknown"),
                latest_version
            ),
        );

        self.install_dragon_mod(version_id, progress_callback)
            .await?;

        Ok(true)
    }

    /// Verify Dragon Client mod installation and auto-repair if needed
    pub async fn verify_dragon_mod<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<bool, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("[Dragon] ========================================");
        println!("[Dragon] VERIFY DRAGON MOD CALLED");
        println!("[Dragon] ========================================");

        progress_callback(0.0, "Verifying Dragon Client installation...".to_string());

        let mc_version = if version_id.starts_with("dragon-") {
            version_id.strip_prefix("dragon-").unwrap_or(version_id)
        } else {
            version_id
        };

        println!("[Dragon] MC Version: {}", mc_version);

        let instance_dir = if version_id.starts_with("dragon-") {
            self.game_dir.join("instances").join(version_id)
        } else {
            self.game_dir.clone()
        };

        println!("[Dragon] Instance Dir: {}", instance_dir.display());

        let mods_dir = instance_dir.join("mods");
        println!("[Dragon] Mods Dir: {}", mods_dir.display());

        match self.get_expected_dragon_mod_metadata(mc_version).await {
            Ok(None) => {
                let removed_count = self.remove_all_dragon_client_jars(version_id)?;
                progress_callback(0.2, "Checking Dragon compatibility mods...".to_string());
                self.install_exclusive_mods(version_id, mc_version, &progress_callback)
                    .await?;
                let compat_filename = self.install_dragon_compat_stub(version_id, mc_version)?;
                let status =
                    Self::unsupported_dragon_status(mc_version, removed_count, &compat_filename);
                println!("[Dragon] {}", status);
                progress_callback(1.0, status);
                return Ok(removed_count > 0);
            }
            Ok(Some(_)) => {}
            Err(e) => {
                println!(
                    "[Dragon] Warning: Could not fetch Dragon Client manifest for {}: {}",
                    mc_version, e
                );
            }
        }

        println!("[Dragon] Checking if Dragon Client mod exists...");
        let installed_jar = self.find_installed_dragon_mod_jar(version_id);
        let dragon_installed = installed_jar.is_some();
        println!("[Dragon] Dragon Client installed: {}", dragon_installed);

        if !dragon_installed {
            println!("[Dragon] Dragon Client mod missing, reinstalling...");
            progress_callback(
                0.1,
                "Dragon Client mod missing, reinstalling...".to_string(),
            );
            self.install_dragon_mod(version_id, progress_callback)
                .await?;
            return Ok(true);
        }

        if let Some(installed_jar) = installed_jar.as_ref() {
            match self.get_expected_dragon_mod_metadata(mc_version).await {
                Ok(Some(expected_mod)) => {
                    let installed_filename = installed_jar
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default();

                    if installed_filename != expected_mod.filename {
                        let installed_version =
                            Self::extract_dragon_mod_version(installed_filename, mc_version);
                        let expected_version =
                            Self::extract_dragon_mod_version(&expected_mod.filename, mc_version);

                        if matches!(
                            (installed_version.as_deref(), expected_version.as_deref()),
                            (Some(installed), Some(expected))
                                if Self::compare_dragon_mod_versions(installed, expected) == Ordering::Greater
                        ) {
                            println!(
                                "[Dragon] Installed Dragon Client {} is newer than GitHub release {}, keeping local jar",
                                installed_filename, expected_mod.filename
                            );
                            progress_callback(
                                1.0,
                                "Using newer local Dragon Client jar".to_string(),
                            );
                            return Ok(false);
                        }

                        println!(
                            "[Dragon] Installed Dragon Client {} does not match latest GitHub release {}, reinstalling...",
                            installed_filename, expected_mod.filename
                        );
                        progress_callback(
                            0.15,
                            "Dragon Client update found, reinstalling...".to_string(),
                        );
                        self.install_dragon_mod(version_id, progress_callback)
                            .await?;
                        return Ok(true);
                    }

                    if let Some(expected_sha) = expected_mod.sha256.as_ref() {
                        if !super::dragon_updater::verify_sha256(installed_jar, expected_sha)? {
                            println!("[Dragon] Installed Dragon Client failed SHA256 verification, reinstalling...");
                            progress_callback(
                                0.2,
                                "Dragon Client failed verification, reinstalling...".to_string(),
                            );
                            self.install_dragon_mod(version_id, progress_callback)
                                .await?;
                            return Ok(true);
                        }
                    }

                    println!("[Dragon] Installed Dragon Client matches GitHub manifest");
                }
                Ok(None) => {
                    println!("[Dragon] No manifest entry found for Minecraft {}, skipping hash verification", mc_version);
                }
                Err(e) => {
                    println!(
                        "[Dragon] Warning: Could not fetch Dragon Client manifest: {}",
                        e
                    );
                }
            }
        }

        println!("[Dragon] Dragon Client mod found, checking exclusive mods...");

        progress_callback(0.3, "Checking exclusive mods...".to_string());
        println!(
            "[Dragon] Checking exclusive mods (count: {})...",
            EXCLUSIVE_MODS.len()
        );

        let mods_dir = instance_dir.join("mods");
        println!("[Dragon] Mods dir: {}", mods_dir.display());

        let mut missing_exclusive_mods = Vec::new();
        for (mod_name, _) in EXCLUSIVE_MODS {
            // Check if this mod should be excluded for this version
            let is_excluded = EXCLUSIVE_VERSION_EXCLUSIONS
                .iter()
                .any(|(version, excluded_mod)| {
                    *version == mc_version && *excluded_mod == *mod_name
                });

            if is_excluded {
                println!(
                    "[Dragon] Skipping {} (excluded for {})",
                    mod_name, mc_version
                );
                continue;
            }

            let mod_installed = if let Ok(entries) = fs::read_dir(&mods_dir) {
                entries.flatten().any(|entry| {
                    let filename = entry.file_name().to_string_lossy().to_lowercase();
                    filename.contains(&mod_name.to_lowercase()) && filename.ends_with(".jar")
                })
            } else {
                false
            };

            if !mod_installed {
                println!("[Dragon] Missing exclusive mod: {}", mod_name);
                missing_exclusive_mods.push(*mod_name);
            } else {
                println!("[Dragon] Found exclusive mod: {}", mod_name);
            }
        }

        if !missing_exclusive_mods.is_empty() {
            println!(
                "[Dragon] Missing exclusive mods: {:?}",
                missing_exclusive_mods
            );
            progress_callback(
                0.7,
                format!(
                    "Installing {} exclusive mods...",
                    missing_exclusive_mods.len()
                ),
            );
            self.install_exclusive_mods(version_id, mc_version, &progress_callback)
                .await?;
            progress_callback(1.0, "All mods verified and installed".to_string());
            return Ok(true);
        }

        println!("[Dragon] All mods verified successfully");
        progress_callback(1.0, "Dragon Client installation verified".to_string());
        Ok(false)
    }
}
