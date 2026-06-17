use serde::{Deserialize, Serialize};

const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
// Fallback mirror (Mojang's alternative endpoint)
const VERSION_MANIFEST_FALLBACK: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
}

impl super::MinecraftLauncher {
    pub async fn get_versions(&self) -> Result<Vec<VersionInfo>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        // Try primary URL first, then fallback
        let urls = [VERSION_MANIFEST_URL, VERSION_MANIFEST_FALLBACK];
        let mut last_error = String::new();

        for url in urls {
            // Retry up to 3 times per URL
            for attempt in 1..=3 {
                println!("[Manifest] Fetching from {} (attempt {})", url, attempt);

                match client
                    .get(url)
                    .header("User-Agent", "Lapetus-Launcher/1.0")
                    .send()
                    .await
                {
                    Ok(response) => {
                        if response.status().is_success() {
                            match response.json::<VersionManifest>().await {
                                Ok(manifest) => {
                                    println!(
                                        "[Manifest] Successfully loaded {} versions",
                                        manifest.versions.len()
                                    );
                                    return Ok(manifest.versions);
                                }
                                Err(e) => {
                                    last_error = format!("Failed to parse manifest: {}", e);
                                    println!("[Manifest] Parse error: {}", last_error);
                                }
                            }
                        } else {
                            last_error = format!("HTTP {}", response.status());
                            println!("[Manifest] HTTP error: {}", last_error);
                        }
                    }
                    Err(e) => {
                        last_error = format!("Network error: {}", e);
                        println!("[Manifest] Request failed: {}", last_error);

                        // Wait before retry
                        if attempt < 3 {
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        }
                    }
                }
            }
        }

        Err(format!("Failed to fetch version manifest after multiple attempts. Last error: {}. Please check your internet connection.", last_error))
    }
}
