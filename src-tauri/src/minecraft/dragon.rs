use serde::{Deserialize, Serialize};
use std::fs;

const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2";
const SUPPORTED_VERSIONS: &[&str] = &["26.1", "26.1.1", "26.1.2"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DragonVersionInfo {
    pub id: String,
    pub mc_version: String,
    pub loader_version: String,
    pub stable: bool,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderVersion {
    separator: String,
    build: u32,
    maven: String,
    version: String,
    stable: bool,
}

#[derive(Debug, Deserialize)]
struct FabricGameVersion {
    version: String,
    stable: bool,
}

impl super::MinecraftLauncher {
    /// Get all available Dragon loader versions (uses Fabric backend)
    pub async fn get_dragon_versions(&self) -> Result<Vec<DragonVersionInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Get supported game versions
        let game_versions_url = format!("{}/versions/game", FABRIC_META_URL);
        let game_response = client
            .get(&game_versions_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch game versions: {}", e))?;

        let game_versions: Vec<FabricGameVersion> = game_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse game versions: {}", e))?;

        // Get loader versions
        let loader_url = format!("{}/versions/loader", FABRIC_META_URL);
        let loader_response = client
            .get(&loader_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch loader versions: {}", e))?;

        let loader_versions: Vec<FabricLoaderVersion> = loader_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse loader versions: {}", e))?;

        // Get the latest stable loader version
        let latest_loader = loader_versions
            .iter()
            .find(|l| l.stable)
            .or_else(|| loader_versions.first())
            .ok_or("No loader versions found")?;

        // Create version info for each supported game version with the latest loader
        let mut dragon_versions: Vec<DragonVersionInfo> = game_versions
            .iter()
            // Keep supported versions even if upstream marks them as non-stable snapshots.
            .filter(|g| SUPPORTED_VERSIONS.contains(&g.version.as_str()))
            .map(|game| DragonVersionInfo {
                id: format!("dragon-{}", game.version),
                mc_version: game.version.clone(),
                loader_version: latest_loader.version.clone(),
                stable: latest_loader.stable,
            })
            .collect();

        // Sort by MC version (newest first)
        dragon_versions.sort_by(|a, b| version_compare(&b.mc_version, &a.mc_version));

        Ok(dragon_versions)
    }

    /// Get installed Dragon versions
    pub fn get_installed_dragon_versions(&self) -> Result<Vec<String>, String> {
        let instances_dir = self.game_dir.join("instances");
        let mut installed = Vec::new();

        if instances_dir.exists() {
            for entry in fs::read_dir(&instances_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();

                // Dragon versions use dragon- prefix in instances folder.
                // Keep this list aligned with supported versions so legacy folders
                // (for removed versions) do not appear in launcher UI.
                if let Some(mc_version) = name.strip_prefix("dragon-") {
                    if !SUPPORTED_VERSIONS.contains(&mc_version) {
                        continue;
                    }
                    println!("[INFO] Found Dragon instance: {}", name);
                    installed.push(name);
                }
            }
        }

        // Sort by version (newest first)
        installed.sort_by(|a, b| version_compare(b, a));

        Ok(installed)
    }

    /// Get Dragon versions available for a specific Minecraft version
    pub async fn get_dragon_versions_for_mc(
        &self,
        mc_version: &str,
    ) -> Result<Vec<DragonVersionInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Get loader versions for this specific MC version
        let url = format!("{}/versions/loader/{}", FABRIC_META_URL, mc_version);
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch loaders for {}: {}", mc_version, e))?;

        if !response.status().is_success() {
            return Ok(Vec::new()); // MC version not supported
        }

        #[derive(Deserialize)]
        struct LoaderInfo {
            loader: FabricLoaderVersion,
        }

        let loaders: Vec<LoaderInfo> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse loaders: {}", e))?;

        let versions: Vec<DragonVersionInfo> = loaders
            .into_iter()
            .map(|l| DragonVersionInfo {
                id: format!("fabric-loader-{}-{}", l.loader.version, mc_version),
                mc_version: mc_version.to_string(),
                loader_version: l.loader.version,
                stable: l.loader.stable,
            })
            .collect();

        Ok(versions)
    }

    /// Install Dragon for a specific Minecraft version (uses Fabric backend)
    pub async fn install_dragon<F>(
        &self,
        dragon_version: &DragonVersionInfo,
        progress_callback: F,
    ) -> Result<String, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(
            0.0,
            format!(
                "Installing Dragon {} for Minecraft {}...",
                dragon_version.loader_version, dragon_version.mc_version
            ),
        );

        // Create custom Dragon version ID for instances folder
        let dragon_instance_id = format!("dragon-{}", dragon_version.mc_version);

        // First ensure vanilla Minecraft is FULLY installed (JAR, JSON, and libraries)
        let vanilla_jar = self
            .versions_dir
            .join(&dragon_version.mc_version)
            .join(format!("{}.jar", dragon_version.mc_version));
        let vanilla_json = self
            .versions_dir
            .join(&dragon_version.mc_version)
            .join(format!("{}.json", dragon_version.mc_version));

        // Check if vanilla is fully installed (both JAR and JSON must exist)
        if !vanilla_jar.exists() || !vanilla_json.exists() {
            progress_callback(
                0.01,
                format!(
                    "Installing Minecraft {} first...",
                    dragon_version.mc_version
                ),
            );

            // Install vanilla Minecraft first
            self.install_version(&dragon_version.mc_version, |p, msg| {
                // Scale progress from 0.01 to 0.05 for vanilla installation
                let scaled_progress = 0.01 + (p * 0.04);
                progress_callback(scaled_progress, format!("[Vanilla] {}", msg));
            })
            .await
            .map_err(|e| {
                format!(
                    "Failed to install Minecraft {}: {}",
                    dragon_version.mc_version, e
                )
            })?;

            progress_callback(
                0.05,
                format!(
                    "Minecraft {} installed, continuing with Dragon...",
                    dragon_version.mc_version
                ),
            );
        }

        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .timeout(std::time::Duration::from_secs(180))
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        progress_callback(0.1, "Fetching Dragon profile...".to_string());

        // Fetch the version profile from Fabric Meta API
        let profile_url = format!(
            "{}/versions/loader/{}/{}/profile/json",
            FABRIC_META_URL, dragon_version.mc_version, dragon_version.loader_version
        );

        println!("Fetching Dragon profile from: {}", profile_url);

        let response = client
            .get(&profile_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Dragon profile: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch Dragon profile: HTTP {}",
                response.status()
            ));
        }

        let profile_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Dragon profile: {}", e))?;

        // Get the Fabric version ID from the profile
        let fabric_version_id = profile_json["id"]
            .as_str()
            .ok_or("No version ID in Dragon profile")?
            .to_string();

        println!("Fabric version ID: {}", fabric_version_id);

        progress_callback(
            0.2,
            format!("Creating Dragon instance {}...", dragon_instance_id),
        );

        // Create instance directory instead of version directory
        let instance_dir = self.game_dir.join("instances").join(&dragon_instance_id);
        fs::create_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to create instance directory: {}", e))?;

        // Also create the Fabric version in versions folder (needed for libraries)
        let version_dir = self.versions_dir.join(&fabric_version_id);
        fs::create_dir_all(&version_dir)
            .map_err(|e| format!("Failed to create version directory: {}", e))?;

        // Write Fabric version JSON to versions folder (for libraries)
        let json_path = version_dir.join(format!("{}.json", fabric_version_id));
        let json_content = serde_json::to_string_pretty(&profile_json).unwrap();
        fs::write(&json_path, &json_content)
            .map_err(|e| format!("Failed to write version JSON: {}", e))?;
        println!("Wrote Fabric version JSON to: {:?}", json_path);

        // Create Dragon instance JSON that inherits from Fabric version
        let mut instance_json = profile_json.clone();
        instance_json["id"] = serde_json::Value::String(dragon_instance_id.clone());
        instance_json["inheritsFrom"] = serde_json::Value::String(fabric_version_id.clone());
        instance_json["type"] = serde_json::Value::String("dragon".to_string());

        let instance_json_path = instance_dir.join(format!("{}.json", dragon_instance_id));
        let instance_json_content = serde_json::to_string_pretty(&instance_json).unwrap();
        fs::write(&instance_json_path, &instance_json_content)
            .map_err(|e| format!("Failed to write instance JSON: {}", e))?;
        println!("Wrote Dragon instance JSON to: {:?}", instance_json_path);

        progress_callback(
            0.3,
            "Downloading Dragon libraries (parallel)...".to_string(),
        );

        // Download all required libraries IN PARALLEL for speed
        if let Some(libraries) = profile_json["libraries"].as_array() {
            use super::downloader::{download_parallel, DownloadTask};

            let mut tasks: Vec<DownloadTask> = Vec::new();

            for lib in libraries.iter() {
                // Get library info
                if let Some(name) = lib["name"].as_str() {
                    // Parse Maven coordinates: group:artifact:version[:classifier]
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

                        // Skip if already exists
                        if lib_path.exists() {
                            continue;
                        }

                        // Create parent directory
                        if let Some(parent) = lib_path.parent() {
                            fs::create_dir_all(parent).ok();
                        }

                        // Get download URL
                        let base_url = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");
                        let url = format!(
                            "{}{}/{}/{}/{}",
                            base_url, group, artifact, version, jar_name
                        );

                        // Add fallback URLs
                        let fallback_urls = vec![
                            format!(
                                "https://maven.fabricmc.net/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                            format!(
                                "https://libraries.minecraft.net/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                            format!(
                                "https://repo1.maven.org/maven2/{}/{}/{}/{}",
                                group, artifact, version, jar_name
                            ),
                        ];

                        tasks.push(DownloadTask {
                            url,
                            path: lib_path,
                            fallback_urls,
                        });
                    }
                }
            }

            // Download all libraries in parallel
            println!("[Dragon] Downloading {} libraries...", tasks.len());

            let download_future = download_parallel(
                tasks,
                12,
                |progress, status| {
                    let overall_progress = 0.3 + (0.6 * progress);
                    progress_callback(overall_progress, status);
                },
                0.0,
                1.0,
                "Downloading Dragon libraries",
            );

            // Add timeout to prevent hanging (5 minutes max)
            match tokio::time::timeout(std::time::Duration::from_secs(300), download_future).await {
                Ok((downloaded, failed)) => {
                    println!(
                        "Dragon libraries: {} downloaded, {} failed",
                        downloaded, failed
                    );

                    if downloaded == 0 && failed > 0 {
                        println!("[ERROR] All Dragon library downloads failed");
                        return Err(format!("Failed to download Dragon libraries ({} failures). Please check your internet connection.", failed));
                    }

                    if failed > 0 && failed < downloaded / 2 {
                        println!(
                            "[WARN] Some Dragon libraries failed to download, but continuing..."
                        );
                    } else if failed >= downloaded / 2 && downloaded > 0 {
                        return Err(format!(
                            "Too many library download failures: {}/{}",
                            failed,
                            downloaded + failed
                        ));
                    }
                }
                Err(_) => {
                    println!("[ERROR] Dragon library download timed out after 5 minutes");
                    return Err("Library download timed out. Please check your internet connection and try again.".to_string());
                }
            }
        }

        progress_callback(0.90, "Finalizing installation...".to_string());

        // Verify installation
        let json_exists = instance_json_path.exists();

        if !json_exists {
            return Err("Dragon installation failed: instance JSON not created".to_string());
        }

        // Create profile in state system
        let profile = super::state::Profile {
            id: dragon_instance_id.clone(),
            name: format!("Dragon {}", dragon_version.mc_version),
            game_version: dragon_version.mc_version.clone(),
            loader: "dragon".to_string(),
            loader_version: Some(dragon_version.loader_version.clone()),
            install_stage: super::state::InstallStage::Installed,
            java_path: None,
            java_version: None,
            memory_mb: None,
            created: chrono::Utc::now(),
            modified: chrono::Utc::now(),
            last_played: None,
            icon_url: None,
            project_id: None,
            version_id: None,
            mod_count: None,
        };

        self.state.upsert_profile(&profile).ok();
        println!("[Dragon] Created profile in state: {}", dragon_instance_id);

        progress_callback(0.92, "Installing Dragon Client mod...".to_string());

        // Auto-install Dragon Client mod from GitHub releases to instance mods folder
        match self
            .install_dragon_mod(&dragon_instance_id, |mod_progress, mod_status| {
                // Scale mod installation progress from 0.92 to 0.98
                let scaled_progress = 0.92 + (mod_progress * 0.06);
                progress_callback(scaled_progress, format!("[Mod] {}", mod_status));
            })
            .await
        {
            Ok(_) => {
                println!("[Dragon] Dragon Client mod installed successfully");
            }
            Err(e) => {
                println!(
                    "[Dragon] Warning: Failed to install Dragon Client mod: {}",
                    e
                );
                progress_callback(0.98, format!("Warning: Mod installation failed: {}", e));
                // Continue anyway - Fabric is installed, mod can be added later
            }
        }

        println!("[Dragon] Dragon Client mod installation complete");

        progress_callback(
            1.0,
            format!("Dragon {} installed successfully!", dragon_instance_id),
        );

        Ok(dragon_instance_id)
    }
}

/// Compare version strings (e.g., "1.20.1" vs "1.19.4")
fn version_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let parse_version = |s: &str| -> Vec<u32> {
        s.split(|c: char| !c.is_ascii_digit())
            .filter_map(|part| part.parse::<u32>().ok())
            .collect()
    };

    let a_parts = parse_version(a);
    let b_parts = parse_version(b);

    for (a_part, b_part) in a_parts.iter().zip(b_parts.iter()) {
        match a_part.cmp(b_part) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }

    a_parts.len().cmp(&b_parts.len())
}
