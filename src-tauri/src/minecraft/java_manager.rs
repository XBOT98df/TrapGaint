use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Java version info (matches Modrinth's structure)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaVersionInfo {
    pub major_version: u8,
    pub path: String,
    pub version_string: String,
    pub architecture: String,
}

/// Java manager for auto-installing Java versions
pub struct JavaManager {
    java_dir: PathBuf,
}

impl JavaManager {
    pub fn new(game_dir: &PathBuf) -> Self {
        let java_dir = game_dir.join("runtime");
        fs::create_dir_all(&java_dir).ok();

        Self { java_dir }
    }

    /// Auto-install Java from Azul Zulu (like Modrinth does)
    pub async fn auto_install_java<F>(
        &self,
        java_version: u8,
        progress_callback: F,
    ) -> Result<PathBuf, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(0.0, format!("Fetching Java {} info...", java_version));

        #[derive(Deserialize)]
        struct ZuluPackage {
            pub download_url: String,
            pub name: String,
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        // Use Azul Zulu API (same as Modrinth)
        let api_url = format!(
            "https://api.azul.com/metadata/v1/zulu/packages?arch={}&java_version={}&os={}&archive_type=zip&javafx_bundled=false&java_package_type=jre&page_size=1",
            std::env::consts::ARCH,
            java_version,
            std::env::consts::OS
        );

        println!("[Java Manager] Fetching from Azul API: {}", api_url);

