use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftServer {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String, // vanilla, forge, fabric, paper, etc.
    pub port: u16,
    pub max_players: u16,
    pub ram_mb: u32,
    pub is_online: bool,
    pub is_public: bool,
    pub ngrok_url: Option<String>,
    pub server_dir: PathBuf,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProperties {
    pub motd: String,
    pub max_players: u16,
    pub gamemode: String,
    pub difficulty: String,
    pub pvp: bool,
    pub online_mode: bool,
    pub white_list: bool,
    pub spawn_protection: u16,
    pub view_distance: u16,
}

impl Default for ServerProperties {
    fn default() -> Self {
        Self {
            motd: "A Lapetus Minecraft Server".to_string(),
            max_players: 20,
            gamemode: "survival".to_string(),
            difficulty: "normal".to_string(),
            pvp: true,
            online_mode: true,
            white_list: false,
            spawn_protection: 16,
            view_distance: 10,
        }
    }
}

pub struct ServerManager {
    servers: Arc<Mutex<HashMap<String, MinecraftServer>>>,
    processes: Arc<Mutex<HashMap<String, Child>>>,
    servers_dir: PathBuf,
}

impl ServerManager {
    pub fn new(base_dir: PathBuf) -> Self {
        let servers_dir = base_dir.join("servers");
        fs::create_dir_all(&servers_dir).ok();
        
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
            servers_dir,
        }
    }

    pub fn create_server(
        &self,
        name: String,
        version: String,
        loader: String,
        port: u16,
        ram_mb: u32,
    ) -> Result<MinecraftServer, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let server_dir = self.servers_dir.join(&id);
        
        fs::create_dir_all(&server_dir)
            .map_err(|e| format!("Failed to create server directory: {}", e))?;

        let server = MinecraftServer {
            id: id.clone(),
            name,
            version,
            loader,
            port,
            max_players: 20,
            ram_mb,
            is_online: false,
            is_public: false,
            ngrok_url: None,
            server_dir: server_dir.clone(),
            created_at: chrono::Utc::now().timestamp(),
        };

        // Create server.properties
        self.write_server_properties(&server, &ServerProperties::default())?;
        
        // Accept EULA
        let eula_path = server_dir.join("eula.txt");
        fs::write(eula_path, "eula=true\n")
            .map_err(|e| format!("Failed to write EULA: {}", e))?;

        self.servers.lock().unwrap().insert(id.clone(), server.clone());
        self.save_servers()?;

        Ok(server)
    }

    pub fn get_servers(&self) -> Vec<MinecraftServer> {
        self.servers.lock().unwrap().values().cloned().collect()
    }

    pub fn get_server(&self, id: &str) -> Option<MinecraftServer> {
        self.servers.lock().unwrap().get(id).cloned()
    }

    pub fn delete_server(&self, id: &str) -> Result<(), String> {
        // Stop server if running
        self.stop_server(id)?;

        // Remove from memory
        let server = self.servers.lock().unwrap().remove(id)
            .ok_or("Server not found")?;

        // Delete server directory
        fs::remove_dir_all(&server.server_dir)
            .map_err(|e| format!("Failed to delete server directory: {}", e))?;

        self.save_servers()?;
        Ok(())
    }

    pub fn start_server(&self, id: &str, java_path: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().unwrap();
        let server = servers.get_mut(id).ok_or("Server not found")?;

        if server.is_online {
            return Err("Server is already running".to_string());
        }

        // Download server JAR if not exists
        let jar_path = server.server_dir.join("server.jar");
        if !jar_path.exists() {
            self.download_server_jar(&server.version, &server.loader, &jar_path)?;
        }

        // Build Java command with network optimizations
        let mut cmd = Command::new(java_path);
        cmd.current_dir(&server.server_dir)
            // Memory settings
            .arg(format!("-Xmx{}M", server.ram_mb))
            .arg(format!("-Xms{}M", server.ram_mb / 2))
            
            // Network optimizations for low ping
            .arg("-Dnetty.eventLoopThreads=8")
            .arg("-Dio.netty.allocator.type=pooled")
            .arg("-Dio.netty.recycler.maxCapacity=0")
            .arg("-Dio.netty.recycler.maxCapacity.default=0")
            
            // Server performance optimizations
            .arg("-XX:+UseG1GC")
            .arg("-XX:+ParallelRefProcEnabled")
            .arg("-XX:MaxGCPauseMillis=50")
            .arg("-XX:+UnlockExperimentalVMOptions")
            .arg("-XX:+DisableExplicitGC")
            .arg("-XX:G1NewSizePercent=30")
            .arg("-XX:G1MaxNewSizePercent=40")
            .arg("-XX:G1HeapRegionSize=8M")
            .arg("-XX:G1ReservePercent=20")
            .arg("-XX:G1HeapWastePercent=5")
            .arg("-XX:G1MixedGCCountTarget=4")
            .arg("-XX:InitiatingHeapOccupancyPercent=15")
            .arg("-XX:G1MixedGCLiveThresholdPercent=90")
            .arg("-XX:G1RSetUpdatingPauseTimePercent=5")
            .arg("-XX:SurvivorRatio=32")
            .arg("-XX:+PerfDisableSharedMem")
            .arg("-XX:MaxTenuringThreshold=1")
            
            .arg("-jar")
            .arg("server.jar")
            .arg("nogui")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Hide console window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd.spawn()
            .map_err(|e| format!("Failed to start server: {}", e))?;

        server.is_online = true;
        self.processes.lock().unwrap().insert(id.to_string(), child);
        self.save_servers()?;

        Ok(())
    }

    pub fn stop_server(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().unwrap();
        let server = servers.get_mut(id).ok_or("Server not found")?;

        if !server.is_online {
            return Ok(());
        }

        let mut processes = self.processes.lock().unwrap();
        if let Some(mut child) = processes.remove(id) {
            child.kill().map_err(|e| format!("Failed to stop server: {}", e))?;
        }

        server.is_online = false;
        self.save_servers()?;

        Ok(())
    }

    pub fn execute_command(&self, id: &str, command: String) -> Result<(), String> {
        let processes = self.processes.lock().unwrap();
        let child = processes.get(id).ok_or("Server not running")?;

        // Send command to server stdin
        // Note: This requires keeping stdin handle, which we'll implement later
        Ok(())
    }

    fn write_server_properties(
        &self,
        server: &MinecraftServer,
        props: &ServerProperties,
    ) -> Result<(), String> {
        let props_path = server.server_dir.join("server.properties");
        let content = format!(
            "server-ip=0.0.0.0\n\
             server-port={}\n\
             max-players={}\n\
             motd={}\n\
             gamemode={}\n\
             difficulty={}\n\
             pvp={}\n\
             online-mode={}\n\
             white-list={}\n\
             spawn-protection={}\n\
             view-distance={}\n\
             simulation-distance=6\n\
             network-compression-threshold=256\n\
             max-tick-time=60000\n\
             use-native-transport=true\n\
             entity-broadcast-range-percentage=100\n",
            server.port,
            props.max_players,
            props.motd,
            props.gamemode,
            props.difficulty,
            props.pvp,
            props.online_mode,
            props.white_list,
            props.spawn_protection,
            props.view_distance,
        );

        fs::write(props_path, content)
            .map_err(|e| format!("Failed to write server.properties: {}", e))?;

        Ok(())
    }

    fn download_server_jar(
        &self,
        version: &str,
        loader: &str,
        jar_path: &PathBuf,
    ) -> Result<(), String> {
        // Download server JAR from official sources
        let url = match loader {
            "vanilla" => format!(
                "https://piston-data.mojang.com/v1/objects/{}/server.jar",
                self.get_version_manifest_url(version)?
            ),
            "paper" => format!(
                "https://api.papermc.io/v2/projects/paper/versions/{}/builds/latest/downloads/paper-{}-latest.jar",
                version, version
            ),
            _ => return Err(format!("Unsupported loader: {}", loader)),
        };

        let response = reqwest::blocking::get(&url)
            .map_err(|e| format!("Failed to download server JAR: {}", e))?;

        let bytes = response.bytes()
            .map_err(|e| format!("Failed to read server JAR: {}", e))?;

        fs::write(jar_path, bytes)
            .map_err(|e| format!("Failed to save server JAR: {}", e))?;

        Ok(())
    }

    fn get_version_manifest_url(&self, version: &str) -> Result<String, String> {
        // Fetch version manifest from Mojang
        let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let response = reqwest::blocking::get(manifest_url)
            .map_err(|e| format!("Failed to fetch version manifest: {}", e))?;

        let manifest: serde_json::Value = response.json()
            .map_err(|e| format!("Failed to parse version manifest: {}", e))?;

        let versions = manifest["versions"].as_array()
            .ok_or("Invalid manifest format")?;

        for v in versions {
            if v["id"].as_str() == Some(version) {
                let version_url = v["url"].as_str()
                    .ok_or("Version URL not found")?;

                let version_response = reqwest::blocking::get(version_url)
                    .map_err(|e| format!("Failed to fetch version data: {}", e))?;

                let version_data: serde_json::Value = version_response.json()
                    .map_err(|e| format!("Failed to parse version data: {}", e))?;

                return Ok(version_data["downloads"]["server"]["url"]
                    .as_str()
                    .ok_or("Server download URL not found")?
                    .to_string());
            }
        }

        Err(format!("Version {} not found", version))
    }

    fn save_servers(&self) -> Result<(), String> {
        let servers_file = self.servers_dir.join("servers.json");
        let servers = self.servers.lock().unwrap();
        let json = serde_json::to_string_pretty(&*servers)
            .map_err(|e| format!("Failed to serialize servers: {}", e))?;

        fs::write(servers_file, json)
            .map_err(|e| format!("Failed to save servers: {}", e))?;

        Ok(())
    }

    pub fn load_servers(&self) -> Result<(), String> {
        let servers_file = self.servers_dir.join("servers.json");
        if !servers_file.exists() {
            return Ok(());
        }

        let json = fs::read_to_string(servers_file)
            .map_err(|e| format!("Failed to read servers file: {}", e))?;

        let loaded: HashMap<String, MinecraftServer> = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse servers file: {}", e))?;

        *self.servers.lock().unwrap() = loaded;
        Ok(())
    }
}
