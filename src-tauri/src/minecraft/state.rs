use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Installation stage for profiles (like Modrinth's ProfileInstallStage)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InstallStage {
    NotInstalled,
    Installing,
    Installed,
    Failed,
}

/// Profile metadata (like Modrinth's Profile struct)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub game_version: String,
    pub loader: String, // "fabric", "forge", "quilt", "vanilla"
    pub loader_version: Option<String>,
    pub install_stage: InstallStage,
    pub java_path: Option<String>,
    pub java_version: Option<u8>,
    pub memory_mb: Option<u32>,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    pub last_played: Option<DateTime<Utc>>,
    pub icon_url: Option<String>,
    pub project_id: Option<String>, // Modrinth project ID for modpacks
    pub version_id: Option<String>, // Modrinth version ID for modpacks
    pub mod_count: Option<usize>,
}

/// Java version info (like Modrinth's JavaVersion)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaVersion {
    pub major_version: u8,
    pub path: String,
    pub version_string: String,
    pub architecture: String,
}

/// Cached file info for verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFile {
    pub path: String,
    pub sha1: Option<String>,
    pub size: u64,
    pub last_verified: DateTime<Utc>,
}

/// State manager (file-based, no SQLite)
pub struct StateManager {
    state_dir: PathBuf,
}

impl StateManager {
    pub fn new(game_dir: &PathBuf) -> Self {
        let state_dir = game_dir.join("state");
        fs::create_dir_all(&state_dir).ok();

        let manager = Self { state_dir };

        // Scan and import existing installations on first run
        manager.scan_existing_installations(game_dir).ok();

        // Clean up stale profiles (deleted installations)
        manager.cleanup_stale_profiles(game_dir).ok();

        manager
    }

    /// Scan existing modpack installations and import them into state
    fn scan_existing_installations(&self, game_dir: &PathBuf) -> Result<(), String> {
        let instances_dir = game_dir.join("instances");

        if !instances_dir.exists() {
            return Ok(());
        }

        println!("[State] Scanning existing installations...");

        let entries = fs::read_dir(&instances_dir).map_err(|e| e.to_string())?;

        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }

            let instance_name = entry.file_name().to_string_lossy().to_string();

            // Check if we already have this profile
            if self.get_profile(&instance_name).ok().flatten().is_some() {
                continue; // Already tracked
            }

            // Try to read metadata
            let versions_dir = game_dir.join("versions");
            let metadata_path = versions_dir
                .join(&instance_name)
                .join("modpack-metadata.json");