        let response = client
            .get(&api_url)
            .header("User-Agent", "Block-Launcher/2.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Java info: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Azul API returned status: {}", response.status()));
        }

        let packages: Vec<ZuluPackage> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Java info: {}", e))?;

        let package = packages.first().ok_or_else(|| {
            format!(
                "No Java {} found for OS {} and Architecture {}",
                java_version,
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })?;

        progress_callback(0.1, format!("Downloading Java {}...", java_version));
        println!("[Java Manager] Downloading from: {}", package.download_url);

        // Download Java
        let response = client
            .get(&package.download_url)
            .header("User-Agent", "Block-Launcher/2.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download Java: {}", e))?;

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to download chunk: {}", e))?;
            bytes.extend_from_slice(&chunk);
            downloaded += chunk.len() as u64;

            if total_size > 0 {
                let progress = 0.1 + (downloaded as f32 / total_size as f32) * 0.7;
                progress_callback(
                    progress,
                    format!(
                        "Downloading Java {}... {:.1}%",
                        java_version,
                        (downloaded as f32 / total_size as f32) * 100.0
                    ),
                );
            }
        }

        progress_callback(0.8, format!("Extracting Java {}...", java_version));
        println!(
            "[Java Manager] Downloaded {} bytes, extracting...",
            bytes.len()
        );

        // Extract Java
        let cursor = std::io::Cursor::new(bytes);
        let mut archive =
            zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to read Java zip: {}", e))?;

        // Get the base directory name from the first entry
        let base_dir_name = {
            let first_entry = archive.file_names().next().ok_or("Empty Java archive")?;
            first_entry
                .split('/')
                .next()
                .ok_or("Invalid Java archive structure")?
                .to_string()
        };

        let extract_path = self.java_dir.join(format!("java-{}", java_version));

        // Remove old installation if exists
        if extract_path.exists() {
            fs::remove_dir_all(&extract_path).ok();
        }

        fs::create_dir_all(&extract_path)
            .map_err(|e| format!("Failed to create Java directory: {}", e))?;

        // Extract all files
        let archive_len = archive.len();
        for i in 0..archive_len {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read archive entry: {}", e))?;

            let file_name = file.name().to_string();
            let outpath = extract_path.join(&file_name);

            if file_name.ends_with('/') {
                fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    fs::create_dir_all(p).ok();
                }
                let mut outfile = fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;

                // Make executable on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if file_name.contains("/bin/") {
                        let mut perms = outfile.metadata().unwrap().permissions();
                        perms.set_mode(0o755);
                        fs::set_permissions(&outpath, perms).ok();
                    }
                }
            }

            if i % 100 == 0 {
                let extract_progress = 0.8 + (i as f32 / archive_len as f32) * 0.15;
                progress_callback(
                    extract_progress,
                    format!("Extracting... {}/{}", i, archive_len),
                );
            }
        }

        // Find the java executable
        let java_exe = self.find_java_executable(&extract_path, &base_dir_name, java_version)?;

        progress_callback(1.0, format!("Java {} installed!", java_version));
        println!(
            "[Java Manager] Java {} installed at: {}",
            java_version,
            java_exe.display()
        );

        Ok(java_exe)
    }

    /// Find the Java executable in the extracted directory
    fn find_java_executable(
        &self,
        extract_path: &PathBuf,
        base_dir: &str,
        java_version: u8,
    ) -> Result<PathBuf, String> {
        #[cfg(target_os = "windows")]
        let java_bin = "java.exe";

        #[cfg(not(target_os = "windows"))]
        let java_bin = "java";

        // Try different possible paths
        let possible_paths = vec![
            // Standard structure
            extract_path.join(base_dir).join("bin").join(java_bin),
            // macOS Zulu structure
            #[cfg(target_os = "macos")]
            extract_path
                .join(base_dir)
                .join(format!("zulu-{}.jre", java_version))
                .join("Contents")
                .join("Home")
                .join("bin")
                .join(java_bin),
            #[cfg(target_os = "macos")]
            extract_path
                .join(base_dir)
                .join("Contents")
                .join("Home")
                .join("bin")
                .join(java_bin),
            // Direct bin
            extract_path.join("bin").join(java_bin),
        ];

        for path in possible_paths {
            if path.exists() {
                return Ok(path);
            }
        }

        Err(format!(
            "Could not find Java executable in extracted directory: {:?}",
            extract_path
        ))
    }

    /// Check if Java version is installed
    pub fn is_java_installed(&self, java_version: u8) -> bool {
        let java_dir = self.java_dir.join(format!("java-{}", java_version));

        if !java_dir.exists() {
            return false;
        }

        // Try to find the executable
        #[cfg(target_os = "windows")]
        let java_bin = "java.exe";

        #[cfg(not(target_os = "windows"))]
        let java_bin = "java";

        // Check common paths
        let paths_to_check = vec![java_dir.join("bin").join(java_bin)];

        // Also check subdirectories
        if let Ok(entries) = fs::read_dir(&java_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let bin_path = entry.path().join("bin").join(java_bin);
                    if bin_path.exists() {
                        return true;
                    }

                    // macOS structure
                    #[cfg(target_os = "macos")]
                    {
                        let macos_path = entry
                            .path()
                            .join("Contents")
                            .join("Home")
                            .join("bin")
                            .join(java_bin);
                        if macos_path.exists() {
                            return true;
                        }
                    }
                }
            }
        }

        paths_to_check.iter().any(|p| p.exists())
    }

    /// Get Java path if installed
    pub fn get_java_path(&self, java_version: u8) -> Option<PathBuf> {
        if !self.is_java_installed(java_version) {
            return None;
        }

        let java_dir = self.java_dir.join(format!("java-{}", java_version));

        #[cfg(target_os = "windows")]
        let java_bin = "java.exe";

        #[cfg(not(target_os = "windows"))]
        let java_bin = "java";

        // Check subdirectories
        if let Ok(entries) = fs::read_dir(&java_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let bin_path = entry.path().join("bin").join(java_bin);
                    if bin_path.exists() {
                        return Some(bin_path);
                    }

                    // macOS structure
                    #[cfg(target_os = "macos")]
                    {
                        let macos_path = entry
                            .path()
                            .join("Contents")
                            .join("Home")
                            .join("bin")
                            .join(java_bin);
                        if macos_path.exists() {
                            return Some(macos_path);
                        }
                    }
                }
            }
        }

        // Fallback to direct bin
        let direct_path = java_dir.join("bin").join(java_bin);
        if direct_path.exists() {
            Some(direct_path)
        } else {
            None
        }
    }

    /// Get required Java version for a Minecraft version
    pub fn get_required_java_version(mc_version: &str) -> u8 {
        // Parse version numbers
        let parts: Vec<&str> = mc_version.split('.').collect();
        let major = parts
            .get(0)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(1);
        let minor = parts
            .get(1)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let patch = parts
            .get(2)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        // Determine Java version based on Minecraft version
        if major >= 26 || (major == 1 && minor >= 26) {
            25 // 26.x+ snapshots/releases require Java 25
        } else if major == 1 {
            if minor >= 21 || (minor == 20 && patch >= 5) {
                21 // 1.20.5+ needs Java 21
            } else if minor >= 18 {
                17 // 1.18 - 1.20.4 needs Java 17
            } else if minor >= 17 {
                16 // 1.17 needs Java 16 (but 17 works)
            } else {
                8 // 1.16.5 and below needs Java 8
            }
        } else {
            25 // Future versions, assume Java 25
        }
    }
}
