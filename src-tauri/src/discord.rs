use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// TrapGaint Discord Application ID
const DISCORD_APP_ID: &str = "1459857797805248605";

pub struct DiscordRPC {
    client: Option<DiscordIpcClient>,
    start_time: i64,
    is_connected: bool,
    current_activity: ActivityType,
}

#[derive(Clone, PartialEq)]
enum ActivityType {
    Launcher,
    Playing {
        version: String,
        server: Option<String>,
        loader: Option<String>,
    },
    Idle,
}

impl DiscordRPC {
    pub fn new() -> Self {
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        Self {
            client: None,
            start_time,
            is_connected: false,
            current_activity: ActivityType::Idle,
        }
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected
    }

    pub fn connect(&mut self) -> Result<(), String> {
        if self.is_connected {
            return Ok(());
        }

        match DiscordIpcClient::new(DISCORD_APP_ID) {
            Ok(mut client) => match client.connect() {
                Ok(_) => {
                    println!("[Discord RPC] Connected successfully!");
                    self.client = Some(client);
                    self.is_connected = true;
                    Ok(())
                }
                Err(e) => {
                    println!("[Discord RPC] Failed to connect: {:?}", e);
                    Err(format!("Failed to connect to Discord: {:?}", e))
                }
            },
            Err(e) => {
                println!("[Discord RPC] Failed to create client: {:?}", e);
                Err(format!("Failed to create Discord client: {:?}", e))
            }
        }
    }

    fn ensure_connected(&mut self) -> Result<(), String> {
        if self.is_connected && self.client.is_some() {
            return Ok(());
        }

        self.client = None;
        self.is_connected = false;
        self.connect()
    }

    pub fn disconnect(&mut self) {
        // Clear activity before disconnecting
        if self.is_connected {
            let _ = self.clear_activity();
        }

        if let Some(ref mut client) = self.client {
            let _ = client.close();
        }
        self.client = None;
        self.is_connected = false;
        self.current_activity = ActivityType::Idle;
        println!("[Discord RPC] Disconnected and cleared presence");
    }

    pub fn set_launcher_activity(&mut self) -> Result<(), String> {
        self.ensure_connected()?;

        let start_time = self.start_time;
        let build_activity = || {
            activity::Activity::new()
                .details("TrapGaint")
                .assets(
                    activity::Assets::new()
                        .large_image("dragon_logo")
                        .large_text("TrapGaint"),
                )
                .timestamps(activity::Timestamps::new().start(start_time))
        };

        let first_try_error = if let Some(ref mut client) = self.client {
            client
                .set_activity(build_activity())
                .err()
                .map(|e| format!("{:?}", e))
        } else {
            Some("Discord IPC not connected".to_string())
        };

        if let Some(err) = first_try_error {
            println!(
                "[Discord RPC] Launcher activity failed, reconnecting: {}",
                err
            );
            self.client = None;
            self.is_connected = false;
            self.ensure_connected()?;

            if let Some(ref mut client) = self.client {
                client.set_activity(build_activity()).map_err(|e| {
                    format!("Failed to set launcher activity after reconnect: {:?}", e)
                })?;
            } else {
                return Err("Discord client unavailable after reconnect".to_string());
            }
        }

        self.current_activity = ActivityType::Launcher;
        println!("[Discord RPC] Set launcher activity");
        Ok(())
    }