            if let Ok(metadata_content) = fs::read_to_string(&metadata_path) {
                if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&metadata_content) {
                    // Extract info from metadata
                    let modpack_name = metadata["modpack_name"].as_str().unwrap_or(&instance_name);
                    let game_version = metadata["game_version"].as_str().unwrap_or("unknown");
                    let loader_version_id = metadata["loader_version_id"].as_str().unwrap_or("");
                    let mod_count = metadata["mod_count"].as_u64().map(|n| n as usize);
                    let version_id = metadata["version_id"].as_str();

                    // Determine loader from loader_version_id
                    let loader = if loader_version_id.contains("fabric") {
                        "fabric"
                    } else if loader_version_id.contains("forge") {
                        "forge"
                    } else if loader_version_id.contains("quilt") {
                        "quilt"
                    } else {
                        "vanilla"
                    };

                    // Determine Java version from game version
                    let java_version =
                        crate::minecraft::java_manager::JavaManager::get_required_java_version(
                            game_version,
                        );

                    // Create profile
                    let profile = Profile {
                        id: instance_name.clone(),
                        name: modpack_name.to_string(),
                        game_version: game_version.to_string(),
                        loader: loader.to_string(),
                        loader_version: Some(loader_version_id.to_string()),
                        install_stage: InstallStage::Installed, // Already installed
                        java_path: None,
                        java_version: Some(java_version),
                        memory_mb: None,
                        created: chrono::Utc::now(),
                        modified: chrono::Utc::now(),
                        last_played: None,
                        icon_url: None,
                        project_id: None,
                        version_id: version_id.map(|s| s.to_string()),
                        mod_count,
                    };

                    self.upsert_profile(&profile).ok();
                    println!("[State] Imported existing installation: {}", instance_name);
                }
            }
        }

        println!("[State] Scan complete");
        Ok(())
    }

    // ===== PROFILE MANAGEMENT =====

    /// Get all profiles
    pub fn get_profiles(&self) -> Result<Vec<Profile>, String> {
        let profiles_file = self.state_dir.join("profiles.json");

        if !profiles_file.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&profiles_file)
            .map_err(|e| format!("Failed to read profiles: {}", e))?;

        let profiles: Vec<Profile> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse profiles: {}", e))?;

        Ok(profiles)
    }

    /// Get a single profile by ID
    pub fn get_profile(&self, id: &str) -> Result<Option<Profile>, String> {
        let profiles = self.get_profiles()?;
        Ok(profiles.into_iter().find(|p| p.id == id))
    }

    /// Save or update a profile
    pub fn upsert_profile(&self, profile: &Profile) -> Result<(), String> {
        let mut profiles = self.get_profiles()?;

        // Remove existing profile with same ID
        profiles.retain(|p| p.id != profile.id);

        // Add updated profile
        profiles.push(profile.clone());

        // Save to file
        let profiles_file = self.state_dir.join("profiles.json");
        let content = serde_json::to_string_pretty(&profiles)
            .map_err(|e| format!("Failed to serialize profiles: {}", e))?;

        fs::write(&profiles_file, content)
            .map_err(|e| format!("Failed to write profiles: {}", e))?;

        Ok(())
    }

    /// Remove a profile
    pub fn remove_profile(&self, id: &str) -> Result<(), String> {
        let mut profiles = self.get_profiles()?;
        profiles.retain(|p| p.id != id);

        let profiles_file = self.state_dir.join("profiles.json");
        let content = serde_json::to_string_pretty(&profiles)
            .map_err(|e| format!("Failed to serialize profiles: {}", e))?;

        fs::write(&profiles_file, content)
            .map_err(|e| format!("Failed to write profiles: {}", e))?;

        Ok(())
    }

    /// Update profile install stage
    pub fn update_install_stage(&self, id: &str, stage: InstallStage) -> Result<(), String> {
        if let Some(mut profile) = self.get_profile(id)? {
            profile.install_stage = stage;
            profile.modified = Utc::now();
            self.upsert_profile(&profile)?;
        }
        Ok(())
    }

    // ===== JAVA VERSION MANAGEMENT =====

    /// Get all Java versions
    pub fn get_java_versions(&self) -> Result<HashMap<u8, JavaVersion>, String> {
        let java_file = self.state_dir.join("java_versions.json");

        if !java_file.exists() {
            return Ok(HashMap::new());
        }

        let content = fs::read_to_string(&java_file)
            .map_err(|e| format!("Failed to read Java versions: {}", e))?;

        let versions: HashMap<u8, JavaVersion> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse Java versions: {}", e))?;

        Ok(versions)
    }

    /// Get Java version by major version
    pub fn get_java_version(&self, major_version: u8) -> Result<Option<JavaVersion>, String> {
        let versions = self.get_java_versions()?;
        Ok(versions.get(&major_version).cloned())
    }

    /// Save or update a Java version
    pub fn upsert_java_version(&self, java: &JavaVersion) -> Result<(), String> {
        let mut versions = self.get_java_versions()?;
        versions.insert(java.major_version, java.clone());

        let java_file = self.state_dir.join("java_versions.json");
        let content = serde_json::to_string_pretty(&versions)
            .map_err(|e| format!("Failed to serialize Java versions: {}", e))?;

        fs::write(&java_file, content)
            .map_err(|e| format!("Failed to write Java versions: {}", e))?;

        Ok(())
    }

    // ===== FILE CACHE MANAGEMENT =====

    /// Get cached files for a profile
    pub fn get_cached_files(
        &self,
        profile_id: &str,
    ) -> Result<HashMap<String, CachedFile>, String> {
        let cache_file = self.state_dir.join(format!("cache_{}.json", profile_id));

        if !cache_file.exists() {
            return Ok(HashMap::new());
        }

        let content =
            fs::read_to_string(&cache_file).map_err(|e| format!("Failed to read cache: {}", e))?;

        let cache: HashMap<String, CachedFile> =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse cache: {}", e))?;

        Ok(cache)
    }

    /// Cache a file's hash and metadata
    pub fn cache_file(
        &self,
        profile_id: &str,
        file_path: &str,
        sha1: Option<String>,
        size: u64,
    ) -> Result<(), String> {
        let mut cache = self.get_cached_files(profile_id)?;

        cache.insert(
            file_path.to_string(),
            CachedFile {
                path: file_path.to_string(),
                sha1,
                size,
                last_verified: Utc::now(),
            },
        );

        let cache_file = self.state_dir.join(format!("cache_{}.json", profile_id));
        let content = serde_json::to_string_pretty(&cache)
            .map_err(|e| format!("Failed to serialize cache: {}", e))?;

        fs::write(&cache_file, content).map_err(|e| format!("Failed to write cache: {}", e))?;

        Ok(())
    }

    /// Clear cache for a profile
    pub fn clear_cache(&self, profile_id: &str) -> Result<(), String> {
        let cache_file = self.state_dir.join(format!("cache_{}.json", profile_id));
        if cache_file.exists() {
            fs::remove_file(&cache_file).map_err(|e| format!("Failed to remove cache: {}", e))?;
        }
        Ok(())
    }

    /// Clean up stale profiles (profiles where files no longer exist)
    pub fn cleanup_stale_profiles(&self, game_dir: &PathBuf) -> Result<(), String> {
        let profiles = self.get_profiles()?;
        let versions_dir = game_dir.join("versions");
        let instances_dir = game_dir.join("instances");

        for profile in profiles {
            // Check if version JSON exists
            let version_json = versions_dir
                .join(&profile.id)
                .join(format!("{}.json", profile.id));
            let instance_dir = instances_dir.join(&profile.id);

            // If neither exists, remove the profile
            if !version_json.exists() && !instance_dir.exists() {
                println!("[State] Cleaning up stale profile: {}", profile.id);
                self.remove_profile(&profile.id)?;
            }
        }

        Ok(())
    }
}
