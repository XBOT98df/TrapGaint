use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// Dragon Client Custom Skin System
// Supports skins and capes across all Minecraft versions
// Skins are stored in a central location and served via local HTTP server

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonSkin {
    pub player_name: String,
    pub skin_path: String,
    pub cape_path: Option<String>,
    pub model: String, // "default" (Steve) or "slim" (Alex)
    pub uploaded_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonSkinConfig {
    pub skins: Vec<DragonSkin>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CapeSelectionConfig {
    pub selected_cape_index: Option<i32>,
    pub updated_at: u64,
}

impl super::MinecraftLauncher {
    fn normalize_selected_cape_index(index: i32) -> i32 {
        match index {
            14 => 1,
            15 => 2,
            16 => 3,
            17 => 0,
            _ => index,
        }
    }

    /// Get the Dragon Skins directory
    fn get_dragon_skins_dir(&self) -> PathBuf {
        self.game_dir.join("DragonSkins")
    }

    /// Get the skins subdirectory
    fn get_skins_dir(&self) -> PathBuf {
        self.get_dragon_skins_dir().join("skins")
    }

    /// Get the capes subdirectory
    fn get_capes_dir(&self) -> PathBuf {
        self.get_dragon_skins_dir().join("capes")
    }

    /// Get the config file path
    fn get_skins_config_path(&self) -> PathBuf {
        self.get_dragon_skins_dir().join("skins.json")
    }

    /// Get selected cape config path
    fn get_selected_cape_path(&self) -> PathBuf {
        self.get_dragon_skins_dir().join("selected_cape.json")
    }

    /// Load skins configuration
    fn load_skins_config(&self) -> Result<DragonSkinConfig, String> {
        let config_path = self.get_skins_config_path();

        if !config_path.exists() {
            return Ok(DragonSkinConfig { skins: vec![] });
        }

        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read skins config: {}", e))?;

        let config: DragonSkinConfig = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse skins config: {}", e))?;

        Ok(config)
    }

    /// Save skins configuration
    fn save_skins_config(&self, config: &DragonSkinConfig) -> Result<(), String> {
        let config_path = self.get_skins_config_path();

        let content = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

        Ok(())
    }

    /// Save a custom skin for a player
    pub fn save_dragon_skin(
        &self,
        player_name: &str,
        skin_data: &[u8],
        model: &str,
    ) -> Result<String, String> {
        // Create directories
        let skins_dir = self.get_skins_dir();
        fs::create_dir_all(&skins_dir)
            .map_err(|e| format!("Failed to create skins directory: {}", e))?;

        // Validate model
        let model = match model {
            "slim" | "alex" => "slim",
            _ => "default",
        };

        // Save skin file
        let skin_filename = format!("{}.png", player_name);
        let skin_path = skins_dir.join(&skin_filename);

        fs::write(&skin_path, skin_data).map_err(|e| format!("Failed to save skin: {}", e))?;

        // Load config
        let mut config = self.load_skins_config()?;

        // Update or add skin entry
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        if let Some(existing) = config
            .skins
            .iter_mut()
            .find(|s| s.player_name == player_name)
        {
            existing.skin_path = skin_path.to_string_lossy().to_string();
            existing.model = model.to_string();
            existing.uploaded_at = timestamp;
        } else {
            config.skins.push(DragonSkin {
                player_name: player_name.to_string(),
                skin_path: skin_path.to_string_lossy().to_string(),
                cape_path: None,
                model: model.to_string(),
                uploaded_at: timestamp,
            });
        }

        // Save config
        self.save_skins_config(&config)?;

        println!(
            "[DragonSkins] Saved skin for {} (model: {})",
            player_name, model
        );
        Ok(skin_path.to_string_lossy().to_string())
    }

    /// Save a custom cape for a player
    pub fn save_dragon_cape(&self, player_name: &str, cape_data: &[u8]) -> Result<String, String> {
        // Create directories
        let capes_dir = self.get_capes_dir();
        fs::create_dir_all(&capes_dir)
            .map_err(|e| format!("Failed to create capes directory: {}", e))?;

        // Save cape file
        let cape_filename = format!("{}.png", player_name);
        let cape_path = capes_dir.join(&cape_filename);

        fs::write(&cape_path, cape_data).map_err(|e| format!("Failed to save cape: {}", e))?;

        // Load config
        let mut config = self.load_skins_config()?;

        // Update or add cape entry
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        if let Some(existing) = config
            .skins
            .iter_mut()
            .find(|s| s.player_name == player_name)
        {
            existing.cape_path = Some(cape_path.to_string_lossy().to_string());
            existing.uploaded_at = timestamp;
        } else {
            config.skins.push(DragonSkin {
                player_name: player_name.to_string(),
                skin_path: String::new(),
                cape_path: Some(cape_path.to_string_lossy().to_string()),
                model: "default".to_string(),
                uploaded_at: timestamp,
            });
        }

        // Save config
        self.save_skins_config(&config)?;

        println!("[DragonSkins] Saved cape for {}", player_name);
        Ok(cape_path.to_string_lossy().to_string())
    }

    pub fn set_selected_cape_index(&self, cape_index: Option<i32>) -> Result<(), String> {
        let cape_index = cape_index.map(Self::normalize_selected_cape_index);

        if let Some(index) = cape_index {
            if !(0..=18).contains(&index) {
                return Err(format!(
                    "Invalid cape index: {} (expected 0-18 or null)",
                    index
                ));
            }
        }

        let dragon_skins_dir = self.get_dragon_skins_dir();
        fs::create_dir_all(&dragon_skins_dir)
            .map_err(|e| format!("Failed to create DragonSkins directory: {}", e))?;

        let config = CapeSelectionConfig {
            selected_cape_index: cape_index,
            updated_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };

        let content = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize selected cape config: {}", e))?;

        fs::write(self.get_selected_cape_path(), content)
            .map_err(|e| format!("Failed to write selected cape config: {}", e))?;

        println!(
            "[DragonSkins] Selected cape updated: {}",
            config
                .selected_cape_index
                .map(|v| v.to_string())
                .unwrap_or_else(|| "none".to_string())
        );

        Ok(())
    }

    pub fn get_selected_cape_index(&self) -> Result<Option<i32>, String> {
        let config_path = self.get_selected_cape_path();

        if !config_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read selected cape config: {}", e))?;

        let config: CapeSelectionConfig = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse selected cape config: {}", e))?;

        Ok(config
            .selected_cape_index
            .map(Self::normalize_selected_cape_index))
    }

    pub fn has_selected_cape_config(&self) -> bool {
        self.get_selected_cape_path().exists()
    }

    /// Get all uploaded skins
    pub fn get_dragon_skins(&self) -> Result<Vec<DragonSkin>, String> {
        let config = self.load_skins_config()?;
        Ok(config.skins)
    }

    /// Get skin for a specific player
    pub fn get_dragon_skin(&self, player_name: &str) -> Result<Option<DragonSkin>, String> {
        let config = self.load_skins_config()?;
        Ok(config
            .skins
            .into_iter()
            .find(|s| s.player_name == player_name))
    }

    /// Delete a player's skin
    pub fn delete_dragon_skin(&self, player_name: &str) -> Result<(), String> {
        let mut config = self.load_skins_config()?;

        if let Some(skin) = config.skins.iter().find(|s| s.player_name == player_name) {
            // Delete skin file
            if !skin.skin_path.is_empty() {
                fs::remove_file(&skin.skin_path).ok();
            }

            // Delete cape file
            if let Some(cape_path) = &skin.cape_path {
                fs::remove_file(cape_path).ok();
            }
        }

        // Remove from config
        config.skins.retain(|s| s.player_name != player_name);
        self.save_skins_config(&config)?;

        println!("[DragonSkins] Deleted skin for {}", player_name);
        Ok(())
    }

    /// Generate a skin server URL for in-game use
    /// This will be used by the Dragon Client mod to fetch skins
    pub fn get_skin_url(&self, player_name: &str) -> String {
        format!("http://localhost:25585/skins/{}.png", player_name)
    }

    /// Generate a cape server URL for in-game use
    pub fn get_cape_url(&self, player_name: &str) -> String {
        format!("http://localhost:25585/capes/{}.png", player_name)
    }

    /// Start the local skin server (HTTP server on port 25585)
    /// This serves skins and capes to the game
    pub async fn start_skin_server(&self) -> Result<(), String> {
        let skins_dir = self.get_skins_dir();
        let capes_dir = self.get_capes_dir();

        println!("[DragonSkins] Starting skin server on http://localhost:25585");
        println!("[DragonSkins] Skins directory: {:?}", skins_dir);
        println!("[DragonSkins] Capes directory: {:?}", capes_dir);

        use warp::Filter;

        // Serve skins
        let skins_route = warp::path("skins").and(warp::fs::dir(skins_dir));

        // Serve capes
        let capes_route = warp::path("capes").and(warp::fs::dir(capes_dir));

        // Health check
        let health_route = warp::path("health").map(|| {
            warp::reply::json(&serde_json::json!({
                "status": "ok",
                "service": "DragonSkins"
            }))
        });

        let routes = skins_route
            .or(capes_route)
            .or(health_route)
            .with(warp::cors().allow_any_origin());

        match warp::serve(routes).try_bind_ephemeral(([127, 0, 0, 1], 25585)) {
            Ok((_addr, server)) => {
                println!("[DragonSkins] Server started successfully");
                tokio::spawn(server);
                Ok(())
            }
            Err(error) => {
                let message = error.to_string();
                if message
                    .to_ascii_lowercase()
                    .contains("address already in use")
                {
                    if Self::is_skin_server_running().await {
                        println!(
                            "[DragonSkins] Skin server already running on localhost:25585 (reusing existing server)"
                        );
                        Ok(())
                    } else {
                        Err(
                            "Port 25585 is already in use by another process (not DragonSkins)"
                                .to_string(),
                        )
                    }
                } else {
                    Err(format!(
                        "Failed to start DragonSkins server on localhost:25585: {}",
                        message
                    ))
                }
            }
        }
    }

    async fn is_skin_server_running() -> bool {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_millis(250))
            .timeout(std::time::Duration::from_millis(500))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        // Give a just-started server a short moment to come up before deciding.
        for _ in 0..3 {
            let send_result = tokio::time::timeout(
                std::time::Duration::from_millis(500),
                client.get("http://127.0.0.1:25585/health").send(),
            )
            .await;
            if let Ok(Ok(response)) = send_result {
                if response.status().is_success() {
                    let json_result = tokio::time::timeout(
                        std::time::Duration::from_millis(300),
                        response.json::<serde_json::Value>(),
                    )
                    .await;
                    if let Ok(Ok(payload)) = json_result {
                        let is_dragon_service = payload
                            .get("service")
                            .and_then(|value| value.as_str())
                            .map(|service| service.eq_ignore_ascii_case("DragonSkins"))
                            .unwrap_or(false);
                        if is_dragon_service {
                            return true;
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        }
        false
    }

    /// Apply custom skin directly to Minecraft's assets (workaround for offline mode)
    /// This creates a resource pack that overrides the player's skin
    pub fn apply_skin_to_minecraft(&self, username: &str) -> Result<(), String> {
        // Get the custom skin
        let skin = self.get_dragon_skin(username)?;

        if skin.is_none() {
            return Err(format!("No custom skin found for {}", username));
        }

        let skin = skin.unwrap();

        // Create a resource pack in resourcepacks directory
        let resourcepacks_dir = self.game_dir.join("resourcepacks");
        fs::create_dir_all(&resourcepacks_dir)
            .map_err(|e| format!("Failed to create resourcepacks directory: {}", e))?;

        let pack_dir = resourcepacks_dir.join("DragonSkins");
        fs::create_dir_all(&pack_dir)
            .map_err(|e| format!("Failed to create pack directory: {}", e))?;

        // Create pack.mcmeta
        let pack_meta = serde_json::json!({
            "pack": {
                "pack_format": 15, // Works for 1.20+
                "description": "Dragon Client Custom Skins"
            }
        });

        fs::write(
            pack_dir.join("pack.mcmeta"),
            serde_json::to_string_pretty(&pack_meta).unwrap(),
        )
        .map_err(|e| format!("Failed to write pack.mcmeta: {}", e))?;

        // Create assets structure for player skin
        // Modern Minecraft uses assets/minecraft/textures/entity/player/wide/steve.png or slim/alex.png
        let textures_dir = pack_dir
            .join("assets")
            .join("minecraft")
            .join("textures")
            .join("entity")
            .join("player")
            .join("wide");
        fs::create_dir_all(&textures_dir)
            .map_err(|e| format!("Failed to create textures directory: {}", e))?;

        // Copy skin based on model type
        let skin_name = if skin.model == "slim" {
            "alex.png"
        } else {
            "steve.png"
        };
        let dest_path = textures_dir.join(skin_name);

        fs::copy(&skin.skin_path, &dest_path).map_err(|e| format!("Failed to copy skin: {}", e))?;

        // Also create for slim model directory
        let slim_dir = pack_dir
            .join("assets")
            .join("minecraft")
            .join("textures")
            .join("entity")
            .join("player")
            .join("slim");
        fs::create_dir_all(&slim_dir).ok();
        if skin.model == "slim" {
            fs::copy(&skin.skin_path, slim_dir.join("alex.png")).ok();
        }

        println!(
            "[DragonSkins] Created resource pack for {} (model: {})",
            username, skin.model
        );

        // Enable the resource pack in options.txt
        self.enable_resource_pack("DragonSkins")?;

        Ok(())
    }

    /// Enable a resource pack in Minecraft's options.txt
    fn enable_resource_pack(&self, pack_name: &str) -> Result<(), String> {
        let options_path = self.game_dir.join("options.txt");

        if !options_path.exists() {
            // Create options.txt with the resource pack enabled
            let options_content = format!("resourcePacks:[\"file/{}\"]", pack_name);
            fs::write(&options_path, options_content)
                .map_err(|e| format!("Failed to write options.txt: {}", e))?;
            return Ok(());
        }

        // Read existing options
        let options_content = fs::read_to_string(&options_path)
            .map_err(|e| format!("Failed to read options.txt: {}", e))?;

        // Check if resource pack is already enabled
        if options_content.contains(&format!("file/{}", pack_name)) {
            return Ok(());
        }

        // Update or add resourcePacks line
        let mut new_content = String::new();
        let mut found_resource_packs = false;

        for line in options_content.lines() {
            if line.starts_with("resourcePacks:") {
                // Parse existing packs and add ours
                let packs_str = line.strip_prefix("resourcePacks:").unwrap_or("[]");
                let mut packs: Vec<String> = serde_json::from_str(packs_str).unwrap_or_default();
                let pack_entry = format!("file/{}", pack_name);
                if !packs.contains(&pack_entry) {
                    packs.insert(0, pack_entry); // Add at beginning for priority
                }
                new_content.push_str(&format!(
                    "resourcePacks:{}\n",
                    serde_json::to_string(&packs).unwrap()
                ));
                found_resource_packs = true;
            } else {
                new_content.push_str(line);
                new_content.push('\n');
            }
        }

        // If resourcePacks line wasn't found, add it
        if !found_resource_packs {
            new_content.push_str(&format!("resourcePacks:[\"file/{}\"]\n", pack_name));
        }

        fs::write(&options_path, new_content)
            .map_err(|e| format!("Failed to update options.txt: {}", e))?;

        println!("[DragonSkins] Enabled resource pack in options.txt");
        Ok(())
    }

    /// Create the Dragon Client skin mod configuration
    /// This tells the mod where to fetch skins from
    pub fn create_skin_mod_config(&self, instance_dir: &PathBuf) -> Result<(), String> {
        let config_dir = instance_dir.join("config");
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;

        let config_path = config_dir.join("dragonskins.json");

        let config = serde_json::json!({
            "enabled": true,
            "skinServer": "http://localhost:25585",
            "fallbackToMojang": true,
            "cacheEnabled": true,
            "cacheDuration": 3600
        });

        fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
            .map_err(|e| format!("Failed to write mod config: {}", e))?;

        println!("[DragonSkins] Created mod config at {:?}", config_path);
        Ok(())
    }

    /// Ensure the Dragon Skins agent is installed
    pub fn ensure_agent_installed(&self) -> Result<(), String> {
        let agent_dir = self.get_dragon_skins_dir();
        let agent_path = agent_dir.join("dragon-skins-agent.jar");

        fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create agent directory: {}", e))?;

        let mut candidates: Vec<PathBuf> = vec![
            PathBuf::from("dragon-skins-agent/target/dragon-skins-agent.jar"),
            PathBuf::from("dragon-skins-agent/target/dragon-skins-agent-1.0.0.jar"),
            PathBuf::from("src-tauri/resources/dragon-skins-agent.jar"),
            PathBuf::from("resources/dragon-skins-agent.jar"),
        ];

        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(exe_dir) = current_exe.parent() {
                // Windows/Linux packaged apps usually place resources next to the executable.
                candidates.push(exe_dir.join("resources/dragon-skins-agent.jar"));
                candidates.push(exe_dir.join("resources").join("dragon-skins-agent.jar"));
                candidates.push(exe_dir.join("dragon-skins-agent.jar"));
                candidates.push(exe_dir.join("../resources/dragon-skins-agent.jar"));
                candidates.push(exe_dir.join("../resources").join("dragon-skins-agent.jar"));

                // macOS app bundle resource paths.
                candidates.push(exe_dir.join("../Resources/dragon-skins-agent.jar"));
                candidates.push(exe_dir.join("../Resources/resources/dragon-skins-agent.jar"));
                candidates
                    .push(exe_dir.join("../Resources/src-tauri/resources/dragon-skins-agent.jar"));
            }
        }

        for candidate in candidates {
            if !candidate.exists() {
                continue;
            }
            return Self::sync_agent_file(&candidate, &agent_path);
        }

        let project_dir = PathBuf::from("dragon-skins-agent");
        if project_dir.join("pom.xml").exists() {
            println!("[DragonSkins] Building JVM agent with Maven...");
            match std::process::Command::new("mvn")
                .args(["-q", "-DskipTests", "package"])
                .current_dir(&project_dir)
                .output()
            {
                Ok(output) if output.status.success() => {
                    let target_dir = project_dir.join("target");
                    let mut built_candidates: Vec<PathBuf> = Vec::new();
                    if let Ok(entries) = fs::read_dir(&target_dir) {
                        for entry in entries.filter_map(Result::ok) {
                            let path = entry.path();
                            if !path.is_file() {
                                continue;
                            }
                            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                                continue;
                            };
                            if !name.ends_with(".jar") || name.starts_with("original-") {
                                continue;
                            }
                            if name.contains("dragon-skins-agent") {
                                built_candidates.push(path);
                            }
                        }
                    }
                    built_candidates.sort();
                    if let Some(built_agent) = built_candidates.into_iter().next() {
                        return Self::sync_agent_file(&built_agent, &agent_path);
                    }
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("[DragonSkins] Maven build failed: {}", stderr.trim());
                }
                Err(error) => {
                    println!(
                        "[DragonSkins] Failed to invoke Maven for agent build: {}",
                        error
                    );
                }
            }
        }

        Err(
            "Agent JAR not found and auto-build failed (expected dragon-skins-agent project)."
                .to_string(),
        )
    }

    fn sync_agent_file(
        source: &std::path::Path,
        destination: &std::path::Path,
    ) -> Result<(), String> {
        let needs_update = if destination.exists() {
            !Self::files_are_identical(source, destination)?
        } else {
            true
        };

        if !needs_update {
            println!(
                "[DragonSkins] Agent already up to date: {}",
                destination.display()
            );
            return Ok(());
        }

        fs::copy(source, destination).map_err(|e| {
            format!(
                "Failed to copy agent JAR '{}' to '{}': {}",
                source.display(),
                destination.display(),
                e
            )
        })?;

        println!(
            "[DragonSkins] Agent installed/updated from '{}'",
            source.display()
        );
        Ok(())
    }

    fn files_are_identical(a: &std::path::Path, b: &std::path::Path) -> Result<bool, String> {
        let meta_a = fs::metadata(a)
            .map_err(|e| format!("Failed to read metadata for '{}': {}", a.display(), e))?;
        let meta_b = fs::metadata(b)
            .map_err(|e| format!("Failed to read metadata for '{}': {}", b.display(), e))?;

        if meta_a.len() != meta_b.len() {
            return Ok(false);
        }

        let content_a =
            fs::read(a).map_err(|e| format!("Failed to read file '{}': {}", a.display(), e))?;
        let content_b =
            fs::read(b).map_err(|e| format!("Failed to read file '{}': {}", b.display(), e))?;

        Ok(content_a == content_b)
    }

    /// Install Dragon Skins mod to a Fabric/Forge/Quilt instance
    pub async fn install_mod_to_instance_async(&self, instance_name: &str) -> Result<(), String> {
        let instance_dir = self.game_dir.join("instances").join(instance_name);
        let mods_dir = instance_dir.join("mods");

        // Check if this is a modded instance
        if !mods_dir.exists() {
            return Err("Not a modded instance".to_string());
        }

        // Determine Minecraft version and mod loader from instance
        let (mc_version, mod_loader) = self.get_instance_info(instance_name)?;
        let mod_filename = format!("dragon-skins-{}-{}.jar", mod_loader, mc_version);
        let dest_path = mods_dir.join(&mod_filename);

        // Check if mod exists and get its age
        let should_download = if dest_path.exists() {
            println!("[DragonSkins] Mod already exists, skipping download");
            false
        } else {
            println!("[DragonSkins] Mod not found, downloading...");
            true
        };

        if !should_download {
            println!("[DragonSkins] ✓ Using existing mod");
            return Ok(());
        }

        // Remove any existing Dragon Skins mod files
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.filter_map(Result::ok) {
                let filename = entry.file_name().to_string_lossy().to_lowercase();
                if filename.contains("dragon-skins") || filename.contains("dragonskins") {
                    println!("[DragonSkins] Removing old mod: {:?}", entry.file_name());
                    fs::remove_file(entry.path()).ok();
                }
            }
        }

        println!("[DragonSkins] Downloading latest mod from GitHub...");
        println!(
            "[DragonSkins] Instance: {} | MC: {} | Loader: {}",
            instance_name, mc_version, mod_loader
        );

        // Download the mod from GitHub
        let mod_data = self
            .download_mod_from_github(&mc_version, &mod_loader)
            .await?;

        // Save to mods directory
        fs::write(&dest_path, mod_data).map_err(|e| format!("Failed to save mod: {}", e))?;

        println!("[DragonSkins] ✓ Latest mod installed: {}", mod_filename);
        Ok(())
    }

    /// Install Dragon Skins mod to a Fabric instance (sync wrapper)
    pub fn install_mod_to_instance(&self, instance_name: &str) -> Result<(), String> {
        let instance_dir = self.game_dir.join("instances").join(instance_name);
        let mods_dir = instance_dir.join("mods");

        // Check if this is a modded instance
        if !mods_dir.exists() {
            return Err("Not a modded instance".to_string());
        }

        // Check if mod is already installed
        let mod_installed = fs::read_dir(&mods_dir)
            .ok()
            .and_then(|entries| {
                entries
                    .filter_map(Result::ok)
                    .any(|entry| entry.file_name().to_string_lossy().contains("dragon-skins"))
                    .then_some(())
            })
            .is_some();

        if mod_installed {
            println!("[DragonSkins] Mod already installed in {}", instance_name);
            return Ok(());
        }

        // Check if local build exists as fallback
        let local_mod =
            std::path::PathBuf::from("dragon-skins-mod/build/libs/dragon-skins-mod-1.0.0.jar");

        if local_mod.exists() {
            let dest_path = mods_dir.join("dragon-skins-universal.jar");
            fs::copy(&local_mod, &dest_path)
                .map_err(|e| format!("Failed to install mod: {}", e))?;
            println!("[DragonSkins] ✓ Mod installed from local build");
            Ok(())
        } else {
            Err("Mod will be downloaded on next launch".to_string())
        }
    }

    /// Get Minecraft version from instance
    fn get_instance_mc_version(&self, instance_name: &str) -> Result<String, String> {
        // Parse version from instance name (e.g., "1.20.1-fabric" -> "1.20.1")
        let version = instance_name
            .split('-')
            .next()
            .unwrap_or(instance_name)
            .to_string();
        Ok(version)
    }

    /// Get instance info (MC version and mod loader)
    fn get_instance_info(&self, instance_name: &str) -> Result<(String, String), String> {
        // Parse from instance name (e.g., "fabric-loader-0.18.4-1.21.11" -> ("1.21.11", "fabric"))

        // Determine mod loader
        let mod_loader = if instance_name.contains("forge") {
            "forge"
        } else if instance_name.contains("quilt") {
            "quilt"
        } else if instance_name.contains("fabric") {
            "fabric"
        } else {
            "fabric" // Default
        };

        // Extract MC version (last part after last dash, or the whole name if no dash)
        let mc_version = instance_name
            .split('-')
            .last()
            .unwrap_or(instance_name)
            .to_string();

        println!(
            "[DragonSkins] Parsed instance '{}' -> MC: {}, Loader: {}",
            instance_name, mc_version, mod_loader
        );

        Ok((mc_version, mod_loader.to_string()))
    }

    /// Download mod from GitHub releases
    pub async fn download_mod_from_github(
        &self,
        mc_version: &str,
        mod_loader: &str,
    ) -> Result<Vec<u8>, String> {
        // GitHub repository URL
        let repo = "dhhd67807-lgtm/dragon-skins-mod";

        // Determine which mod file to download based on version and loader
        let filename = if mod_loader == "forge" {
            format!("dragon-skins-forge-{}.jar", mc_version)
        } else if mod_loader == "quilt" {
            format!("dragon-skins-fabric-{}.jar", mc_version) // Quilt uses Fabric mods
        } else {
            format!("dragon-skins-fabric-{}.jar", mc_version)
        };

        // Try latest release first
        let url = format!(
            "https://github.com/{}/releases/latest/download/{}",
            repo, filename
        );

        println!("[DragonSkins] Downloading from: {}", url);

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to download mod: {}", e))?;

        if !response.status().is_success() {
            // Try universal version
            let universal_url = format!(
                "https://github.com/{}/releases/latest/download/dragon-skins-universal.jar",
                repo
            );
            let response = client
                .get(&universal_url)
                .send()
                .await
                .map_err(|e| format!("Failed to download universal mod: {}", e))?;

            if !response.status().is_success() {
                return Err("Mod not found on GitHub. Using local build.".to_string());
            }

            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Failed to read mod data: {}", e))?;

            return Ok(bytes.to_vec());
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read mod data: {}", e))?;

        Ok(bytes.to_vec())
    }
}
