use super::server::{MinecraftServer, ServerManager, ServerProperties};
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct ServerState {
    pub manager: Arc<Mutex<ServerManager>>,
}

#[tauri::command]
pub async fn create_server(
    name: String,
    version: String,
    loader: String,
    port: u16,
    ram_mb: u32,
    state: State<'_, ServerState>,
) -> Result<MinecraftServer, String> {
    let manager = state.manager.lock().await;
    manager.create_server(name, version, loader, port, ram_mb)
}

#[tauri::command]
pub async fn get_servers(state: State<'_, ServerState>) -> Result<Vec<MinecraftServer>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.get_servers())
}

#[tauri::command]
pub async fn get_server(
    server_id: String,
    state: State<'_, ServerState>,
) -> Result<Option<MinecraftServer>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.get_server(&server_id))
}

#[tauri::command]
pub async fn delete_server(
    server_id: String,
    state: State<'_, ServerState>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager.delete_server(&server_id)
}

#[tauri::command]
pub async fn start_server(
    server_id: String,
    state: State<'_, ServerState>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    // TODO: Get Java path from launcher
    let java_path = "java";
    manager.start_server(&server_id, java_path)
}

#[tauri::command]
pub async fn stop_server(
    server_id: String,
    state: State<'_, ServerState>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager.stop_server(&server_id)
}

#[tauri::command]
pub async fn execute_server_command(
    server_id: String,
    command: String,
    state: State<'_, ServerState>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager.execute_command(&server_id, command)
}

#[tauri::command]
pub async fn setup_ngrok(
    server_id: String,
    state: State<'_, ServerState>,
) -> Result<String, String> {
    // TODO: Implement ngrok integration
    Err("Ngrok integration coming soon".to_string())
}

#[tauri::command]
pub async fn invite_friend_to_server(
    server_id: String,
    friend_oder_id: String,
    state: State<'_, ServerState>,
) -> Result<(), String> {
    // TODO: Implement friend invite system
    Err("Friend invites coming soon".to_string())
}