    pub fn set_playing_activity(
        &mut self,
        version: &str,
        server: Option<&str>,
        loader: Option<&str>,
    ) -> Result<(), String> {
        self.ensure_connected()?;

        // Determine loader type and icon
        let (loader_name, loader_icon) = match loader {
            Some("forge") => ("Forge", "forge"),
            Some("fabric") => ("Fabric", "fabric"),
            Some("quilt") => ("Quilt", "quilt"),
            Some("neoforge") => ("NeoForge", "neoforge"),
            Some("lapetus") => ("Lapetus", "lapetus"),
            _ => ("Vanilla", "minecraft"),
        };

        let details = format!("TrapGaint");

        let state = if let Some(s) = server {
            format!("{}", s)
        } else {
            format!("Minecraft {}", version)
        };

        let start_time = self.start_time;
        let build_activity = || {
            activity::Activity::new()
                .state(&state)
                .details(&details)
                .assets(
                    activity::Assets::new()
                        .large_image("dragon_logo")
                        .large_text("TrapGaint"),
                )
                .timestamps(activity::Timestamps::new().start(start_time))
        };

        let first_try_error = if let Some(ref mut client) = self.client {
            client
                .set_activity(build_activity())
                .err()
                .map(|e| format!("{:?}", e))
        } else {
            Some("Discord IPC not connected".to_string())
        };

        if let Some(err) = first_try_error {
            println!(
                "[Discord RPC] Playing activity failed, reconnecting: {}",
                err
            );
            self.client = None;
            self.is_connected = false;
            self.ensure_connected()?;

            if let Some(ref mut client) = self.client {
                client.set_activity(build_activity()).map_err(|e| {
                    format!("Failed to set playing activity after reconnect: {:?}", e)
                })?;
            } else {
                return Err("Discord client unavailable after reconnect".to_string());
            }
        }

        self.current_activity = ActivityType::Playing {
            version: version.to_string(),
            server: server.map(|s| s.to_string()),
            loader: loader.map(|l| l.to_string()),
        };
        println!(
            "[Discord RPC] Set playing activity: {} - {}",
            details, state
        );
        Ok(())
    }

    pub fn clear_activity(&mut self) -> Result<(), String> {
        if let Some(ref mut client) = self.client {
            client
                .clear_activity()
                .map_err(|e| format!("Failed to clear activity: {:?}", e))?;
            self.current_activity = ActivityType::Idle;
            println!("[Discord RPC] Cleared activity");
        }
        Ok(())
    }

    pub fn get_current_activity(&self) -> String {
        match &self.current_activity {
            ActivityType::Launcher => "launcher".to_string(),
            ActivityType::Playing { version, .. } => format!("playing:{}", version),
            ActivityType::Idle => "idle".to_string(),
        }
    }
}

// Global Discord RPC instance
lazy_static::lazy_static! {
    pub static ref DISCORD_RPC: Arc<Mutex<DiscordRPC>> = Arc::new(Mutex::new(DiscordRPC::new()));
}

// Public functions for Tauri commands
pub fn init_discord() {
    std::thread::spawn(|| {
        // Retry connection up to 3 times with delays
        for attempt in 1..=3 {
            if let Ok(mut rpc) = DISCORD_RPC.lock() {
                match rpc.connect() {
                    Ok(_) => {
                        println!("[Discord RPC] Connected on attempt {}", attempt);
                        if let Err(e) = rpc.set_launcher_activity() {
                            println!(
                                "[Discord RPC] Failed to set initial launcher activity: {}",
                                e
                            );
                        }
                        return; // Success, exit the thread
                    }
                    Err(e) => {
                        println!("[Discord RPC] Attempt {} failed: {}", attempt, e);
                        if attempt < 3 {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                        }
                    }
                }
            }
        }
        println!("[Discord RPC] Failed to connect after 3 attempts");
    });
}

pub fn update_launcher_status() -> Result<(), String> {
    if let Ok(mut rpc) = DISCORD_RPC.lock() {
        rpc.set_launcher_activity()
    } else {
        Err("Failed to acquire Discord RPC lock".to_string())
    }
}

pub fn update_playing_status(
    version: &str,
    server: Option<&str>,
    loader: Option<&str>,
) -> Result<(), String> {
    if let Ok(mut rpc) = DISCORD_RPC.lock() {
        rpc.set_playing_activity(version, server, loader)
    } else {
        Err("Failed to acquire Discord RPC lock".to_string())
    }
}

pub fn get_current_status() -> String {
    if let Ok(rpc) = DISCORD_RPC.lock() {
        rpc.get_current_activity()
    } else {
        "unknown".to_string()
    }
}

pub fn shutdown_discord() {
    if let Ok(mut rpc) = DISCORD_RPC.lock() {
        rpc.disconnect();
    }
}
