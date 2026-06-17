use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftServer {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    pub port: u16,
    pub max_players: u16,
    pub ram_mb: u32,
    pub is_online: bool,
    pub is_public: bool,
    pub ngrok_url: Option<String>,
    pub server_dir: String,
    pub created_at: i64,
}

pub struct ServerManager {
    servers: Arc<Mutex<HashMap<String, MinecraftServer>>>,
    processes: Arc<Mutex<HashMap<String, Child>>>,
    tunnels: Arc<Mutex<HashMap<String, Child>>>, // Cloudflare tunnel processes
    logs: Arc<Mutex<HashMap<String, Vec<String>>>>,
    servers_dir: PathBuf,
}

impl ServerManager {
    pub fn new(base_dir: PathBuf) -> Self {
        let servers_dir = base_dir.join("servers");
        fs::create_dir_all(&servers_dir).ok();

        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
            tunnels: Arc::new(Mutex::new(HashMap::new())),
            logs: Arc::new(Mutex::new(HashMap::new())),
            servers_dir,
        }
    }

    pub async fn get_server_logs(&self, id: &str) -> Result<Vec<String>, String> {
        // First try to get logs from memory buffer
        let logs = self.logs.lock().await;
        if let Some(server_logs) = logs.get(id) {
            if !server_logs.is_empty() {
                return Ok(server_logs.clone());
            }
        }
        drop(logs);

        // Fall back to reading from log file
        let (server_dir, is_online) = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            (PathBuf::from(&server.server_dir), server.is_online)
        };

        let log_file = server_dir.join("logs").join("latest.log");

        if !log_file.exists() {
            if is_online {
                return Ok(vec![
                    "[Lapetus]: Server is starting...".to_string(),
                    "[Lapetus]: Waiting for logs to be generated...".to_string(),
                ]);
            } else {
                return Ok(vec![
                    "[Lapetus]: No logs yet. Server hasn't started.".to_string()
                ]);
            }
        }

        match fs::read_to_string(&log_file) {
            Ok(content) => {
                if content.is_empty() {
                    return Ok(vec![
                        "[Lapetus]: Log file is empty. Server is starting...".to_string()
                    ]);
                }

                let lines: Vec<String> = content
                    .lines()
                    .rev()
                    .take(200) // Increased from 100 to show more logs
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect();
                Ok(lines)
            }
            Err(e) => {
                if is_online {
                    Ok(vec![format!(
                        "[Lapetus]: Server is running but logs are not accessible yet: {}",
                        e
                    )])
                } else {
                    Err(format!("Failed to read logs: {}", e))
                }
            }
        }
    }

    pub async fn create_server(
        &self,
        name: String,
        version: String,
        loader: String,
        port: u16,
        ram_mb: u32,
    ) -> Result<MinecraftServer, String> {
        let id = uuid::Uuid::new_v4().to_string();

        // Use short ID for directory name to avoid macOS path length issues
        // Full UUID: e957f1a4-a84a-49bd-8ff7-470bd08d6272 (36 chars)
        // Short ID: e957f1a4 (8 chars)
        let short_id = id.split('-').next().unwrap_or(&id).to_string();
        let server_dir = self.servers_dir.join(&short_id);

        // Create server directory with proper permissions
        fs::create_dir_all(&server_dir)
            .map_err(|e| format!("Failed to create server directory: {}", e))?;

        // Verify directory was created and is writable
        if !server_dir.exists() {
            return Err("Server directory was not created".to_string());
        }

        println!("[Server] Created server directory: {:?}", server_dir);
        println!("[Server] Short ID: {} (from full ID: {})", short_id, id);

        // Find an available port if the requested one is in use
        let available_port = self.find_available_port(port).await;

        // Don't create EULA file - let the dialog handle it
        // This way users see the EULA dialog on first start

        let server = MinecraftServer {
            id: id.clone(),
            name,
            version,
            loader,
            port: available_port,
            max_players: 20,
            ram_mb,
            is_online: false,
            is_public: false,
            ngrok_url: None,
            server_dir: server_dir.to_string_lossy().to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };

        self.servers.lock().await.insert(id.clone(), server.clone());
        self.save_servers().await?;

        Ok(server)
    }

    async fn find_available_port(&self, start_port: u16) -> u16 {
        let servers = self.servers.lock().await;
        let used_ports: Vec<u16> = servers.values().map(|s| s.port).collect();

        let mut port = start_port;
        while used_ports.contains(&port) || !self.is_port_available(port) {
            port = if port == u16::MAX {
                25565 // Wrap around safely before overflow
            } else {
                port + 1
            };
        }
        port
    }

    fn is_port_available(&self, port: u16) -> bool {
        use std::net::TcpListener;
        TcpListener::bind(("127.0.0.1", port)).is_ok()
    }

    pub async fn get_servers(&self) -> Vec<MinecraftServer> {
        self.servers.lock().await.values().cloned().collect()
    }

    pub async fn get_server(&self, id: &str) -> Option<MinecraftServer> {
        self.servers.lock().await.get(id).cloned()
    }

    pub async fn delete_server(&self, id: &str) -> Result<(), String> {
        println!("[Server] ========================================");
        println!("[Server] DELETE REQUEST for server ID: {}", id);
        println!("[Server] ========================================");

        // Stop server first and wait for it to fully stop
        let _ = self.stop_server(id).await; // Ignore errors if already stopped

        // Wait for process to fully terminate and release file handles
        // Java/JVM needs more time to clean up
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        // Double-check: forcefully remove from processes map
        {
            let mut processes = self.processes.lock().await;
            if let Some(mut child) = processes.remove(id) {
                println!("[Server] Force killing remaining process for {}", id);
                let _ = child.kill();
                // Wait for process to exit completely
                let _ = child.wait();
            }
        }

        // Wait a bit more after force kill
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        // Get server info before removing
        let server = {
            let servers = self.servers.lock().await;
            servers.get(id).cloned()
        };

        let server = match server {
            Some(s) => s,
            None => {
                println!("[Server] ERROR: Server {} not found in memory!", id);
                return Err("Server not found".to_string());
            }
        };

        println!("[Server] Found server: {}", server.name);
        println!("[Server] Server directory: {}", server.server_dir);

        // Remove from memory
        {
            let mut servers = self.servers.lock().await;
            servers.remove(id);
            println!(
                "[Server] Removed server {} from memory. Remaining servers: {}",
                id,
                servers.len()
            );
        }

        // Clear logs
        self.logs.lock().await.remove(id);

        // Save immediately after removing from memory
        println!("[Server] Saving servers.json...");
        self.save_servers().await?;
        println!("[Server] servers.json saved successfully");

        // Try to delete directory
        let server_path = PathBuf::from(&server.server_dir);
        if server_path.exists() {
            println!(
                "[Server] Directory exists, attempting to delete: {:?}",
                server_path
            );

            // Try multiple times with delays in case files are still locked
            let mut attempts = 0;
            let max_attempts = 8;

            loop {
                // Try to make files writable before deletion (helps on some systems)
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(entries) = std::fs::read_dir(&server_path) {
                        for entry in entries.flatten() {
                            if let Ok(metadata) = entry.metadata() {
                                let mut perms = metadata.permissions();
                                perms.set_mode(0o755);
                                let _ = std::fs::set_permissions(entry.path(), perms);
                            }
                        }
                    }
                }

                match fs::remove_dir_all(&server_path) {
                    Ok(_) => {
                        println!("[Server] ✓ Successfully deleted server directory");
                        break;
                    }
                    Err(e) if attempts < max_attempts => {
                        attempts += 1;
                        println!(
                            "[Server] Delete attempt {} failed: {}. Retrying in 1.5s...",
                            attempts, e
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                    }
                    Err(e) => {
                        println!(
                            "[Server] ✗ Failed to delete directory after {} attempts: {}",
                            max_attempts, e
                        );
                        println!(
                            "[Server] Server removed from config but directory remains at: {}",
                            server.server_dir
                        );
                        return Err(format!("Server removed from launcher but directory cleanup failed: {}. You may need to manually delete: {}", e, server.server_dir));
                    }
                }
            }
        } else {
            println!(
                "[Server] Directory does not exist (already deleted?): {:?}",
                server_path
            );
        }

        println!("[Server] ========================================");
        println!("[Server] ✓ Server {} deleted successfully", id);
        println!("[Server] ========================================");
        Ok(())
    }

    pub async fn start_server(&self, id: &str, java_path: &str) -> Result<(), String> {
        println!("[Server] Starting server {}...", id);

        // Check if already running
        {
            let mut servers = self.servers.lock().await;
            let server = servers.get_mut(id).ok_or("Server not found")?;

            // Always mark as offline at start
            server.is_online = false;

            // Check if process actually exists
            let mut processes = self.processes.lock().await;
            if processes.contains_key(id) {
                // Kill old process
                if let Some(mut child) = processes.remove(id) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }

        // Get server info
        let (server_dir, port, max_players, ram_mb, version, loader) = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;

            (
                PathBuf::from(&server.server_dir),
                server.port,
                server.max_players,
                server.ram_mb,
                server.version.clone(),
                server.loader.clone(),
            )
        };

        let jar_path = server_dir.join("server.jar");

        // Download JAR if needed (async)
        if !jar_path.exists() {
            println!("[Server] Downloading server JAR...");
            self.download_server_jar(&version, &loader, &jar_path)
                .await?;
        }

        // Create server.properties
        let props_path = server_dir.join("server.properties");
        if !props_path.exists() {
            let props_content = format!(
                "server-ip=0.0.0.0\nserver-port={}\nmax-players={}\nmotd=A Lapetus Minecraft Server\ngamemode=survival\ndifficulty=normal\npvp=true\nonline-mode=false\nwhite-list=false\nspawn-protection=16\nview-distance=10\n",
                port, max_players
            );
            fs::write(&props_path, props_content)
                .map_err(|e| format!("Failed to write server.properties: {}", e))?;
        }

        // Start server process with captured output
        println!("[Server] Spawning Java process...");
        println!("[Server] Java path: {}", java_path);
        println!("[Server] Working directory: {:?}", server_dir);
        println!(
            "[Server] Command: {} -Xmx{}M -Xms{}M -jar server.jar nogui",
            java_path,
            ram_mb,
            ram_mb / 2
        );

        let mut cmd = Command::new(java_path);
        cmd.current_dir(&server_dir)
            .arg(format!("-Xmx{}M", ram_mb))
            .arg(format!("-Xms{}M", ram_mb / 2));

        // Add macOS-specific arguments to prevent dispatch.c crash
        #[cfg(target_os = "macos")]
        {
            cmd.arg("-Djava.awt.headless=true")
                .arg("-Dapple.awt.UIElement=true")
                .env("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES");
        }

        cmd.arg("-jar")
            .arg("server.jar")
            .arg("nogui")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Hide console window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Failed to start server: {}. Make sure Java is installed and accessible.",
                e
            )
        })?;

        let pid = child.id();
        println!("[Server] Server started with PID {}", pid);

        // Capture stdout and stderr
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Initialize log buffer
        {
            let mut logs = self.logs.lock().await;
            logs.insert(
                id.to_string(),
                vec![
                    format!("[Lapetus] Server starting with PID {}...", pid),
                    format!(
                        "[Lapetus] Java: {} -Xmx{}M -Xms{}M -jar server.jar nogui",
                        java_path,
                        ram_mb,
                        ram_mb / 2
                    ),
                ],
            );
        }

        // Spawn task to read stdout
        if let Some(stdout) = stdout {
            let id_clone = id.to_string();
            let logs_clone = self.logs.clone();
            let servers_clone = self.servers.clone();
            let processes_clone = self.processes.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[Server {}] {}", id_clone, line); // Debug output

                        let mut logs = logs_clone.lock().await;
                        if let Some(server_logs) = logs.get_mut(&id_clone) {
                            server_logs.push(line.clone());
                            // Keep only last 500 lines
                            if server_logs.len() > 500 {
                                server_logs.drain(0..100);
                            }
                        }

                        // Check if server is fully started - be more flexible with the check
                        if (line.contains("Done") && line.contains("For help"))
                            || (line.contains("Done") && line.contains("help"))
                        {
                            println!("[Server {}] Server is now ONLINE", id_clone);
                            let mut servers = servers_clone.lock().await;
                            if let Some(server) = servers.get_mut(&id_clone) {
                                server.is_online = true;
                            }
                        }

                        // Check for EULA error
                        if line.contains("eula.txt")
                            || (line.contains("EULA") && line.contains("agree"))
                            || line.contains("You need to agree to the EULA")
                        {
                            println!("[Server {}] EULA not accepted - server will stop", id_clone);
                        }

                        // Check for port binding error
                        if line.contains("FAILED TO BIND TO PORT")
                            || line.contains("Address already in use")
                            || (line.contains("BindException") && line.contains("already in use"))
                        {
                            println!(
                                "[Server {}] Port binding failed - killing process",
                                id_clone
                            );

                            // Add error message to logs
                            let mut logs = logs_clone.lock().await;
                            if let Some(server_logs) = logs.get_mut(&id_clone) {
                                server_logs
                                    .push("[Lapetus] ERROR: Port is already in use!".to_string());
                                server_logs.push(
                                    "[Lapetus] Please delete this server and create a new one."
                                        .to_string(),
                                );
                                server_logs.push("[Lapetus] The new server will automatically use an available port.".to_string());
                            }

                            // Kill the process
                            let mut processes = processes_clone.lock().await;
                            if let Some(mut child) = processes.remove(&id_clone) {
                                let _ = child.kill();
                            }
                        }
                    }
                }

                println!("[Server {}] Process ended - marking as OFFLINE", id_clone);
                // Server process ended - mark as offline
                let mut servers = servers_clone.lock().await;
                if let Some(server) = servers.get_mut(&id_clone) {
                    server.is_online = false;
                }
            });
        }

        // Spawn task to read stderr
        if let Some(stderr) = stderr {
            let id_clone = id.to_string();
            let logs_clone = self.logs.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[Server {} STDERR] {}", id_clone, line); // Debug output
                        let mut logs = logs_clone.lock().await;
                        if let Some(server_logs) = logs.get_mut(&id_clone) {
                            server_logs.push(format!("[STDERR] {}", line));
                            if server_logs.len() > 500 {
                                server_logs.drain(0..100);
                            }
                        }
                    }
                }
                println!("[Server {} STDERR] Stream ended", id_clone);
            });
        }

        // Store process and update status to starting (not online yet)
        self.processes.lock().await.insert(id.to_string(), child);

        // Spawn a task to monitor the process and detect when it exits
        let id_clone = id.to_string();
        let processes_clone = self.processes.clone();
        let servers_clone = self.servers.clone();
        let logs_clone = self.logs.clone();
        tokio::spawn(async move {
            // Wait a bit for the process to start
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                let mut processes = processes_clone.lock().await;
                if let Some(child) = processes.get_mut(&id_clone) {
                    // Check if process has exited
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            println!(
                                "[Server {}] Process exited with status: {:?}",
                                id_clone, status
                            );

                            // Add exit message to logs
                            let mut logs = logs_clone.lock().await;
                            if let Some(server_logs) = logs.get_mut(&id_clone) {
                                server_logs.push(format!(
                                    "[Lapetus] Server process exited with status: {:?}",
                                    status
                                ));
                                if !status.success() {
                                    server_logs.push("[Lapetus] Server crashed or failed to start. Check logs above for errors.".to_string());
                                }
                            }

                            // Mark as offline
                            let mut servers = servers_clone.lock().await;
                            if let Some(server) = servers.get_mut(&id_clone) {
                                server.is_online = false;
                            }

                            // Remove from processes
                            processes.remove(&id_clone);
                            break;
                        }
                        Ok(None) => {
                            // Process still running
                        }
                        Err(e) => {
                            println!("[Server {}] Error checking process status: {}", id_clone, e);
                            break;
                        }
                    }
                } else {
                    // Process was removed (stopped manually)
                    break;
                }
                drop(processes);
            }
        });

        {
            let mut servers = self.servers.lock().await;
            if let Some(server) = servers.get_mut(id) {
                server.is_online = false; // Will be set to true when "Done" message appears
            }
        }

        self.save_servers().await?;

        Ok(())
    }

    async fn download_server_jar(
        &self,
        version: &str,
        loader: &str,
        jar_path: &PathBuf,
    ) -> Result<(), String> {
        println!(
            "[Server] Downloading {} server for version {}...",
            loader, version
        );

        let download_url = match loader {
            "vanilla" => self.get_vanilla_server_url(version).await?,
            "paper" => format!(
                "https://api.papermc.io/v2/projects/paper/versions/{}/builds/latest/downloads/paper-{}-latest.jar",
                version, version
            ),
            _ => return Err(format!("Unsupported loader: {}. Use vanilla or paper.", loader)),
        };

        println!("[Server] Downloading from: {}", download_url);

        let response = reqwest::get(&download_url)
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        fs::write(jar_path, bytes).map_err(|e| format!("Failed to save JAR: {}", e))?;

        println!("[Server] Download complete!");
        Ok(())
    }

    async fn get_vanilla_server_url(&self, version: &str) -> Result<String, String> {
        let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let response = reqwest::get(manifest_url)
            .await
            .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

        let manifest: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse manifest: {}", e))?;

        let versions = manifest["versions"]
            .as_array()
            .ok_or("Invalid manifest format")?;

        for v in versions {
            if v["id"].as_str() == Some(version) {
                let version_url = v["url"].as_str().ok_or("Version URL not found")?;

                let version_response = reqwest::get(version_url)
                    .await
                    .map_err(|e| format!("Failed to fetch version data: {}", e))?;

                let version_data: serde_json::Value = version_response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse version data: {}", e))?;

                return Ok(version_data["downloads"]["server"]["url"]
                    .as_str()
                    .ok_or("Server URL not found")?
                    .to_string());
            }
        }

        Err(format!("Version {} not found", version))
    }

    pub async fn stop_server(&self, id: &str) -> Result<(), String> {
        println!("[Server] Stopping server {}...", id);

        // Mark as offline immediately
        {
            let mut servers = self.servers.lock().await;
            if let Some(server) = servers.get_mut(id) {
                server.is_online = false;
            }
        }

        // Kill process and wait for it to fully exit
        {
            let mut processes = self.processes.lock().await;
            if let Some(mut child) = processes.remove(id) {
                println!("[Server] Sending kill signal to server {} process", id);
                let _ = child.kill();

                // Wait for the process to actually exit - this is important!
                // Use a timeout to avoid hanging forever
                let wait_result = tokio::task::spawn_blocking(move || child.wait()).await;

                match wait_result {
                    Ok(Ok(status)) => println!(
                        "[Server] Server {} process exited with status: {:?}",
                        id, status
                    ),
                    Ok(Err(e)) => println!("[Server] Server {} process wait error: {}", id, e),
                    Err(e) => println!("[Server] Server {} spawn_blocking error: {}", id, e),
                }
            } else {
                println!("[Server] Server {} had no running process", id);
            }
        }

        // Wait a moment for file handles to be released
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Add stop message to logs
        {
            let mut logs = self.logs.lock().await;
            if let Some(server_logs) = logs.get_mut(id) {
                server_logs.push("[Lapetus] Server stopped by user".to_string());
            }
        }

        self.save_servers().await?;
        println!("[Server] Server {} stopped successfully", id);
        Ok(())
    }

    async fn save_servers(&self) -> Result<(), String> {
        let servers_file = self.servers_dir.join("servers.json");
        let servers = self.servers.lock().await;
        let json = serde_json::to_string_pretty(&*servers)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        fs::write(servers_file, json).map_err(|e| format!("Failed to save: {}", e))?;
        Ok(())
    }

    pub async fn load_servers(&self) -> Result<(), String> {
        let servers_file = self.servers_dir.join("servers.json");
        if !servers_file.exists() {
            return Ok(());
        }
        let json =
            fs::read_to_string(servers_file).map_err(|e| format!("Failed to read: {}", e))?;
        let loaded: HashMap<String, MinecraftServer> =
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse: {}", e))?;
        *self.servers.lock().await = loaded;
        Ok(())
    }

    pub async fn list_server_files(&self, id: &str) -> Result<Vec<ServerFile>, String> {
        let server_dir = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            PathBuf::from(&server.server_dir)
        };

        let mut files = Vec::new();

        if let Ok(entries) = fs::read_dir(&server_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let is_dir = metadata.is_dir();
                    let size = if is_dir { 0 } else { metadata.len() };

                    files.push(ServerFile {
                        name,
                        is_directory: is_dir,
                        size,
                    });
                }
            }
        }

        // Sort: directories first, then by name
        files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        });

        Ok(files)
    }

    pub async fn accept_eula(&self, id: &str) -> Result<(), String> {
        let server_dir = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            PathBuf::from(&server.server_dir)
        };

        let eula_path = server_dir.join("eula.txt");
        let eula_content = "# By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\n# Generated by Lapetus Launcher\neula=true\n";

        fs::write(&eula_path, eula_content).map_err(|e| format!("Failed to write EULA: {}", e))?;

        println!(
            "[Server] EULA accepted for server {} - file written to {:?}",
            id, eula_path
        );

        // Verify file was written
        if !eula_path.exists() {
            return Err("EULA file was not created successfully".to_string());
        }

        Ok(())
    }

    pub async fn check_eula(&self, id: &str) -> Result<bool, String> {
        let server_dir = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            PathBuf::from(&server.server_dir)
        };

        let eula_path = server_dir.join("eula.txt");

        if !eula_path.exists() {
            return Ok(false);
        }

        // Check if eula=true in the file
        match fs::read_to_string(&eula_path) {
            Ok(content) => {
                let accepted = content.lines().any(|line| line.trim() == "eula=true");
                Ok(accepted)
            }
            Err(_) => Ok(false),
        }
    }

    pub async fn get_server_stats(&self, id: &str) -> Result<ServerStats, String> {
        let (server_dir, is_online) = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            (PathBuf::from(&server.server_dir), server.is_online)
        };

        // Get disk usage
        let disk_usage = self.get_directory_size(&server_dir).unwrap_or(0);

        // Get CPU and memory usage if server is running
        let (cpu_usage, memory_usage) = if is_online {
            let processes = self.processes.lock().await;
            if let Some(child) = processes.get(id) {
                // Try to get process stats
                let pid = child.id();
                (self.get_process_cpu(pid), self.get_process_memory(pid))
            } else {
                (0.0, 0)
            }
        } else {
            (0.0, 0)
        };

        Ok(ServerStats {
            cpu_usage,
            memory_usage_mb: memory_usage / 1024 / 1024, // Convert to MB
            disk_usage_mb: disk_usage / 1024 / 1024,     // Convert to MB
            is_online,
        })
    }

    fn get_directory_size(&self, path: &PathBuf) -> Result<u64, std::io::Error> {
        let mut total_size = 0u64;

        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let metadata = entry.metadata()?;

                if metadata.is_dir() {
                    total_size += self.get_directory_size(&entry.path())?;
                } else {
                    total_size += metadata.len();
                }
            }
        }

        Ok(total_size)
    }

    #[cfg(target_os = "macos")]
    fn get_process_cpu(&self, pid: u32) -> f32 {
        use std::process::Command;

        let output = Command::new("ps")
            .args(&["-p", &pid.to_string(), "-o", "%cpu"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().nth(1) {
                return line.trim().parse().unwrap_or(0.0);
            }
        }
        0.0
    }

    #[cfg(not(target_os = "macos"))]
    fn get_process_cpu(&self, _pid: u32) -> f32 {
        0.0 // Not implemented for other platforms yet
    }

    #[cfg(target_os = "macos")]
    fn get_process_memory(&self, pid: u32) -> u64 {
        use std::process::Command;

        let output = Command::new("ps")
            .args(&["-p", &pid.to_string(), "-o", "rss"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().nth(1) {
                // RSS is in KB, convert to bytes
                return line.trim().parse::<u64>().unwrap_or(0) * 1024;
            }
        }
        0
    }

    #[cfg(not(target_os = "macos"))]
    fn get_process_memory(&self, _pid: u32) -> u64 {
        0 // Not implemented for other platforms yet
    }

    pub async fn start_tunnel(&self, id: &str) -> Result<String, String> {
        println!("[Tunnel] Starting tunnel for server {}...", id);

        // First, stop any existing tunnel for this server
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(mut child) = tunnels.remove(id) {
                println!("[Tunnel] Stopping existing tunnel process...");
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        // Get server info
        let (port, server_dir) = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            (server.port, server.server_dir.clone())
        };

        // IMPORTANT: Ensure server.properties has server-ip=0.0.0.0 for external access
        let props_path = std::path::PathBuf::from(&server_dir).join("server.properties");
        if props_path.exists() {
            println!("[Tunnel] Checking server.properties for server-ip setting...");

            // Read existing properties
            if let Ok(content) = std::fs::read_to_string(&props_path) {
                // Check if server-ip is set
                if !content.contains("server-ip=") {
                    println!("[Tunnel] Adding server-ip=0.0.0.0 to server.properties for external access");
                    let new_content = format!("server-ip=0.0.0.0\n{}", content);
                    std::fs::write(&props_path, new_content)
                        .map_err(|e| format!("Failed to update server.properties: {}", e))?;
                } else if content.contains("server-ip=127.0.0.1")
                    || content.contains("server-ip=localhost")
                {
                    println!("[Tunnel] Updating server-ip to 0.0.0.0 for external access");
                    let new_content = content
                        .replace("server-ip=127.0.0.1", "server-ip=0.0.0.0")
                        .replace("server-ip=localhost", "server-ip=0.0.0.0");
                    std::fs::write(&props_path, new_content)
                        .map_err(|e| format!("Failed to update server.properties: {}", e))?;
                } else {
                    println!("[Tunnel] server-ip already configured correctly");
                }
            }
        }

        // Use bore - simple, open-source TCP tunnel
        let bore_path = self.find_or_download_bore().await?;
        println!("[Tunnel] Using bore at: {}", bore_path);

        // Verify bore binary exists and is executable
        if !std::path::Path::new(&bore_path).exists() {
            return Err(format!("Bore binary not found at: {}", bore_path));
        }

        // Generate a truly random remote port to avoid conflicts
        // Range: 10000-60000 (safe range that's usually available)
        // Use timestamp + process ID + random for better uniqueness on Windows
        let remote_port = {
            use rand::Rng;
            use std::time::{SystemTime, UNIX_EPOCH};

            let mut rng = rand::thread_rng();
            let base_random = rng.gen_range(10000..60000);

            // Add timestamp entropy for Windows
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u32;

            // Combine timestamp and random for better uniqueness
            let combined = (base_random as u64 + timestamp as u64) % 50000 + 10000;
            combined as u16
        };

        println!("[Tunnel] Requesting random remote port: {}", remote_port);

        // Start bore tunnel with specific remote port: bore local <LOCAL_PORT> --to bore.pub --port <REMOTE_PORT>
        let mut cmd = Command::new(&bore_path);
        cmd.args(&[
            "local",
            &port.to_string(),
            "--to",
            "bore.pub",
            "--port",
            &remote_port.to_string(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

        // Windows-specific: Hide console window and set proper working directory
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);

            // Set working directory to avoid path issues
            if let Some(parent) = std::path::Path::new(&bore_path).parent() {
                cmd.current_dir(parent);
            }
        }

        println!(
            "[Tunnel] Spawning bore process with args: local {} --to bore.pub --port {}",
            port, remote_port
        );

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Failed to start tunnel ({}): {}. Path: {}",
                if cfg!(target_os = "windows") {
                    "Windows"
                } else {
                    "Unix"
                },
                e,
                bore_path
            )
        })?;

        println!(
            "[Tunnel] Bore process started (PID: {:?}), waiting for address...",
            child.id()
        );

        // Capture both stdout and stderr to get the tunnel address
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let id_clone = id.to_string();
        let servers_clone = self.servers.clone();

        // Monitor stdout
        if let Some(stdout) = stdout {
            let id_clone2 = id_clone.clone();
            let servers_clone2 = servers_clone.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[Tunnel {} STDOUT] {}", id_clone2, line);

                        if let Some(address) = extract_bore_address(&line) {
                            println!(
                                "[Tunnel {}] ✓ Found address in stdout: {}",
                                id_clone2, address
                            );

                            let mut servers = servers_clone2.lock().await;
                            if let Some(server) = servers.get_mut(&id_clone2) {
                                server.ngrok_url = Some(address.clone());
                                server.is_public = true;
                            }
                        }
                    }
                }
            });
        }

        // Monitor stderr (bore outputs to stderr on some platforms)
        if let Some(stderr) = stderr {
            let servers_clone3 = servers_clone.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[Tunnel {} STDERR] {}", id_clone, line);

                        if let Some(address) = extract_bore_address(&line) {
                            println!(
                                "[Tunnel {}] ✓ Found address in stderr: {}",
                                id_clone, address
                            );

                            let mut servers = servers_clone3.lock().await;
                            if let Some(server) = servers.get_mut(&id_clone) {
                                server.ngrok_url = Some(address.clone());
                                server.is_public = true;
                            }
                        }
                    }
                }
            });
        }

        // Store tunnel process
        self.tunnels.lock().await.insert(id.to_string(), child);

        // Wait for the tunnel to establish and address to be captured
        // Windows may need more time for the process to start
        let wait_time = if cfg!(target_os = "windows") { 8 } else { 5 };
        println!(
            "[Tunnel] Waiting {} seconds for tunnel address...",
            wait_time
        );
        tokio::time::sleep(tokio::time::Duration::from_secs(wait_time)).await;

        // Get the tunnel address
        let address = {
            let servers = self.servers.lock().await;
            let server = servers.get(id).ok_or("Server not found")?;
            server.ngrok_url.clone().unwrap_or_else(|| {
                println!("[Tunnel] WARNING: No address found yet, tunnel may still be starting");
                format!("bore.pub:{}", remote_port)
            })
        };

        println!("[Tunnel] Returning address: {}", address);

        self.save_servers().await?;

        Ok(address)
    }

    pub async fn stop_tunnel(&self, id: &str) -> Result<(), String> {
        println!("[Tunnel] Stopping tunnel for server {}...", id);

        // Kill tunnel process
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(mut child) = tunnels.remove(id) {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        // Update server
        {
            let mut servers = self.servers.lock().await;
            if let Some(server) = servers.get_mut(id) {
                server.ngrok_url = None;
                server.is_public = false;
            }
        }

        self.save_servers().await?;

        Ok(())
    }

    async fn find_or_download_bore(&self) -> Result<String, String> {
        // First check if bore is bundled with the app
        let bundled_path = self.get_bundled_bore_path();
        if bundled_path.exists() {
            println!("[Tunnel] Using bundled bore at: {:?}", bundled_path);
            return Ok(bundled_path.to_string_lossy().to_string());
        }

        // Try common system locations
        let paths = vec!["bore", "/usr/local/bin/bore", "/opt/homebrew/bin/bore"];

        for path in paths {
            if let Ok(output) = std::process::Command::new(path).arg("--version").output() {
                if output.status.success() {
                    println!("[Tunnel] Using system bore at: {}", path);
                    return Ok(path.to_string());
                }
            }
        }

        // If not found, try to download it
        println!("[Tunnel] Bore not found, attempting to download...");
        self.download_bore().await
    }

    fn get_bundled_bore_path(&self) -> PathBuf {
        // Get the app's data directory
        let app_dir = self.servers_dir.parent().unwrap_or(&self.servers_dir);

        #[cfg(target_os = "windows")]
        let filename = "bore.exe";

        #[cfg(not(target_os = "windows"))]
        let filename = "bore";

        app_dir.join("bin").join(filename)
    }

    async fn download_bore(&self) -> Result<String, String> {
        let bore_path = self.get_bundled_bore_path();

        // Create bin directory if it doesn't exist
        if let Some(parent) = bore_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create bin directory: {}", e))?;
        }

        // Determine download URL based on platform
        // Bore releases: https://github.com/ekzhang/bore/releases
        let version = "0.5.1"; // Latest stable version

        #[cfg(target_os = "macos")]
        let (filename, download_url) = if cfg!(target_arch = "aarch64") {
            ("bore-v0.5.1-aarch64-apple-darwin.tar.gz", 
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-aarch64-apple-darwin.tar.gz", version, version))
        } else {
            ("bore-v0.5.1-x86_64-apple-darwin.tar.gz",
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-x86_64-apple-darwin.tar.gz", version, version))
        };

        #[cfg(target_os = "windows")]
        let (filename, download_url) = if cfg!(target_arch = "aarch64") {
            ("bore-v0.5.1-aarch64-pc-windows-msvc.zip",
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-aarch64-pc-windows-msvc.zip", version, version))
        } else {
            ("bore-v0.5.1-x86_64-pc-windows-msvc.zip",
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-x86_64-pc-windows-msvc.zip", version, version))
        };

        #[cfg(target_os = "linux")]
        let (filename, download_url) = if cfg!(target_arch = "aarch64") {
            ("bore-v0.5.1-aarch64-unknown-linux-musl.tar.gz",
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-aarch64-unknown-linux-musl.tar.gz", version, version))
        } else {
            ("bore-v0.5.1-x86_64-unknown-linux-musl.tar.gz",
             format!("https://github.com/ekzhang/bore/releases/download/v{}/bore-v{}-x86_64-unknown-linux-musl.tar.gz", version, version))
        };

        println!("[Tunnel] Downloading bore from: {}", download_url);

        // Download the file using async reqwest
        let response = reqwest::get(&download_url)
            .await
            .map_err(|e| format!("Failed to download bore: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download: {}", e))?;

        // Extract based on file type
        if filename.ends_with(".zip") {
            // Handle ZIP files (Windows)
            use std::io::Cursor;
            let reader = Cursor::new(bytes);
            let mut archive =
                zip::ZipArchive::new(reader).map_err(|e| format!("Failed to open zip: {}", e))?;

            // Find and extract bore binary
            for i in 0..archive.len() {
                let mut file = archive
                    .by_index(i)
                    .map_err(|e| format!("Failed to read zip entry: {}", e))?;

                let file_name = file.name();
                if file_name == "bore.exe" || file_name.ends_with("/bore.exe") {
                    let mut buffer = Vec::new();
                    std::io::copy(&mut file, &mut buffer)
                        .map_err(|e| format!("Failed to extract bore: {}", e))?;

                    fs::write(&bore_path, buffer)
                        .map_err(|e| format!("Failed to save bore: {}", e))?;
                    break;
                }
            }
        } else {
            // Handle TAR.GZ files (macOS and Linux)
            use flate2::read::GzDecoder;
            use tar::Archive;

            let tar = GzDecoder::new(std::io::Cursor::new(bytes));
            let mut archive = Archive::new(tar);

            for entry in archive
                .entries()
                .map_err(|e| format!("Failed to read tar: {}", e))?
            {
                let mut entry = entry.map_err(|e| format!("Failed to read tar entry: {}", e))?;

                let path = entry
                    .path()
                    .map_err(|e| format!("Failed to get entry path: {}", e))?;

                let path_str = path.to_string_lossy();
                if path_str == "bore" || path_str.ends_with("/bore") {
                    let mut buffer = Vec::new();
                    std::io::copy(&mut entry, &mut buffer)
                        .map_err(|e| format!("Failed to extract bore: {}", e))?;

                    fs::write(&bore_path, buffer)
                        .map_err(|e| format!("Failed to save bore: {}", e))?;
                    break;
                }
            }
        }

        // Make executable on Unix systems
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&bore_path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&bore_path, perms)
                .map_err(|e| format!("Failed to set executable permission: {}", e))?;
        }

        println!(
            "[Tunnel] ✓ Bore downloaded successfully to: {:?}",
            bore_path
        );

        Ok(bore_path.to_string_lossy().to_string())
    }
}

fn extract_bore_address(line: &str) -> Option<String> {
    // Bore outputs addresses in formats like:
    // - "listening at bore.pub:12345"
    // - "Listening on bore.pub:12345"
    // - "bore.pub:12345"
    // Windows may have different output formatting

    // Look for bore.pub domain with port
    if line.contains("bore.pub") {
        // Try to extract domain:port pattern
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts {
            if part.contains("bore.pub") {
                // Remove any trailing punctuation and special characters
                let clean = part
                    .trim_end_matches(|c: char| {
                        !c.is_alphanumeric() && c != ':' && c != '.' && c != '-'
                    })
                    .trim_start_matches(|c: char| !c.is_alphanumeric() && c != '.' && c != '-')
                    .to_string();

                // Validate format: should have domain and port
                if clean.contains(':') && clean.contains('.') {
                    // Additional validation: port should be numeric
                    if let Some(port_str) = clean.split(':').last() {
                        if port_str.parse::<u16>().is_ok() {
                            println!("[Tunnel] Extracted valid address: {}", clean);
                            return Some(clean);
                        }
                    }
                }
            }
        }

        // Fallback: try regex-like pattern matching for Windows
        // Look for pattern like "bore.pub:12345" anywhere in the line
        if let Some(start) = line.find("bore.pub:") {
            let substring = &line[start..];
            // Extract until we hit a non-alphanumeric character (except : . -)
            let end = substring
                .find(|c: char| !c.is_alphanumeric() && c != ':' && c != '.' && c != '-')
                .unwrap_or(substring.len());
            let address = substring[..end].to_string();

            // Validate it has a port
            if let Some(port_str) = address.split(':').last() {
                if port_str.parse::<u16>().is_ok() {
                    println!("[Tunnel] Extracted address via fallback: {}", address);
                    return Some(address);
                }
            }
        }
    }

    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStats {
    pub cpu_usage: f32,
    pub memory_usage_mb: u64,
    pub disk_usage_mb: u64,
    pub is_online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerFile {
    pub name: String,
    pub is_directory: bool,
    pub size: u64,
}

// Java auto-installer for servers
impl ServerManager {
    /// Download and install Java for the given Minecraft version
    /// Returns the path to the installed Java executable
    pub async fn ensure_java_installed(&self, mc_version: &str) -> Result<PathBuf, String> {
        // Determine required Java version based on Minecraft version
        let java_version = Self::get_required_java_version(mc_version);

        // Check if we already have this Java version installed
        let java_dir = self
            .servers_dir
            .parent()
            .ok_or("Invalid servers directory")?
            .join("java")
            .join(format!("jdk-{}", java_version));

        let java_exe = if cfg!(target_os = "windows") {
            java_dir.join("bin").join("java.exe")
        } else {
            java_dir.join("bin").join("java")
        };

        // If already installed, return it
        if java_exe.exists() {
            println!(
                "[Java] Using installed Java {} at: {:?}",
                java_version, java_exe
            );
            return Ok(java_exe);
        }

        // Download and install Java
        println!("[Java] Java {} not found, downloading...", java_version);
        self.download_and_install_java(java_version, &java_dir)
            .await?;

        if !java_exe.exists() {
            return Err(format!(
                "Java installation failed - executable not found at {:?}",
                java_exe
            ));
        }

        println!("[Java] ✓ Java {} installed successfully", java_version);
        Ok(java_exe)
    }

    fn get_required_java_version(mc_version: &str) -> u8 {
        // Parse version to determine Java requirement
        let parts: Vec<&str> = mc_version.split('.').collect();
        if parts.len() >= 2 {
            if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                if major >= 26 {
                    return 25; // 26.x snapshots/releases require Java 25
                }
                return match (major, minor) {
                    (1, 0..=16) => 8,   // 1.0 - 1.16: Java 8
                    (1, 17) => 16,      // 1.17: Java 16
                    (1, 18..=20) => 17, // 1.18 - 1.20: Java 17
                    _ => 21,            // 1.21+: Java 21
                };
            }
        }
        25 // Default to Java 25 for unknown future versions
    }

    async fn download_and_install_java(
        &self,
        version: u8,
        install_dir: &PathBuf,
    ) -> Result<(), String> {
        // Create install directory
        fs::create_dir_all(install_dir)
            .map_err(|e| format!("Failed to create Java directory: {}", e))?;

        // Determine download URL based on platform and architecture
        let (download_url, archive_name) = Self::get_java_download_url(version)?;

        println!("[Java] Downloading from: {}", download_url);

        // Download Java
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600)) // 10 minutes for large download
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Java: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read Java archive: {}", e))?;

        // Save archive temporarily
        let temp_archive = install_dir.parent().unwrap().join(&archive_name);
        fs::write(&temp_archive, &bytes)
            .map_err(|e| format!("Failed to save Java archive: {}", e))?;

        println!("[Java] Extracting archive...");

        // Extract archive
        Self::extract_java_archive(&temp_archive, install_dir)?;

        // Clean up archive
        fs::remove_file(&temp_archive).ok();

        println!("[Java] ✓ Java extracted successfully");
        Ok(())
    }

    fn get_java_download_url(version: u8) -> Result<(String, String), String> {
        // Use Adoptium (Eclipse Temurin) - reliable and free
        let os = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "mac"
        } else {
            "linux"
        };

        let arch = if cfg!(target_arch = "x86_64") {
            "x64"
        } else if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            return Err("Unsupported architecture".to_string());
        };

        let extension = if cfg!(target_os = "windows") {
            "zip"
        } else {
            "tar.gz"
        };

        // Adoptium API endpoint for latest release
        let url = format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse",
            version, os, arch
        );

        let archive_name = format!("jdk-{}-{}-{}.{}", version, os, arch, extension);

        Ok((url, archive_name))
    }

    fn extract_java_archive(archive_path: &PathBuf, target_dir: &PathBuf) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            // Extract ZIP on Windows
            let file = fs::File::open(archive_path)
                .map_err(|e| format!("Failed to open archive: {}", e))?;

            let mut archive =
                zip::ZipArchive::new(file).map_err(|e| format!("Failed to read ZIP: {}", e))?;

            // Find the root directory in the archive (usually jdk-21.0.1+12 or similar)
            let root_dir = if archive.len() > 0 {
                let first_name = archive
                    .by_index(0)
                    .map_err(|e| format!("Failed to read first entry: {}", e))?
                    .name()
                    .to_string();
                first_name.split('/').next().unwrap_or("").to_string()
            } else {
                return Err("Empty archive".to_string());
            };

            // Extract all files
            for i in 0..archive.len() {
                let mut file = archive
                    .by_index(i)
                    .map_err(|e| format!("Failed to read entry {}: {}", i, e))?;

                let file_path = file.name();

                // Skip the root directory prefix
                let relative_path =
                    if let Some(stripped) = file_path.strip_prefix(&format!("{}/", root_dir)) {
                        stripped
                    } else {
                        continue;
                    };

                let output_path = target_dir.join(relative_path);

                if file.is_dir() {
                    fs::create_dir_all(&output_path).ok();
                } else {
                    if let Some(parent) = output_path.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    let mut output_file = fs::File::create(&output_path)
                        .map_err(|e| format!("Failed to create file: {}", e))?;
                    std::io::copy(&mut file, &mut output_file)
                        .map_err(|e| format!("Failed to extract file: {}", e))?;
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Extract tar.gz on Unix systems
            let tar_gz = fs::File::open(archive_path)
                .map_err(|e| format!("Failed to open archive: {}", e))?;
            let tar = flate2::read::GzDecoder::new(tar_gz);
            let mut archive = tar::Archive::new(tar);

            // Get the root directory name
            let entries = archive
                .entries()
                .map_err(|e| format!("Failed to read archive entries: {}", e))?;

            let mut root_dir = String::new();
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Ok(path) = entry.path() {
                        if let Some(first) = path.components().next() {
                            root_dir = first.as_os_str().to_string_lossy().to_string();
                            break;
                        }
                    }
                }
            }

            // Re-open archive for extraction
            let tar_gz = fs::File::open(archive_path)
                .map_err(|e| format!("Failed to open archive: {}", e))?;
            let tar = flate2::read::GzDecoder::new(tar_gz);
            let mut archive = tar::Archive::new(tar);

            // Extract with path stripping
            for entry in archive
                .entries()
                .map_err(|e| format!("Failed to read entries: {}", e))?
            {
                let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
                let path = entry
                    .path()
                    .map_err(|e| format!("Failed to get path: {}", e))?;

                // Strip root directory
                let relative_path = if let Ok(stripped) = path.strip_prefix(&root_dir) {
                    stripped
                } else {
                    continue;
                };

                let output_path = target_dir.join(relative_path);

                if entry.header().entry_type().is_dir() {
                    fs::create_dir_all(&output_path).ok();
                } else {
                    if let Some(parent) = output_path.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    entry
                        .unpack(&output_path)
                        .map_err(|e| format!("Failed to extract file: {}", e))?;
                }
            }

            // Make java executable
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let java_exe = target_dir.join("bin").join("java");
                if java_exe.exists() {
                    let mut perms = fs::metadata(&java_exe)
                        .map_err(|e| format!("Failed to get metadata: {}", e))?
                        .permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&java_exe, perms)
                        .map_err(|e| format!("Failed to set permissions: {}", e))?;
                }
            }
        }

        Ok(())
    }
}
