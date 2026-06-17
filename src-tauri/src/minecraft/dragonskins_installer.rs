use std::fs;

const DRAGONSKINS_REPO: &str = "dhhd67807-lgtm/dragonskins-mod";
const GITHUB_API_URL: &str = "https://api.github.com";

/// Supported Minecraft versions for DragonSkins mod
const SUPPORTED_VERSIONS: &[&str] = &[
    "1.16.2", "1.17.1", "1.18.1", "1.18.2", "1.19", "1.19.2", "1.19.3", "1.19.4", "1.20", "1.20.1",
    "1.20.2", "1.20.4", "1.20.6", "1.21.1", "1.21.3", "1.21.4",
];

impl super::MinecraftLauncher {
    /// Check if DragonSkins mod is supported for this Minecraft version
    pub fn is_dragonskins_supported(&self, mc_version: &str) -> bool {
        SUPPORTED_VERSIONS.contains(&mc_version)
    }

    /// Check if DragonSkins mod is installed for a version
    pub fn is_dragonskins_installed(&self, version_id: &str) -> bool {
        // Dragon loader uses instances directory
        let mods_dir = if version_id.starts_with("lapetus-") {
            self.game_dir
                .join("instances")
                .join(version_id)
                .join("mods")
        } else {
            self.game_dir.join("versions").join(version_id).join("mods")
        };

        if !mods_dir.exists() {
            return false;
        }

        // Check if any dragonskins JAR exists
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let filename = entry.file_name().to_string_lossy().to_string();
                if filename.starts_with("dragonskins") && filename.ends_with(".jar") {
                    return true;
                }
            }
        }

        false
    }

    /// Verify DragonSkins mod and reinstall if missing
    pub async fn verify_dragonskins_mod<F>(
        &self,
        mc_version: &str,
        version_id: &str,
        progress_callback: F,
    ) -> Result<bool, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Check if version supports DragonSkins
        if !self.is_dragonskins_supported(mc_version) {
            return Ok(false);
        }

        // Check if mod is already installed
        if self.is_dragonskins_installed(version_id) {
            progress_callback(1.0, "DragonSkins mod verified".to_string());
            return Ok(true);
        }

        // Mod is missing, reinstall it
        progress_callback(0.0, "DragonSkins mod missing, reinstalling...".to_string());

        match self
            .install_dragonskins_mod(mc_version, version_id, progress_callback)
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                println!("[DragonSkins] Failed to reinstall: {}", e);
                Ok(false) // Don't fail the launch, just log the error
            }
        }
    }

    /// Install DragonSkins mod for a specific Minecraft version
    pub async fn install_dragonskins_mod<F>(
        &self,
        mc_version: &str,
        version_id: &str,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        // Check if version is supported
        if !self.is_dragonskins_supported(mc_version) {
            return Err(format!(
                "DragonSkins mod is not available for Minecraft {}",
                mc_version
            ));
        }

        progress_callback(0.0, "Checking for DragonSkins mod...".to_string());

        // Create mods directory for this version
        // Dragon loader uses instances directory
        let mods_dir = if version_id.starts_with("lapetus-") {
            self.game_dir
                .join("instances")
                .join(version_id)
                .join("mods")
        } else {
            self.game_dir.join("versions").join(version_id).join("mods")
        };
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;

        progress_callback(0.1, "Fetching latest DragonSkins release...".to_string());

        // Use GitHub Releases instead of Actions artifacts (no auth required)
        let client = reqwest::Client::builder()
            .user_agent("DragonLoader/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Download directly from GitHub Releases
        let jar_filename = format!("dragonskins-{}.jar", mc_version);
        let download_url = format!(
            "https://github.com/{}/releases/latest/download/{}",
            DRAGONSKINS_REPO, jar_filename
        );

        progress_callback(
            0.3,
            format!("Downloading DragonSkins for {}...", mc_version),
        );

        println!("[DragonSkins] Downloading from: {}", download_url);

        let jar_response = client
            .get(&download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download mod: {}", e))?;

        if !jar_response.status().is_success() {
            return Err(format!(
                "Failed to download mod: HTTP {}",
                jar_response.status()
            ));
        }

        let jar_bytes = jar_response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read mod file: {}", e))?;

        // Validate JAR file (check ZIP magic bytes)
        if jar_bytes.len() < 4 || &jar_bytes[0..4] != [0x50, 0x4B, 0x03, 0x04] {
            return Err("Downloaded file is not a valid JAR".to_string());
        }

        progress_callback(0.8, "Installing mod file...".to_string());

        // Save the JAR file
        let jar_path = mods_dir.join(&jar_filename);
        fs::write(&jar_path, &jar_bytes).map_err(|e| format!("Failed to save JAR file: {}", e))?;

        progress_callback(1.0, format!("DragonSkins mod installed: {}", jar_filename));

        println!("[DragonSkins] Installed mod to: {:?}", jar_path);
        Ok(())
    }

    /// Install DragonSkins mod after Fabric/Quilt installation
    pub async fn install_with_dragonskins<F>(
        &self,
        loader: &str,
        mc_version: &str,
        loader_version: &str,
        progress_callback: F,
    ) -> Result<String, String>
    where
        F: Fn(f32, String) + Send + Sync + Clone,
    {
        // Install the loader first (Fabric or Quilt)
        let version_id = match loader {
            "fabric" => {
                let fabric_info = super::fabric::FabricVersionInfo {
                    id: format!("fabric-loader-{}-{}", loader_version, mc_version),
                    mc_version: mc_version.to_string(),
                    loader_version: loader_version.to_string(),
                    stable: true,
                };

                let cb = progress_callback.clone();
                self.install_fabric(&fabric_info, move |p, msg| {
                    cb(p * 0.8, msg); // Scale to 0-80%
                })
                .await?
            }
            "quilt" => {
                let quilt_info = super::quilt::QuiltVersionInfo {
                    id: format!("quilt-loader-{}-{}", loader_version, mc_version),
                    mc_version: mc_version.to_string(),
                    loader_version: loader_version.to_string(),
                    stable: true,
                };

                let cb = progress_callback.clone();
                self.install_quilt(&quilt_info, move |p, msg| {
                    cb(p * 0.8, msg); // Scale to 0-80%
                })
                .await?
            }
            _ => return Err(format!("Unsupported loader: {}", loader)),
        };

        // Install DragonSkins mod if supported
        if self.is_dragonskins_supported(mc_version) {
            let cb = progress_callback.clone();
            match self
                .install_dragonskins_mod(mc_version, &version_id, move |p, msg| {
                    cb(0.8 + (p * 0.2), format!("[DragonSkins] {}", msg)); // Scale to 80-100%
                })
                .await
            {
                Ok(_) => println!("[DragonSkins] Mod installed successfully"),
                Err(e) => println!("[DragonSkins] Failed to install mod: {}", e),
            }
        } else {
            progress_callback(
                1.0,
                format!(
                    "Installation complete (DragonSkins not available for {})",
                    mc_version
                ),
            );
        }

        Ok(version_id)
    }
}
