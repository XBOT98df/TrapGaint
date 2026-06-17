use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionManifest {
    pub version: String,
    pub timestamp: String,
    pub minecraft_versions: HashMap<String, ModVersion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModVersion {
    pub url: String,
    pub sha256: String,
    #[serde(default)]
    pub size: Option<u64>,
}

const MANIFEST_URL: &str =
    "https://github.com/dhhd67807-lgtm/dragon-client-mod/releases/latest/download/versions.json";

pub async fn check_for_updates(minecraft_version: &str) -> Result<Option<ModVersion>, String> {
    let client = reqwest::Client::builder()
        .user_agent("DragonLauncher/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Manifest request failed with status {}",
            response.status()
        ));
    }

    let manifest: VersionManifest = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    // Get version for this Minecraft version
    if let Some(mod_version) = manifest.minecraft_versions.get(minecraft_version) {
        Ok(Some(mod_version.clone()))
    } else {
        Ok(None)
    }
}

pub async fn download_mod(url: &str, destination: &PathBuf) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("DragonLauncher/1.0")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download mod: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Mod download failed with status {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read mod bytes: {}", e))?;

    // Write to destination
    std::fs::write(destination, bytes).map_err(|e| format!("Failed to write mod file: {}", e))?;

    Ok(())
}

pub fn verify_sha256(file_path: &PathBuf, expected_hash: &str) -> Result<bool, String> {
    use sha2::{Digest, Sha256};

    let bytes = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file for verification: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let result = hasher.finalize();
    let hash = format!("{:x}", result);

    Ok(hash == expected_hash)
}

pub async fn update_dragon_client(
    minecraft_version: &str,
    mods_dir: &PathBuf,
) -> Result<String, String> {
    // Check for updates
    let mod_version = check_for_updates(minecraft_version).await?.ok_or_else(|| {
        format!(
            "No Dragon Client available for Minecraft {}",
            minecraft_version
        )
    })?;

    let jar_name = mod_version
        .url
        .split('/')
        .last()
        .unwrap_or("dragon-client.jar");
    let destination = mods_dir.join(jar_name);
    let temp_destination = mods_dir.join(format!("{}.download", jar_name));

    download_mod(&mod_version.url, &temp_destination).await?;

    // Verify download
    if !verify_sha256(&temp_destination, &mod_version.sha256)? {
        std::fs::remove_file(&temp_destination).ok();
        return Err("Downloaded file failed SHA256 verification".to_string());
    }

    // Remove old Dragon Client JARs only after the new download is verified
    if let Ok(entries) = std::fs::read_dir(mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path == temp_destination {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("dragon-client-") && name.ends_with(".jar") {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }

    std::fs::rename(&temp_destination, &destination)
        .map_err(|e| format!("Failed to finalize Dragon Client update: {}", e))?;

    Ok(format!(
        "Dragon Client updated successfully to {}",
        jar_name
    ))
}

#[tauri::command]
pub async fn check_dragon_client_update(
    minecraft_version: String,
) -> Result<Option<String>, String> {
    match check_for_updates(&minecraft_version).await? {
        Some(mod_version) => {
            // Extract version from URL
            let version = mod_version
                .url
                .split('/')
                .find(|s| s.starts_with('v'))
                .map(|s| s.to_string());
            Ok(version)
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn update_dragon_client_command(
    minecraft_version: String,
    instance_path: String,
) -> Result<String, String> {
    let mods_dir = PathBuf::from(instance_path).join("mods");

    // Create mods directory if it doesn't exist
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| format!("Failed to create mods directory: {}", e))?;

    update_dragon_client(&minecraft_version, &mods_dir).await
}
