use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;

const FORGE_MAVEN_URL: &str = "https://maven.minecraftforge.net";
const FORGE_PROMOTIONS_URL: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ForgeVersionInfo {
    pub id: String,
    pub mc_version: String,
    pub forge_version: String,
    pub installer_url: String,
    pub is_recommended: bool,
}

#[derive(Debug, Deserialize)]
struct ForgePromotions {
    promos: std::collections::HashMap<String, String>,
}

impl super::MinecraftLauncher {
    /// Get all available Forge versions
    pub async fn get_forge_versions(&self) -> Result<Vec<ForgeVersionInfo>, String> {
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        // Get promotions to know which versions are recommended
        let promos_response = client
            .get(FORGE_PROMOTIONS_URL)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Forge promotions: {}", e))?;

        let promotions: ForgePromotions = promos_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Forge promotions: {}", e))?;

        // Get all Forge versions from Maven metadata
        let maven_url = format!(
            "{}/net/minecraftforge/forge/maven-metadata.xml",
            FORGE_MAVEN_URL
        );
        let maven_response = client
            .get(&maven_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Forge versions: {}", e))?;

        let maven_text = maven_response
            .text()
            .await
            .map_err(|e| format!("Failed to read Forge versions: {}", e))?;

        // Parse XML to get versions
        let versions = self.parse_forge_maven_xml(&maven_text)?;

        // Convert to ForgeVersionInfo
        let mut forge_versions: Vec<ForgeVersionInfo> = versions
            .into_iter()
            .filter_map(|v| {
                // Version format: mcVersion-forgeVersion (e.g., "1.20.1-47.2.0")
                let parts: Vec<&str> = v.split('-').collect();
                if parts.len() >= 2 {
                    let mc_version = parts[0].to_string();
                    let forge_version = parts[1..].join("-");

                    // Check if this is a recommended version
                    let recommended_key = format!("{}-recommended", mc_version);
                    let is_recommended = promotions
                        .promos
                        .get(&recommended_key)
                        .map(|rec| rec == &forge_version)
                        .unwrap_or(false);

                    let installer_url = format!(
                        "{}/net/minecraftforge/forge/{}/forge-{}-installer.jar",
                        FORGE_MAVEN_URL, v, v
                    );

                    Some(ForgeVersionInfo {
                        id: format!("{}-forge-{}", mc_version, forge_version),
                        mc_version,
                        forge_version,
                        installer_url,
                        is_recommended,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by MC version (newest first), then by forge version
        forge_versions.sort_by(|a, b| {
            let mc_cmp = version_compare(&b.mc_version, &a.mc_version);
            if mc_cmp == std::cmp::Ordering::Equal {
                version_compare(&b.forge_version, &a.forge_version)
            } else {
                mc_cmp
            }
        });

        Ok(forge_versions)
    }

    /// Parse Maven metadata XML to extract versions
    fn parse_forge_maven_xml(&self, xml: &str) -> Result<Vec<String>, String> {
        let mut versions = Vec::new();
        let mut in_versions = false;

        for line in xml.lines() {
            let trimmed = line.trim();
            if trimmed.contains("<versions>") {
                in_versions = true;
            } else if trimmed.contains("</versions>") {
                in_versions = false;
            } else if in_versions && trimmed.starts_with("<version>") {
                if let Some(version) = trimmed
                    .strip_prefix("<version>")
                    .and_then(|s| s.strip_suffix("</version>"))
                {
                    versions.push(version.to_string());
                }
            }
        }

        Ok(versions)
    }

    /// Get installed Forge versions
    pub fn get_installed_forge_versions(&self) -> Result<Vec<String>, String> {
        let versions_dir = self.game_dir.join("versions");
        let instances_dir = self.game_dir.join("instances");
        let mut installed_set: HashSet<String> = HashSet::new();

        if instances_dir.exists() {
            for entry in fs::read_dir(&instances_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();

                // Forge versions contain "forge" in the name
                if name.to_lowercase().contains("forge") {
                    println!("[INFO] Found Forge instance: {}", name);
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
                if !name.to_lowercase().contains("forge") {
                    continue;
                }
                let json_path = entry.path().join(format!("{}.json", name));
                if json_path.exists() {
                    println!("[INFO] Found Forge version: {}", name);
                    installed_set.insert(name);
                }
            }
        }

        // Include Forge profiles tracked in launcher state (covers installs before instance creation)
        if let Ok(profiles) = self.state.get_profiles() {
            for profile in profiles {
                if profile.install_stage == super::state::InstallStage::Installed
                    && profile.loader.eq_ignore_ascii_case("forge")
                    && profile.id.to_lowercase().contains("forge")
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

    /// Get Forge versions available for a specific Minecraft version
    pub async fn get_forge_versions_for_mc(
        &self,
        mc_version: &str,
    ) -> Result<Vec<ForgeVersionInfo>, String> {
        let all_versions = self.get_forge_versions().await?;
        Ok(all_versions
            .into_iter()
            .filter(|v| v.mc_version == mc_version)
            .collect())
    }

    /// Install Forge for a specific Minecraft version
    pub async fn install_forge<F>(
        &self,
        forge_version: &ForgeVersionInfo,
        progress_callback: F,
    ) -> Result<String, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(
            0.0,
            format!(
                "Installing Forge {} for Minecraft {}...",
                forge_version.forge_version, forge_version.mc_version
            ),
        );

        // First ensure vanilla Minecraft is installed
        let vanilla_jar = self
            .versions_dir
            .join(&forge_version.mc_version)
            .join(format!("{}.jar", forge_version.mc_version));
        if !vanilla_jar.exists() {
            return Err(format!("Minecraft {} must be installed first. Please install vanilla Minecraft {} before installing Forge.", forge_version.mc_version, forge_version.mc_version));
        }

        // Create launcher_profiles.json if it doesn't exist (required by Forge installer)
        let profiles_path = self.game_dir.join("launcher_profiles.json");
        if !profiles_path.exists() {
            let default_profiles = serde_json::json!({
                "profiles": {},
                "selectedProfile": "",
                "clientToken": uuid::Uuid::new_v4().to_string(),
                "authenticationDatabase": {},
                "launcherVersion": {
                    "name": "custom-launcher",
                    "format": 21
                }
            });
            fs::write(
                &profiles_path,
                serde_json::to_string_pretty(&default_profiles).unwrap(),
            )
            .map_err(|e| format!("Failed to create launcher_profiles.json: {}", e))?;
            println!("Created launcher_profiles.json");
        }

        progress_callback(0.1, "Downloading Forge installer...".to_string());

        // Download Forge installer
        let client = reqwest::Client::builder()
            .user_agent("MinecraftLauncher/1.0")
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| e.to_string())?;

        let installer_path = self.game_dir.join("forge-installer.jar");

        println!(
            "Downloading Forge installer from: {}",
            forge_version.installer_url
        );

        let response = client
            .get(&forge_version.installer_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Forge installer: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to download Forge installer: HTTP {}",
                response.status()
            ));
        }

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

        println!("Forge installer downloaded: {} bytes", bytes.len());

        progress_callback(
            0.3,
            "Running Forge installer (this may take a while)...".to_string(),
        );

        // Run Forge installer
        let java_path = self.find_java_for_forge(&forge_version.mc_version)?;

        println!("Using Java: {}", java_path);
        println!("Game dir: {:?}", self.game_dir);

        // Determine if this is an old-style Forge (pre-1.13) or new-style
        // Old Forge installers don't support --installClient, they need different handling
        let mc_parts: Vec<&str> = forge_version.mc_version.split('.').collect();
        let is_old_forge = if mc_parts.len() >= 2 {
            mc_parts[1].parse::<u32>().map(|v| v < 13).unwrap_or(false)
        } else {
            false
        };

        let output = if is_old_forge {
            // Old Forge (1.12.2 and earlier) - use headless AWT mode
            println!("Using old Forge installer mode (pre-1.13)");

            let mut cmd = std::process::Command::new(&java_path);
            cmd.arg("-Djava.awt.headless=true")
                .arg("-jar")
                .arg(&installer_path)
                .current_dir(&self.game_dir)
                .env("_JAVA_OPTIONS", "");

            // On Windows, hide the console window
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            println!("Running: {:?}", cmd);

            // For old installers, we need to extract and install manually
            // First, try running with no args to see if it auto-installs
            let result = cmd.output();

            if result.is_err() || !result.as_ref().unwrap().status.success() {
                // Try extracting the installer contents manually
                println!("Attempting manual extraction for old Forge...");
                self.install_old_forge_manually(&forge_version, &installer_path)
                    .await?;

                // Return a fake successful output
                std::process::Output {
                    status: std::process::ExitStatus::default(),
                    stdout: b"Manual installation completed".to_vec(),
                    stderr: Vec::new(),
                }
            } else {
                result.unwrap()
            }
        } else {
            // New Forge (1.13+) - use --installClient
            println!("Using new Forge installer mode (1.13+)");

            let mut cmd = std::process::Command::new(&java_path);
            cmd.arg("-jar")
                .arg(&installer_path)
                .arg("--installClient")
                .arg(&self.game_dir)
                .current_dir(&self.game_dir)
                .env("_JAVA_OPTIONS", "");

            // On Windows, hide the console window
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            println!("Running: {:?}", cmd);

            cmd.output()
                .map_err(|e| format!("Failed to run Forge installer: {}", e))?
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        println!("Forge installer stdout: {}", stdout);
        println!("Forge installer stderr: {}", stderr);
        println!("Forge installer exit code: {:?}", output.status.code());

        // Check if installation succeeded by looking for the version folder
        // Forge creates versions with different naming patterns depending on version
        let possible_names = vec![
            format!(
                "{}-forge-{}",
                forge_version.mc_version, forge_version.forge_version
            ),
            format!(
                "{}-forge{}",
                forge_version.mc_version, forge_version.forge_version
            ),
            format!(
                "forge-{}-{}",
                forge_version.mc_version, forge_version.forge_version
            ),
            format!(
                "{}-Forge{}",
                forge_version.mc_version, forge_version.forge_version
            ),
            // Old Forge naming patterns
            format!(
                "{}-forge{}-{}",
                forge_version.mc_version, forge_version.mc_version, forge_version.forge_version
            ),
        ];

        let mut installed = false;
        let mut installed_name = String::new();

        for name in &possible_names {
            let version_dir = self.versions_dir.join(name);
            let json_path = version_dir.join(format!("{}.json", name));
            if json_path.exists() {
                installed = true;
                installed_name = name.clone();
                println!("Found installed Forge at: {:?}", version_dir);
                break;
            }
        }

        // Also scan versions directory for any new forge version
        if !installed {
            if let Ok(entries) = fs::read_dir(&self.versions_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if (name.to_lowercase().contains("forge"))
                        && name.contains(&forge_version.mc_version)
                    {
                        let json_path = entry.path().join(format!("{}.json", name));
                        if json_path.exists() {
                            installed = true;
                            installed_name = name;
                            println!("Found installed Forge (scanned): {:?}", entry.path());
                            break;
                        }
                    }
                }
            }
        }

        // Clean up installer
        let _ = fs::remove_file(&installer_path);

        if !installed {
            // Provide more helpful error message
            let error_msg = if stderr.contains("Java") || stderr.contains("java") {
                format!("Forge installer failed - Java issue: {}", stderr)
            } else if stderr.contains("download") || stderr.contains("Download") {
                format!(
                    "Forge installer failed - Download issue. Check your internet connection: {}",
                    stderr
                )
            } else if stderr.is_empty() && stdout.is_empty() {
                "Forge installer failed silently. The installer may require a GUI. Try running the installer manually from the .minecraft folder.".to_string()
            } else if stdout.contains("Successfully") || stdout.contains("successfully") {
                // Sometimes it says success but we can't find the files
                format!("Forge installer reported success but version files not found. Check your .minecraft/versions folder. Output: {}", stdout)
            } else if is_old_forge {
                format!("Old Forge (pre-1.13) installation failed. These versions may require manual installation. Download the installer from files.minecraftforge.net and run it manually.")
            } else {
                format!(
                    "Forge installer failed:\nOutput: {}\nErrors: {}",
                    stdout, stderr
                )
            };

            return Err(error_msg);
        }

        // Create profile in state system (like Modrinth)
        let profile = super::state::Profile {
            id: installed_name.clone(),
            name: format!("Forge {}", forge_version.mc_version),
            game_version: forge_version.mc_version.clone(),
            loader: "forge".to_string(),
            loader_version: Some(forge_version.forge_version.clone()),
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
        println!("[Forge] Created profile in state: {}", installed_name);

        progress_callback(
            1.0,
            format!("Forge {} installed successfully!", installed_name),
        );

        Ok(installed_name)
    }

    /// Manually install old Forge versions by extracting the installer
    async fn install_old_forge_manually(
        &self,
        forge_version: &ForgeVersionInfo,
        installer_path: &std::path::Path,
    ) -> Result<(), String> {
        use std::io::Read;

        println!(
            "Attempting manual installation for old Forge {}...",
            forge_version.forge_version
        );

        // Open the installer JAR as a zip
        let file = fs::File::open(installer_path)
            .map_err(|e| format!("Failed to open installer: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read installer as zip: {}", e))?;

        // Look for install_profile.json
        let install_profile: serde_json::Value = {
            let mut profile_file = archive
                .by_name("install_profile.json")
                .map_err(|e| format!("Failed to find install_profile.json: {}", e))?;
            let mut contents = String::new();
            profile_file
                .read_to_string(&mut contents)
                .map_err(|e| format!("Failed to read install_profile.json: {}", e))?;
            serde_json::from_str(&contents)
                .map_err(|e| format!("Failed to parse install_profile.json: {}", e))?
        };

        // Get version info from install profile
        let version_info = install_profile
            .get("versionInfo")
            .ok_or("No versionInfo in install_profile.json")?;

        let version_id = version_info
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("No id in versionInfo")?;

        println!("Installing Forge version: {}", version_id);

        // Create version directory
        let version_dir = self.versions_dir.join(version_id);
        fs::create_dir_all(&version_dir)
            .map_err(|e| format!("Failed to create version directory: {}", e))?;

        // Write version JSON
        let json_path = version_dir.join(format!("{}.json", version_id));
        fs::write(
            &json_path,
            serde_json::to_string_pretty(version_info).unwrap(),
        )
        .map_err(|e| format!("Failed to write version JSON: {}", e))?;

        // Extract the forge universal jar to the correct Maven path in libraries
        // For old Forge (pre-1.13), the path format is: {mc_version}-{forge_version}-{mc_version}
        // Example: libraries/net/minecraftforge/forge/1.8.9-11.15.1.2318-1.8.9/forge-1.8.9-11.15.1.2318-1.8.9.jar
        let forge_lib_path = if forge_version.mc_version.starts_with("1.") {
            let parts: Vec<&str> = forge_version.mc_version.split('.').collect();
            let is_old_forge =
                parts.len() >= 2 && parts[1].parse::<u32>().map(|v| v < 13).unwrap_or(false);

            if is_old_forge {
                // Old format: mc-forge-mc
                format!(
                    "{}-{}-{}",
                    forge_version.mc_version, forge_version.forge_version, forge_version.mc_version
                )
            } else {
                // New format: mc-forge
                format!(
                    "{}-{}",
                    forge_version.mc_version, forge_version.forge_version
                )
            }
        } else {
            format!(
                "{}-{}",
                forge_version.mc_version, forge_version.forge_version
            )
        };

        let forge_lib_dir = self
            .libraries_dir
            .join("net/minecraftforge/forge")
            .join(&forge_lib_path);
        fs::create_dir_all(&forge_lib_dir)
            .map_err(|e| format!("Failed to create Forge library directory: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();

            // Look for forge universal jar
            if name.contains("forge") && name.ends_with(".jar") && !name.contains("installer") {
                // Extract to the correct Maven path
                let jar_filename = std::path::Path::new(&name)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let lib_path = forge_lib_dir.join(&jar_filename);

                let mut contents = Vec::new();
                file.read_to_end(&mut contents).ok();
                fs::write(&lib_path, &contents).ok();
                println!("Extracted to Maven path: {:?}", lib_path);

                // Also create the non-universal version (some version JSONs reference it without -universal)
                if jar_filename.contains("-universal") {
                    let non_universal_name = jar_filename.replace("-universal", "");
                    let non_universal_path = forge_lib_dir.join(&non_universal_name);
                    fs::write(&non_universal_path, &contents).ok();
                    println!("Also created: {:?}", non_universal_path);
                }
            }
        }

        // Download all required libraries from Maven
        println!("Downloading Forge libraries...");
        if let Some(libraries) = version_info.get("libraries").and_then(|l| l.as_array()) {
            let client = reqwest::Client::builder()
                .user_agent("MinecraftLauncher/1.0")
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .map_err(|e| e.to_string())?;

            for lib in libraries {
                // Skip server-only libraries
                if let Some(clientreq) = lib.get("clientreq") {
                    if clientreq.as_bool() == Some(false) {
                        continue;
                    }
                }

                // Old format: just "name" field with Maven coordinates
                if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                    // Parse Maven coordinates: group:artifact:version
                    let parts: Vec<&str> = name.split(':').collect();
                    if parts.len() >= 3 {
                        let group = parts[0].replace('.', "/");
                        let artifact = parts[1];
                        let version = parts[2];

                        // Build path: group/artifact/version/artifact-version.jar
                        let jar_name = if parts.len() > 3 {
                            format!("{}-{}-{}.jar", artifact, version, parts[3])
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

                        // Get the Maven URL from the library or use default
                        let base_url = lib
                            .get("url")
                            .and_then(|u| u.as_str())
                            .unwrap_or("https://libraries.minecraft.net/");

                        let download_url = format!(
                            "{}{}/{}/{}/{}",
                            base_url, group, artifact, version, jar_name
                        );

                        println!("Downloading library: {} -> {}", name, download_url);

                        // Try to download
                        match client.get(&download_url).send().await {
                            Ok(response) => {
                                if response.status().is_success() {
                                    if let Ok(bytes) = response.bytes().await {
                                        if fs::write(&lib_path, &bytes).is_ok() {
                                            println!("  Downloaded: {}", jar_name);
                                        }
                                    }
                                } else {
                                    // Try Forge Maven as fallback
                                    let forge_url = format!(
                                        "https://maven.minecraftforge.net/{}/{}/{}/{}",
                                        group, artifact, version, jar_name
                                    );
                                    if let Ok(resp) = client.get(&forge_url).send().await {
                                        if resp.status().is_success() {
                                            if let Ok(bytes) = resp.bytes().await {
                                                if fs::write(&lib_path, &bytes).is_ok() {
                                                    println!(
                                                        "  Downloaded from Forge Maven: {}",
                                                        jar_name
                                                    );
                                                }
                                            }
                                        } else {
                                            println!("  Warning: Could not download {}", jar_name);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                println!("  Warning: Failed to download {}: {}", jar_name, e);
                            }
                        }
                    }
                }
            }
        }

        println!("Manual Forge installation completed");
        Ok(())
    }

    /// Find Java suitable for running Forge installer
    fn find_java_for_forge(&self, mc_version: &str) -> Result<String, String> {
        // Parse MC version to determine Java requirement
        let parts: Vec<&str> = mc_version.split('.').collect();
        let required_java = if parts.len() >= 2 {
            if let Ok(minor) = parts[1].parse::<u32>() {
                match minor {
                    21.. => 21,
                    18..=20 => 17,
                    17 => 16,
                    _ => 8,
                }
            } else {
                17
            }
        } else {
            17
        };

        // First check bundled Java
        let bundled_java = self
            .game_dir
            .join("runtime")
            .join(format!("java-{}", required_java));
        #[cfg(target_os = "windows")]
        let bundled_exe = bundled_java.join("bin").join("java.exe");
        #[cfg(not(target_os = "windows"))]
        let bundled_exe = bundled_java.join("bin").join("java");

        if bundled_exe.exists() {
            return Ok(bundled_exe.to_string_lossy().to_string());
        }

        // Try to find Java in system paths
        #[cfg(target_os = "windows")]
        let java_paths: Vec<String> = match required_java {
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
            _ => vec![
                format!("C:\\Program Files\\Eclipse Adoptium\\jdk-8u432-b06\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jre1.8.0_432\\bin\\java.exe"),
                format!("C:\\Program Files\\Java\\jdk1.8.0_432\\bin\\java.exe"),
            ],
        };

        #[cfg(target_os = "macos")]
        let java_paths: Vec<String> = match required_java {
            21 => vec![
                "/opt/homebrew/opt/openjdk@21/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home/bin/java".to_string(),
            ],
            17 => vec![
                "/opt/homebrew/opt/openjdk@17/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home/bin/java".to_string(),
            ],
            _ => vec![
                "/opt/homebrew/opt/openjdk@8/bin/java".to_string(),
                "/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java"
                    .to_string(),
                "/opt/homebrew/opt/openjdk/bin/java".to_string(),
            ],
        };

        #[cfg(target_os = "linux")]
        let java_paths: Vec<String> = match required_java {
            21 => vec!["/usr/lib/jvm/java-21-openjdk/bin/java".to_string()],
            17 => vec!["/usr/lib/jvm/java-17-openjdk/bin/java".to_string()],
            _ => vec!["/usr/lib/jvm/java-8-openjdk/bin/java".to_string()],
        };

        for path in &java_paths {
            if std::path::Path::new(path).exists() {
                return Ok(path.clone());
            }
        }

        // Fallback to system java
        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = std::process::Command::new("where").arg("java").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !path.is_empty() && std::path::Path::new(&path).exists() {
                        return Ok(path);
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(output) = std::process::Command::new("which").arg("java").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Ok(path);
                    }
                }
            }
        }

        Err(format!(
            "Java {} not found. Please install Java {} for Forge.",
            required_java, required_java
        ))
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
