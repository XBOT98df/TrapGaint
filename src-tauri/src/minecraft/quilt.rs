use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;

const QUILT_META_URL: &str = "https://meta.quiltmc.org/v3";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuiltVersionInfo {
    pub id: String,
    pub mc_version: String,
    pub loader_version: String,
    pub stable: bool,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderVersion {
    separator: String,
    build: u32,
    maven: String,
    version: String,
}

#[derive(Debug, Deserialize)]
struct QuiltGameVersion {
    version: String,
    stable: bool,
}

impl super::MinecraftLauncher {
    /// Get all available Quilt loader versions
    pub async fn get_quilt_versions(&self) -> Result<Vec<QuiltVersionInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Get supported game versions
        let game_versions_url = format!("{}/versions/game", QUILT_META_URL);
        let game_response = client
            .get(&game_versions_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Quilt game versions: {}", e))?;

        let game_versions: Vec<QuiltGameVersion> = game_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Quilt game versions: {}", e))?;

        // Get loader versions
        let loader_url = format!("{}/versions/loader", QUILT_META_URL);
        let loader_response = client
            .get(&loader_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Quilt loader versions: {}", e))?;

        let loader_versions: Vec<QuiltLoaderVersion> = loader_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Quilt loader versions: {}", e))?;

        // Get the latest loader version
        let latest_loader = loader_versions
            .first()
            .ok_or("No Quilt loader versions found")?;

        // Create version info for each supported game version with the latest loader
        let mut quilt_versions: Vec<QuiltVersionInfo> = game_versions
            .iter()
            .filter(|g| g.stable) // Only stable game versions
            .map(|game| QuiltVersionInfo {
                id: format!("quilt-loader-{}-{}", latest_loader.version, game.version),
                mc_version: game.version.clone(),
                loader_version: latest_loader.version.clone(),
                stable: true,
            })
            .collect();

        // Sort by MC version (newest first)
        quilt_versions.sort_by(|a, b| version_compare(&b.mc_version, &a.mc_version));

        Ok(quilt_versions)
    }

    /// Get installed Quilt versions
    pub fn get_installed_quilt_versions(&self) -> Result<Vec<String>, String> {
        let versions_dir = self.game_dir.join("versions");
        let instances_dir = self.game_dir.join("instances");
        let mut installed_set: HashSet<String> = HashSet::new();

        if instances_dir.exists() {
            for entry in fs::read_dir(&instances_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();

                // Quilt versions contain "quilt" in the name
                if name.to_lowercase().contains("quilt") {
                    println!("[INFO] Found Quilt instance: {}", name);
                    installed_set.insert(name);
                }
            }
        }

        if versions_dir.exists() {
            for entry in fs::read_dir(&versions_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if !entry.path().is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.to_lowercase().contains("quilt") {
                    continue;
                }
                let json_path = entry.path().join(format!("{}.json", name));
                if json_path.exists() {
                    println!("[INFO] Found Quilt version: {}", name);
                    installed_set.insert(name);
                }
            }
        }

        // Include Quilt profiles tracked in launcher state
        if let Ok(profiles) = self.state.get_profiles() {
            for profile in profiles {
                if profile.install_stage == super::state::InstallStage::Installed
                    && profile.loader.eq_ignore_ascii_case("quilt")
                    && profile.id.to_lowercase().contains("quilt")
                {
                    installed_set.insert(profile.id);
                }
            }
        }

        let mut installed: Vec<String> = installed_set.into_iter().collect();

        // Sort by version (newest first)
        installed.sort_by(|a, b| version_compare(b, a));

        Ok(installed)
    }

    /// Get Quilt versions available for a specific Minecraft version
    pub async fn get_quilt_versions_for_mc(
        &self,
        mc_version: &str,
    ) -> Result<Vec<QuiltVersionInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Get loader versions for this specific MC version
        let url = format!("{}/versions/loader/{}", QUILT_META_URL, mc_version);
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Quilt loaders for {}: {}", mc_version, e))?;

        if !response.status().is_success() {
            return Ok(Vec::new()); // MC version not supported by Quilt
        }

        #[derive(Deserialize)]
        struct LoaderInfo {
            loader: QuiltLoaderVersion,
        }

        let loaders: Vec<LoaderInfo> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Quilt loaders: {}", e))?;

        let versions: Vec<QuiltVersionInfo> = loaders
            .into_iter()
            .map(|l| QuiltVersionInfo {
                id: format!("quilt-loader-{}-{}", l.loader.version, mc_version),
                mc_version: mc_version.to_string(),
                loader_version: l.loader.version,
                stable: true,
            })
            .collect();

        Ok(versions)
    }

    /// Install Quilt for a specific Minecraft version
    pub async fn install_quilt<F>(
        &self,
        quilt_version: &QuiltVersionInfo,
        progress_callback: F,
    ) -> Result<String, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(
            0.0,
            format!(
                "Installing Quilt {} for Minecraft {}...",
                quilt_version.loader_version, quilt_version.mc_version
            ),
        );

        // First ensure vanilla Minecraft is installed
        let vanilla_jar = self
            .versions_dir
            .join(&quilt_version.mc_version)
            .join(format!("{}.jar", quilt_version.mc_version));
        if !vanilla_jar.exists() {
            return Err(format!("Minecraft {} must be installed first. Please install vanilla Minecraft {} before installing Quilt.", quilt_version.mc_version, quilt_version.mc_version));
        }

        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;

        progress_callback(0.1, "Fetching Quilt profile...".to_string());

        // Fetch the version profile from Quilt Meta API
        let profile_url = format!(
            "{}/versions/loader/{}/{}/profile/json",
            QUILT_META_URL, quilt_version.mc_version, quilt_version.loader_version
        );

        println!("Fetching Quilt profile from: {}", profile_url);

        let response = client
            .get(&profile_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Quilt profile: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch Quilt profile: HTTP {}",
                response.status()
            ));
        }

        let profile_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Quilt profile: {}", e))?;

        // Get the version ID from the profile
        let version_id = profile_json["id"]
            .as_str()
            .ok_or("No version ID in Quilt profile")?
            .to_string();

        println!("Quilt version ID: {}", version_id);

        progress_callback(0.2, format!("Creating version {}...", version_id));

        // Create version directory
        let version_dir = self.versions_dir.join(&version_id);
        fs::create_dir_all(&version_dir)
            .map_err(|e| format!("Failed to create version directory: {}", e))?;

        // Write version JSON
        let json_path = version_dir.join(format!("{}.json", version_id));
        fs::write(
            &json_path,
            serde_json::to_string_pretty(&profile_json).unwrap(),
        )
        .map_err(|e| format!("Failed to write version JSON: {}", e))?;

        println!("Wrote version JSON to: {:?}", json_path);

        progress_callback(0.3, "Downloading Quilt libraries (parallel)...".to_string());

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

                        // Get download URL - Quilt profile has "url" at library level as base URL
                        let base_url = lib["url"]
                            .as_str()
                            .unwrap_or("https://maven.quiltmc.org/repository/release/");
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
                        ];

                        tasks.push(DownloadTask {
                            url,
                            path: lib_path,
                            fallback_urls,
                        });
                    }
                }
            }

            // Download all libraries in parallel (16 concurrent)
            let (downloaded, failed) = download_parallel(
                tasks,
                16,
                |progress, status| {
                    let overall_progress = 0.3 + (0.6 * progress);
                    progress_callback(overall_progress, status);
                },
                0.0,
                1.0,
                "Downloading Quilt libraries",
            )
            .await;

            println!(
                "Quilt libraries: {} downloaded, {} failed",
                downloaded, failed
            );
        }

        progress_callback(0.95, "Finalizing installation...".to_string());

        // Verify installation
        let json_exists = json_path.exists();

        if !json_exists {
            return Err("Quilt installation failed: version JSON not created".to_string());
        }

        // Create profile in state system (like Modrinth)
        let profile = super::state::Profile {
            id: version_id.clone(),
            name: format!("Quilt {}", quilt_version.mc_version),
            game_version: quilt_version.mc_version.clone(),
            loader: "quilt".to_string(),
            loader_version: Some(quilt_version.loader_version.clone()),
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
        println!("[Quilt] Created profile in state: {}", version_id);

        progress_callback(1.0, format!("Quilt {} installed successfully!", version_id));

        Ok(version_id)
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
