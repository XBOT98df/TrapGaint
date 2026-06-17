use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// Microsoft OAuth constants - Using official Minecraft client ID with native redirect
const MS_CLIENT_ID: &str = "00000000402b5328"; // Official Minecraft client ID
const MS_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthAccount {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_expires: Option<DateTime<Utc>>,
    pub is_offline: bool,
    pub skin_url: Option<String>,
    #[serde(default)]
    pub skin_username: Option<String>, // For offline accounts - the username whose skin to use
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub accounts: Vec<AuthAccount>,
    pub active_account: Option<String>, // UUID of active account
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            active_account: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct MsTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    #[allow(dead_code)]
    expires_in: i64,
}

#[derive(Debug, Serialize)]
struct XboxAuthRequest {
    #[serde(rename = "Properties")]
    properties: XboxAuthProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Serialize)]
struct XboxAuthProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Debug, Deserialize)]
struct XboxAuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUserInfo>,
}

#[derive(Debug, Deserialize)]
struct XboxUserInfo {
    uhs: String,
    #[serde(default)]
    gtg: Option<String>, // Gamertag
    #[serde(default)]
    xid: Option<String>, // XUID
    #[serde(default)]
    agg: Option<String>, // Age group
    #[serde(default)]
    usr: Option<String>, // User
    #[serde(default)]
    utr: Option<String>, // User token
    #[serde(default)]
    prv: Option<String>, // Privileges
}

#[derive(Debug, Serialize)]
struct XstsAuthRequest {
    #[serde(rename = "Properties")]
    properties: XstsAuthProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Serialize)]
struct XstsAuthProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Debug, Serialize)]
struct MinecraftAuthRequest {
    #[serde(rename = "identityToken")]
    identity_token: String,
}

#[derive(Debug, Deserialize)]
struct MinecraftAuthResponse {
    access_token: String,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    id: String,
    name: String,
    skins: Option<Vec<MinecraftSkin>>,
}

#[derive(Debug, Deserialize)]
struct MinecraftSkin {
    url: String,
}

fn get_auth_file_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();

    // Use .lapetus directory to match the game directory
    #[cfg(target_os = "macos")]
    let lapetus_dir = home.join("Library/Application Support/lapetus");

    #[cfg(target_os = "windows")]
    let lapetus_dir = {
        if let Ok(appdata) = std::env::var("APPDATA") {
            PathBuf::from(appdata).join(".lapetus")
        } else {
            home.join("AppData").join("Roaming").join(".lapetus")
        }
    };

    #[cfg(target_os = "linux")]
    let lapetus_dir = home.join(".lapetus");

    fs::create_dir_all(&lapetus_dir).ok();
    lapetus_dir.join("lapetus_accounts.json")
}

pub fn load_auth_state() -> AuthState {
    let path = get_auth_file_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str(&content) {
                return state;
            }
        }
    }
    AuthState::default()
}

pub fn save_auth_state(state: &AuthState) -> Result<(), String> {
    let path = get_auth_file_path();
    let content = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize auth state: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to save auth state: {}", e))?;
    Ok(())
}

/// Get the Microsoft OAuth login URL
pub fn get_ms_login_url() -> String {
    format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&redirect_uri={}&scope={}&prompt=select_account",
        MS_CLIENT_ID,
        urlencoding::encode(MS_REDIRECT_URI),
        urlencoding::encode("XboxLive.signin offline_access")
    )
}

/// Start local HTTP server and wait for OAuth callback - returns auth code
pub fn start_auth_server_and_wait() -> Result<String, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    // Bind to localhost
    let listener = TcpListener::bind("127.0.0.1:25585")
        .map_err(|e| format!("Failed to start auth server: {}", e))?;

    println!("[AUTH] Local auth server started on port 25585");

    // Wait for the callback
    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("Failed to accept connection: {}", e))?;

    // Read HTTP request
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| format!("Failed to read request: {}", e))?;

    println!("[AUTH] Received callback: {}", request_line.trim());

    // Extract code from: GET /auth?code=XXXXX HTTP/1.1
    let code = if let Some(start) = request_line.find("code=") {
        let code_start = start + 5;
        let code_end = request_line[code_start..]
            .find(|c| c == '&' || c == ' ' || c == '\r' || c == '\n')
            .map(|i| code_start + i)
            .unwrap_or(request_line.len());
        let raw_code = &request_line[code_start..code_end];
        Some(
            urlencoding::decode(raw_code)
                .map(|s| s.to_string())
                .unwrap_or_else(|_| raw_code.to_string()),
        )
    } else {
        None
    };

    // Send response HTML
    let (status, html) = if code.is_some() {
        (
            "200 OK",
            r#"<!DOCTYPE html>
<html><head><title>Login Successful</title><style>
body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#18181b,#27272a);color:white;}
.container{text-align:center;padding:40px;background:rgba(255,255,255,0.05);border-radius:20px;border:1px solid rgba(255,255,255,0.1);}
h1{color:#10b981;margin-bottom:10px;}
p{color:#a1a1aa;}
</style></head>
<body><div class="container"><h1>✓ Login Successful!</h1><p>You can close this window and return to Dragon Client.</p></div></body></html>"#,
        )
    } else {
        (
            "400 Bad Request",
            r#"<!DOCTYPE html>
<html><head><title>Login Failed</title><style>
body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#18181b,#27272a);color:white;}
.container{text-align:center;padding:40px;background:rgba(255,255,255,0.05);border-radius:20px;border:1px solid rgba(255,255,255,0.1);}
h1{color:#ef4444;margin-bottom:10px;}
p{color:#a1a1aa;}
</style></head>
<body><div class="container"><h1>✗ Login Failed</h1><p>Please close this window and try again.</p></div></body></html>"#,
        )
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status, html.len(), html
    );

    stream.write_all(response.as_bytes()).ok();
    stream.flush().ok();
    drop(stream);
    drop(listener);

    code.ok_or_else(|| "No authorization code in callback".to_string())
}

/// Exchange authorization code for tokens and authenticate with Minecraft
pub async fn authenticate_with_code(auth_code: &str) -> Result<AuthAccount, String> {
    let client = reqwest::Client::new();

    // Step 1: Exchange code for Microsoft tokens
    println!("[AUTH] Exchanging code for Microsoft tokens...");
    let ms_token = exchange_code_for_token(&client, auth_code).await?;

    // Step 2: Authenticate with Xbox Live
    println!("[AUTH] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live (to fetch gamertag)
    println!("[AUTH] Getting XSTS token for Xbox Live...");
    let (xsts_token_xbox, user_hash_xbox) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Get Xbox Gamertag
    println!("[AUTH] Getting Xbox Gamertag...");
    let gamertag = get_xbox_gamertag(&client, &xsts_token_xbox, &user_hash_xbox).await?;
    println!("[AUTH] Xbox Gamertag: {}", gamertag);

    // Step 5: Get XSTS token for Minecraft
    println!("[AUTH] Getting XSTS token for Minecraft...");
    let (xsts_token, user_hash) = get_xsts_token(&client, &xbox_token).await?;

    // Step 6: Authenticate with Minecraft
    println!("[AUTH] Authenticating with Minecraft...");
    let mc_token = authenticate_minecraft(&client, &xsts_token, &user_hash).await?;

    // Step 6: Get Minecraft profile - if user doesn't own Minecraft, use Xbox identity
    println!("[AUTH] Getting Minecraft profile...");
    match get_minecraft_profile(&client, &mc_token.access_token).await {
        Ok(profile) => {
            // User owns Minecraft - create online account
            println!("[AUTH] ✓ Minecraft ownership verified - Online mode");
            let account = AuthAccount {
                uuid: profile.id,
                username: profile.name,
                access_token: mc_token.access_token,
                refresh_token: ms_token.refresh_token,
                token_expires: Some(Utc::now() + Duration::seconds(mc_token.expires_in)),
                is_offline: false,
                skin_url: profile
                    .skins
                    .and_then(|s| s.first().map(|skin| skin.url.clone())),
                skin_username: None,
            };
            Ok(account)
        }
        Err(e) if e.contains("NOT_FOUND") || e.contains("404") => {
            // User doesn't own Minecraft - create offline account using Xbox identity
            println!(
                "[AUTH] ℹ Minecraft not detected - Using offline mode with Xbox Gamertag: {}",
                gamertag
            );

            // Use user_hash as UUID (format it to 32 chars)
            let xbox_uuid = format!("{:0>32}", user_hash.replace("-", ""));

            let account = AuthAccount {
                uuid: xbox_uuid,
                username: gamertag,          // Use Xbox Gamertag
                access_token: String::new(), // Empty for offline
                refresh_token: ms_token.refresh_token,
                token_expires: None,
                is_offline: true,
                skin_url: None,
                skin_username: None,
            };
            Ok(account)
        }
        Err(e) => {
            // Other errors (network issues, etc.)
            Err(e)
        }
    }
}

async fn exchange_code_for_token(
    client: &reqwest::Client,
    code: &str,
) -> Result<MsTokenResponse, String> {
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", MS_REDIRECT_URI),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", error_text));
    }

    response
        .json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

async fn authenticate_xbox_live(
    client: &reqwest::Client,
    ms_token: &str,
) -> Result<(String, String), String> {
    let request = XboxAuthRequest {
        properties: XboxAuthProperties {
            auth_method: "RPS".to_string(),
            site_name: "user.auth.xboxlive.com".to_string(),
            rps_ticket: format!("d={}", ms_token),
        },
        relying_party: "http://auth.xboxlive.com".to_string(),
        token_type: "JWT".to_string(),
    };

    let response = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Xbox Live auth failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Xbox Live auth failed: {}", error_text));
    }

    let xbox_response: XboxAuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox response: {}", e))?;

    let user_hash = xbox_response
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or("No user hash in Xbox response")?;

    Ok((xbox_response.token, user_hash))
}

#[derive(Debug, Deserialize)]
struct XboxProfileResponse {
    #[serde(rename = "profileUsers")]
    profile_users: Vec<XboxProfile>,
}

#[derive(Debug, Deserialize)]
struct XboxProfile {
    #[serde(rename = "id")]
    xuid: String,
    settings: Vec<XboxSetting>,
}

#[derive(Debug, Deserialize)]
struct XboxSetting {
    id: String,
    value: String,
}

async fn get_xbox_profile(
    client: &reqwest::Client,
    xsts_token: &str,
    user_hash: &str,
) -> Result<(String, String), String> {
    // Get Xbox profile to retrieve Gamertag and XUID
    let response = client
        .get("https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "2")
        .send()
        .await
        .map_err(|e| format!("Failed to get Xbox profile: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get Xbox profile: {}", error_text));
    }

    let profile_response: XboxProfileResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox profile: {}", e))?;

    let profile = profile_response
        .profile_users
        .first()
        .ok_or("No profile in Xbox response")?;

    let gamertag = profile
        .settings
        .iter()
        .find(|s| s.id == "Gamertag")
        .map(|s| s.value.clone())
        .ok_or("No Gamertag in Xbox profile")?;

    let xuid = profile.xuid.clone();

    Ok((gamertag, xuid))
}

async fn get_xsts_token(
    client: &reqwest::Client,
    xbox_token: &str,
) -> Result<(String, String), String> {
    let request = XstsAuthRequest {
        properties: XstsAuthProperties {
            sandbox_id: "RETAIL".to_string(),
            user_tokens: vec![xbox_token.to_string()],
        },
        relying_party: "rp://api.minecraftservices.com/".to_string(),
        token_type: "JWT".to_string(),
    };

    let response = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("XSTS auth failed: {}", error_text));
    }

    let xsts_response: XboxAuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    // Extract user hash (UHS) which we'll use for authentication
    let user_hash = xsts_response
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or("No user hash in XSTS response")?;

    println!("[AUTH] XSTS token obtained, UHS: {}", user_hash);

    Ok((xsts_response.token, user_hash))
}

async fn get_xsts_token_for_xbox(
    client: &reqwest::Client,
    xbox_token: &str,
) -> Result<(String, String), String> {
    let request = XstsAuthRequest {
        properties: XstsAuthProperties {
            sandbox_id: "RETAIL".to_string(),
            user_tokens: vec![xbox_token.to_string()],
        },
        relying_party: "http://xboxlive.com".to_string(), // Different relying party for Xbox Live
        token_type: "JWT".to_string(),
    };

    let response = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("XSTS auth for Xbox failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("XSTS auth for Xbox failed: {}", error_text));
    }

    let xsts_response: XboxAuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    // Extract user hash (UHS) which we'll use for authentication
    let user_hash = xsts_response
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or("No user hash in XSTS response")?;

    println!("[AUTH] XSTS token for Xbox obtained, UHS: {}", user_hash);

    Ok((xsts_response.token, user_hash))
}

async fn get_xbox_gamertag(
    client: &reqwest::Client,
    xsts_token: &str,
    user_hash: &str,
) -> Result<String, String> {
    // Use the profile API with the Xbox Live XSTS token
    println!("[AUTH] Fetching Xbox profile...");
    let response = client
        .get("https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "2")
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to get Xbox profile: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!(
            "[AUTH] Xbox profile API failed ({}): {}",
            status, error_text
        );
        // Return a default gamertag based on user_hash
        return Ok(format!("XboxUser{}", &user_hash[..8]));
    }

    // Parse the response
    let profile_text = response.text().await.unwrap_or_default();
    println!("[AUTH] Xbox profile response: {}", profile_text);

    // Try to extract gamertag from JSON response
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&profile_text) {
        if let Some(users) = json.get("profileUsers").and_then(|u| u.as_array()) {
            if let Some(user) = users.first() {
                if let Some(settings) = user.get("settings").and_then(|s| s.as_array()) {
                    for setting in settings {
                        if let Some(id) = setting.get("id").and_then(|i| i.as_str()) {
                            if id == "Gamertag" {
                                if let Some(value) = setting.get("value").and_then(|v| v.as_str()) {
                                    println!("[AUTH] ✓ Found Xbox Gamertag: {}", value);
                                    return Ok(value.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback to default
    println!("[AUTH] Could not parse gamertag from response, using default");
    Ok(format!("XboxUser{}", &user_hash[..8]))
}

async fn authenticate_minecraft(
    client: &reqwest::Client,
    xsts_token: &str,
    user_hash: &str,
) -> Result<MinecraftAuthResponse, String> {
    let request = MinecraftAuthRequest {
        identity_token: format!("XBL3.0 x={};{}", user_hash, xsts_token),
    };

    let response = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Minecraft auth failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Minecraft auth failed: {}", error_text));
    }

    response
        .json::<MinecraftAuthResponse>()
        .await
        .map_err(|e| format!("Failed to parse Minecraft auth response: {}", e))
}

async fn get_minecraft_profile(
    client: &reqwest::Client,
    mc_token: &str,
) -> Result<MinecraftProfile, String> {
    let response = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc_token))
        .send()
        .await
        .map_err(|e| format!("Failed to get profile: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to get Minecraft profile: {}. Make sure you own Minecraft.",
            error_text
        ));
    }

    response
        .json::<MinecraftProfile>()
        .await
        .map_err(|e| format!("Failed to parse profile: {}", e))
}

/// Create an offline account with optional skin
pub fn create_offline_account(username: &str) -> AuthAccount {
    create_offline_account_with_skin(username, None)
}

/// Create an offline account with a specific skin username
pub fn create_offline_account_with_skin(
    username: &str,
    skin_username: Option<&str>,
) -> AuthAccount {
    let digest = md5::compute(format!("OfflinePlayer:{}", username).as_bytes());
    let mut bytes = digest.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let uuid = uuid::Uuid::from_bytes(bytes).to_string().replace("-", "");

    AuthAccount {
        uuid,
        username: username.to_string(),
        access_token: "offline".to_string(),
        refresh_token: None,
        token_expires: None,
        is_offline: true,
        skin_url: None,
        skin_username: skin_username.map(|s| s.to_string()),
    }
}

/// Refresh Microsoft token if expired
pub async fn refresh_token_if_needed(account: &mut AuthAccount) -> Result<bool, String> {
    if account.is_offline {
        return Ok(false);
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    if let Some(expires) = account.token_expires {
        if expires > Utc::now() + Duration::minutes(5) {
            return Ok(false); // Token still valid
        }
    }

    // Need to refresh
    if let Some(refresh_token) = &account.refresh_token {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .timeout(std::time::Duration::from_secs(25))
            .build()
            .map_err(|e| format!("Failed to create auth HTTP client: {}", e))?;

        let params = [
            ("client_id", MS_CLIENT_ID),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let response = client
            .post("https://login.live.com/oauth20_token.srf")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to refresh token: {}", e))?;

        if !response.status().is_success() {
            return Err("Token refresh failed. Please login again.".to_string());
        }

        let ms_token: MsTokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

        // Re-authenticate with Xbox and Minecraft
        let (xbox_token, _user_hash) =
            authenticate_xbox_live(&client, &ms_token.access_token).await?;
        let (xsts_token, user_hash) = get_xsts_token(&client, &xbox_token).await?;
        let mc_token = authenticate_minecraft(&client, &xsts_token, &user_hash).await?;

        account.access_token = mc_token.access_token;
        account.refresh_token = ms_token.refresh_token.or(account.refresh_token.clone());
        account.token_expires = Some(Utc::now() + Duration::seconds(mc_token.expires_in));

        return Ok(true);
    }

    Err("No refresh token available. Please login again.".to_string())
}

/// Download skin for offline account and setup CustomSkinLoader config
pub async fn setup_offline_skin(game_dir: &PathBuf, account: &AuthAccount) -> Result<(), String> {
    if !account.is_offline {
        return Ok(()); // Only for offline accounts
    }

    // Create skins directory
    let skins_dir = game_dir.join("skins");
    fs::create_dir_all(&skins_dir).map_err(|e| format!("Failed to create skins dir: {}", e))?;
    let skin_path = skins_dir.join(format!("{}.png", account.username));

    // Prefer launcher-selected local skin if present.
    let skin_file_name = format!("{}.png", account.username);
    let mut local_custom_candidates = vec![game_dir
        .join("DragonSkins")
        .join("skins")
        .join(&skin_file_name)];

    // If this is an instance directory, also check the global launcher skin store.
    if let Some(instances_dir) = game_dir.parent() {
        if instances_dir.file_name().and_then(|v| v.to_str()) == Some("instances") {
            if let Some(global_dir) = instances_dir.parent() {
                local_custom_candidates.push(
                    global_dir
                        .join("DragonSkins")
                        .join("skins")
                        .join(&skin_file_name),
                );
            }
        }
    }

    let local_custom_skin = local_custom_candidates
        .into_iter()
        .find(|path| path.exists());

    let skin_source = if let Some(local_custom_skin) = local_custom_skin {
        fs::copy(&local_custom_skin, &skin_path)
            .map_err(|e| format!("Failed to copy local skin: {}", e))?;
        format!("local:{local_custom_skin:?}")
    } else {
        let skin_username = account
            .skin_username
            .clone()
            .unwrap_or_else(|| account.username.clone());

        // Download skin PNG from mc-heads.net
        let skin_url = format!("https://mc-heads.net/skin/{}", skin_username);
        let client = reqwest::Client::new();

        let response = client
            .get(&skin_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download skin: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to download skin: {}", response.status()));
        }

        let skin_bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read skin: {}", e))?;

        // Save skin with account username
        fs::write(&skin_path, &skin_bytes).map_err(|e| format!("Failed to save skin: {}", e))?;
        format!("mc-heads:{skin_username}")
    };

    // Setup CustomSkinLoader configuration if the mod is installed
    let csl_config_dir = game_dir.join("CustomSkinLoader");
    if csl_config_dir.exists() || {
        // Create CSL config even if mod not installed yet - user might install it later
        fs::create_dir_all(&csl_config_dir).is_ok()
    } {
        // Create LocalSkin configuration
        let local_skin_config = serde_json::json!({
            "enable": true,
            "loadlist": [
                {
                    "name": "LocalSkin",
                    "type": "Legacy",
                    "root": format!("skins/{}.png", account.username)
                },
                {
                    "name": "Mojang",
                    "type": "MojangAPI"
                }
            ]
        });

        let config_path = csl_config_dir.join("CustomSkinLoader.json");
        let config_str = serde_json::to_string_pretty(&local_skin_config)
            .map_err(|e| format!("Failed to serialize CSL config: {}", e))?;
        fs::write(&config_path, config_str)
            .map_err(|e| format!("Failed to write CSL config: {}", e))?;
    }

    // Also setup for OfflineSkins mod (simpler format)
    let offline_skins_dir = game_dir.join("config").join("offlineskins");
    if fs::create_dir_all(&offline_skins_dir).is_ok() {
        // Copy skin to OfflineSkins directory
        let offline_skin_path = offline_skins_dir.join(format!("{}.png", account.username));
        fs::copy(&skin_path, &offline_skin_path).ok();
    }

    println!(
        "[SKIN] Configured skin for {} ({})",
        account.username, skin_source
    );

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XboxFriend {
    pub gamertag: String,
    pub xuid: String,
    pub display_pic_raw: Option<String>,
    pub real_name: Option<String>,
    pub gamerscore: Option<String>,
}

/// Get Xbox Live friends list
pub async fn get_xbox_friends(refresh_token: &str) -> Result<Vec<XboxFriend>, String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_FRIENDS] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_FRIENDS] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_FRIENDS] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Get friends list from Xbox Social API
    println!("[XBOX_FRIENDS] Fetching friends list...");
    let response = client
        .get("https://social.xboxlive.com/users/me/people")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "1")
        .header("Accept-Language", "en-US")
        .timeout(std::time::Duration::from_secs(10)) // Add timeout
        .send()
        .await
        .map_err(|e| format!("Failed to get friends list: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[XBOX_FRIENDS] API failed: {}", error_text);
        return Err(format!("Failed to get friends list: {}", error_text));
    }

    let friends_text = response.text().await.unwrap_or_default();
    println!("[XBOX_FRIENDS] Response received");

    // Parse the response to get XUIDs
    let mut xuids = Vec::new();
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&friends_text) {
        if let Some(people) = json.get("people").and_then(|p| p.as_array()) {
            for person in people {
                if let Some(xuid) = person.get("xuid").and_then(|x| x.as_str()) {
                    xuids.push(xuid.to_string());
                }
            }
        }
    }

    println!(
        "[XBOX_FRIENDS] Found {} XUIDs, fetching profiles in batches...",
        xuids.len()
    );

    if xuids.is_empty() {
        return Ok(Vec::new());
    }

    // Step 5: Batch profile requests (Xbox API supports up to 100 per request, but we'll use 50 for safety)
    const BATCH_SIZE: usize = 50;
    let mut all_friends = Vec::new();

    // Split XUIDs into batches and process in parallel
    let chunks: Vec<Vec<String>> = xuids
        .chunks(BATCH_SIZE)
        .map(|chunk| chunk.to_vec())
        .collect();

    println!(
        "[XBOX_FRIENDS] Processing {} batches of up to {} profiles each",
        chunks.len(),
        BATCH_SIZE
    );

    // Process batches in parallel for maximum speed
    let mut tasks = Vec::new();
    for chunk in chunks {
        let client_clone = client.clone();
        let user_hash_clone = user_hash.clone();
        let xsts_token_clone = xsts_token.clone();

        let task = tokio::spawn(async move {
            let profile_request = serde_json::json!({
                "userIds": chunk,
                "settings": ["Gamertag", "GameDisplayName", "Gamerscore", "GameDisplayPicRaw", "RealName"]
            });

            let profile_response = client_clone
                .post("https://profile.xboxlive.com/users/batch/profile/settings")
                .header(
                    "Authorization",
                    format!("XBL3.0 x={};{}", user_hash_clone, xsts_token_clone),
                )
                .header("x-xbl-contract-version", "2")
                .header("Content-Type", "application/json")
                .header("Accept-Language", "en-US")
                .timeout(std::time::Duration::from_secs(15)) // Add timeout
                .json(&profile_request)
                .send()
                .await
                .map_err(|e| format!("Failed to get profiles: {}", e))?;

            if !profile_response.status().is_success() {
                let error_text = profile_response.text().await.unwrap_or_default();
                println!("[XBOX_FRIENDS] Profile API failed: {}", error_text);
                return Ok::<Vec<XboxFriend>, String>(Vec::new());
            }

            let profile_text = profile_response.text().await.unwrap_or_default();

            // Parse profiles
            let mut friends = Vec::new();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&profile_text) {
                if let Some(users) = json.get("profileUsers").and_then(|u| u.as_array()) {
                    for user in users {
                        let xuid = user
                            .get("id")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string();

                        let mut gamertag = String::new();
                        let mut display_pic_raw = None;
                        let mut real_name = None;
                        let mut gamerscore = None;

                        if let Some(settings) = user.get("settings").and_then(|s| s.as_array()) {
                            for setting in settings {
                                if let Some(id) = setting.get("id").and_then(|i| i.as_str()) {
                                    match id {
                                        "Gamertag" | "GameDisplayName" => {
                                            if let Some(value) =
                                                setting.get("value").and_then(|v| v.as_str())
                                            {
                                                if gamertag.is_empty() {
                                                    gamertag = value.to_string();
                                                }
                                            }
                                        }
                                        "Gamerscore" => {
                                            gamerscore = setting
                                                .get("value")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());
                                        }
                                        "GameDisplayPicRaw" => {
                                            display_pic_raw = setting
                                                .get("value")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());
                                        }
                                        "RealName" => {
                                            real_name = setting
                                                .get("value")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        if !gamertag.is_empty() && !xuid.is_empty() {
                            friends.push(XboxFriend {
                                gamertag,
                                xuid,
                                display_pic_raw,
                                real_name,
                                gamerscore,
                            });
                        }
                    }
                }
            }

            Ok(friends)
        });

        tasks.push(task);
    }

    // Wait for all batches to complete
    for task in tasks {
        match task.await {
            Ok(Ok(mut friends)) => {
                all_friends.append(&mut friends);
            }
            Ok(Err(e)) => {
                println!("[XBOX_FRIENDS] Batch failed: {}", e);
            }
            Err(e) => {
                println!("[XBOX_FRIENDS] Task failed: {}", e);
            }
        }
    }

    println!(
        "[XBOX_FRIENDS] Successfully loaded {} friends with profiles",
        all_friends.len()
    );
    Ok(all_friends)
}

/// Get current user's Xbox profile
pub async fn get_current_xbox_profile(refresh_token: &str) -> Result<XboxFriend, String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_PROFILE] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_PROFILE] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_PROFILE] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Get current user's profile
    println!("[XBOX_PROFILE] Fetching profile...");
    let profile_response = client
        .get("https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayName,Gamerscore,GameDisplayPicRaw,RealName")
        .header("Authorization", format!("XBL3.0 x={};{}", user_hash, xsts_token))
        .header("x-xbl-contract-version", "2")
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to get profile: {}", e))?;

    if !profile_response.status().is_success() {
        let error_text = profile_response.text().await.unwrap_or_default();
        println!("[XBOX_PROFILE] Profile API failed: {}", error_text);
        return Err(format!("Failed to get profile: {}", error_text));
    }

    let profile_text = profile_response.text().await.unwrap_or_default();
    println!("[XBOX_PROFILE] Profile response: {}", profile_text);

    // Parse profile
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&profile_text) {
        if let Some(users) = json.get("profileUsers").and_then(|u| u.as_array()) {
            if let Some(user) = users.first() {
                let xuid = user
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();

                let mut gamertag = String::new();
                let mut display_pic_raw = None;
                let mut real_name = None;
                let mut gamerscore = None;

                if let Some(settings) = user.get("settings").and_then(|s| s.as_array()) {
                    for setting in settings {
                        if let Some(id) = setting.get("id").and_then(|i| i.as_str()) {
                            match id {
                                "Gamertag" | "GameDisplayName" => {
                                    if let Some(value) =
                                        setting.get("value").and_then(|v| v.as_str())
                                    {
                                        if gamertag.is_empty() {
                                            gamertag = value.to_string();
                                        }
                                    }
                                }
                                "Gamerscore" => {
                                    gamerscore = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "GameDisplayPicRaw" => {
                                    display_pic_raw = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "RealName" => {
                                    real_name = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if !gamertag.is_empty() {
                    println!("[XBOX_PROFILE] Found profile: {}", gamertag);
                    return Ok(XboxFriend {
                        gamertag,
                        xuid,
                        display_pic_raw,
                        real_name,
                        gamerscore,
                    });
                }
            }
        }
    }

    Err("Failed to parse profile".to_string())
}

/// Search for Xbox users by gamertag
pub async fn search_xbox_users(
    refresh_token: &str,
    search_query: &str,
) -> Result<Vec<XboxFriend>, String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_SEARCH] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_SEARCH] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_SEARCH] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Search for users by gamertag using People API
    println!("[XBOX_SEARCH] Searching for gamertag: {}", search_query);
    let search_url = format!(
        "https://peoplehub.xboxlive.com/users/me/people/search?q={}&maxItems=10",
        urlencoding::encode(search_query)
    );

    let response = client
        .get(&search_url)
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "3")
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to search users: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!(
            "[XBOX_SEARCH] Search API failed with status {}: {}",
            status, error_text
        );
        return Ok(Vec::new());
    }

    // Parse JSON response directly (reqwest handles gzip decompression automatically)
    let json: serde_json::Value = response.json().await.map_err(|e| {
        println!("[XBOX_SEARCH] Failed to parse JSON: {}", e);
        format!("Failed to parse search response: {}", e)
    })?;

    println!(
        "[XBOX_SEARCH] Search response: {}",
        serde_json::to_string_pretty(&json).unwrap_or_default()
    );

    // Parse the response to get XUIDs
    let mut xuids = Vec::new();
    if let Some(people) = json.get("people").and_then(|p| p.as_array()) {
        for person in people {
            if let Some(xuid) = person.get("xuid").and_then(|x| x.as_str()) {
                xuids.push(xuid.to_string());
            }
        }
    }

    println!(
        "[XBOX_SEARCH] Found {} XUIDs, fetching profiles...",
        xuids.len()
    );

    if xuids.is_empty() {
        return Ok(Vec::new());
    }

    // Step 5: Get profile details for all XUIDs (batch request)
    let profile_request = serde_json::json!({
        "userIds": xuids,
        "settings": ["Gamertag", "GameDisplayName", "Gamerscore", "GameDisplayPicRaw", "RealName"]
    });

    let profile_response = client
        .post("https://profile.xboxlive.com/users/batch/profile/settings")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "2")
        .header("Content-Type", "application/json")
        .header("Accept-Language", "en-US")
        .json(&profile_request)
        .send()
        .await
        .map_err(|e| format!("Failed to get profiles: {}", e))?;

    if !profile_response.status().is_success() {
        let error_text = profile_response.text().await.unwrap_or_default();
        println!("[XBOX_SEARCH] Profile API failed: {}", error_text);
        return Ok(Vec::new());
    }

    let profile_text = profile_response.text().await.unwrap_or_default();
    println!("[XBOX_SEARCH] Profile response: {}", profile_text);

    // Parse profiles
    let mut results = Vec::new();
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&profile_text) {
        if let Some(users) = json.get("profileUsers").and_then(|u| u.as_array()) {
            for user in users {
                let xuid = user
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();

                let mut gamertag = String::new();
                let mut display_pic_raw = None;
                let mut real_name = None;
                let mut gamerscore = None;

                if let Some(settings) = user.get("settings").and_then(|s| s.as_array()) {
                    for setting in settings {
                        if let Some(id) = setting.get("id").and_then(|i| i.as_str()) {
                            match id {
                                "Gamertag" | "GameDisplayName" => {
                                    if let Some(value) =
                                        setting.get("value").and_then(|v| v.as_str())
                                    {
                                        if gamertag.is_empty() {
                                            gamertag = value.to_string();
                                        }
                                    }
                                }
                                "Gamerscore" => {
                                    gamerscore = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "GameDisplayPicRaw" => {
                                    display_pic_raw = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "RealName" => {
                                    real_name = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if !gamertag.is_empty() && !xuid.is_empty() {
                    results.push(XboxFriend {
                        gamertag,
                        xuid,
                        display_pic_raw,
                        real_name,
                        gamerscore,
                    });
                }
            }
        }
    }

    println!(
        "[XBOX_SEARCH] Found {} users matching search",
        results.len()
    );
    Ok(results)
}

/// Send Xbox Live friend request
pub async fn send_xbox_friend_request(
    refresh_token: &str,
    target_xuid: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_ADD_FRIEND] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_ADD_FRIEND] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_ADD_FRIEND] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Send friend request via Xbox Social API
    println!(
        "[XBOX_ADD_FRIEND] Sending friend request to XUID: {}",
        target_xuid
    );

    let add_friend_url = format!(
        "https://social.xboxlive.com/users/me/people/xuid({})",
        target_xuid
    );

    // Empty JSON body required for Content-Length
    let empty_body = serde_json::json!({});

    let response = client
        .put(&add_friend_url)
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "1")
        .header("Content-Type", "application/json")
        .header("Content-Length", "2")
        .header("Accept-Language", "en-US")
        .json(&empty_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send friend request: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!(
            "[XBOX_ADD_FRIEND] Failed with status {}: {}",
            status, error_text
        );
        return Err(format!("Failed to add friend on Xbox Live: {}", error_text));
    }

    println!("[XBOX_ADD_FRIEND] Successfully sent friend request on Xbox Live");
    Ok(())
}

/// Get pending Xbox Live friend requests
pub async fn get_xbox_friend_requests(refresh_token: &str) -> Result<Vec<XboxFriend>, String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_REQUESTS] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_REQUESTS] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_REQUESTS] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Get ALL social connections including pending requests
    // The peoplehub endpoint with 'all' decoration shows everyone in your social graph
    println!("[XBOX_REQUESTS] Fetching all social connections...");
    let response = client
        .get("https://peoplehub.xboxlive.com/users/me/people/social/decoration/detail")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "5")
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to get social connections: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[XBOX_REQUESTS] API failed: {}", error_text);
        return Ok(Vec::new());
    }

    // Parse JSON response directly
    let json: serde_json::Value = response.json().await.map_err(|e| {
        println!("[XBOX_REQUESTS] Failed to parse JSON: {}", e);
        format!("Failed to parse response: {}", e)
    })?;

    println!(
        "[XBOX_REQUESTS] Response: {}",
        serde_json::to_string_pretty(&json).unwrap_or_default()
    );

    // Parse the response to get pending friend requests
    // In Xbox Live's follow system:
    // - isFollowingCaller = true means THEY are following YOU (they sent you a request)
    // - isFollowedByCaller = true means YOU are following THEM (you sent them a request)
    // Incoming request = isFollowingCaller=true AND isFollowedByCaller=false
    let mut requests = Vec::new();

    if let Some(people) = json.get("people").and_then(|p| p.as_array()) {
        println!("[XBOX_REQUESTS] Total people in response: {}", people.len());

        for person in people {
            let is_following_caller = person
                .get("isFollowingCaller")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_followed_by_caller = person
                .get("isFollowedByCaller")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let gamertag = person
                .get("gamertag")
                .and_then(|g| g.as_str())
                .unwrap_or("unknown");
            let xuid = person.get("xuid").and_then(|x| x.as_str()).unwrap_or("");

            println!("[XBOX_REQUESTS] Person: {} (XUID: {}), isFollowingCaller: {}, isFollowedByCaller: {}", 
                gamertag, xuid, is_following_caller, is_followed_by_caller);

            // Incoming request: they follow you, but you don't follow them back
            if is_following_caller && !is_followed_by_caller {
                let gamertag = person
                    .get("gamertag")
                    .and_then(|g| g.as_str())
                    .unwrap_or("")
                    .to_string();

                let display_pic_raw = person
                    .get("displayPicRaw")
                    .and_then(|d| d.as_str())
                    .map(|s| s.to_string());

                let real_name = person
                    .get("realName")
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string());

                let gamerscore = person
                    .get("gamerScore")
                    .and_then(|g| g.as_str())
                    .or_else(|| {
                        person
                            .get("gamerScore")
                            .and_then(|g| g.as_u64())
                            .map(|n| n.to_string().leak() as &str)
                    })
                    .map(|s| s.to_string());

                println!(
                    "[XBOX_REQUESTS] ✓ Found incoming request from: {} (XUID: {})",
                    gamertag, xuid
                );

                if !gamertag.is_empty() && !xuid.is_empty() {
                    requests.push(XboxFriend {
                        gamertag,
                        xuid: xuid.to_string(),
                        display_pic_raw,
                        real_name,
                        gamerscore,
                    });
                }
            }
        }
    } else {
        println!("[XBOX_REQUESTS] No 'people' array found in response");
    }

    println!(
        "[XBOX_REQUESTS] Found {} pending requests total",
        requests.len()
    );
    Ok(requests)
}
/// Sync Xbox Live friend requests to Supabase xuid_store table
/// This function fetches pending friend requests from Xbox Live and stores them in Supabase
/// Returns the list of newly stored requests
pub async fn sync_xbox_friend_requests_to_supabase(
    refresh_token: &str,
    current_user_xuid: &str,
    supabase_url: &str,
    supabase_key: &str,
) -> Result<Vec<XboxFriend>, String> {
    println!(
        "[XBOX_SYNC] Starting sync for user XUID: {}",
        current_user_xuid
    );

    // Step 1: Get pending friend requests from Xbox Live
    let pending_requests = get_xbox_friend_requests(refresh_token).await?;
    println!(
        "[XBOX_SYNC] Found {} pending requests from Xbox Live",
        pending_requests.len()
    );

    if pending_requests.is_empty() {
        return Ok(Vec::new());
    }

    // Step 2: Store each request in Supabase xuid_store table
    let client = reqwest::Client::new();
    let mut newly_stored = Vec::new();

    for request in pending_requests {
        println!(
            "[XBOX_SYNC] Processing request from: {} (XUID: {})",
            request.gamertag, request.xuid
        );

        // Check if this request already exists in xuid_store
        let check_url = format!(
            "{}/rest/v1/xuid_store?sender_xuid=eq.{}&receiver_xuid=eq.{}&status=eq.pending",
            supabase_url, request.xuid, current_user_xuid
        );

        let check_response = client
            .get(&check_url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .send()
            .await
            .map_err(|e| format!("Failed to check existing request: {}", e))?;

        if !check_response.status().is_success() {
            println!(
                "[XBOX_SYNC] Failed to check existing request: {}",
                check_response.status()
            );
            continue;
        }

        let existing: Vec<serde_json::Value> = check_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse check response: {}", e))?;

        if !existing.is_empty() {
            println!("[XBOX_SYNC] Request already exists in database, skipping");
            continue;
        }

        // Insert new request into xuid_store
        let insert_url = format!("{}/rest/v1/xuid_store", supabase_url);
        let insert_body = serde_json::json!({
            "sender_xuid": request.xuid,
            "receiver_xuid": current_user_xuid,
            "sender_gamertag": request.gamertag,
            "receiver_gamertag": null,
            "status": "pending"
        });

        let insert_response = client
            .post(&insert_url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&insert_body)
            .send()
            .await
            .map_err(|e| format!("Failed to insert request: {}", e))?;

        if insert_response.status().is_success() {
            println!(
                "[XBOX_SYNC] ✓ Successfully stored request from {} in database",
                request.gamertag
            );
            newly_stored.push(request);
        } else {
            let error_text = insert_response.text().await.unwrap_or_default();
            println!("[XBOX_SYNC] Failed to insert request: {}", error_text);
        }
    }

    println!(
        "[XBOX_SYNC] Sync complete. Stored {} new requests",
        newly_stored.len()
    );
    Ok(newly_stored)
}

/// Accept an Xbox Live friend request
pub async fn accept_xbox_friend_request(
    refresh_token: &str,
    target_xuid: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_ACCEPT] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_ACCEPT] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_ACCEPT] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Accept the friend request
    println!(
        "[XBOX_ACCEPT] Accepting friend request from XUID: {}",
        target_xuid
    );
    println!(
        "[XBOX_ACCEPT] XUID length: {}, XUID type check: is_numeric={}",
        target_xuid.len(),
        target_xuid.chars().all(|c| c.is_numeric())
    );

    let response = client
        .put(format!(
            "https://social.xboxlive.com/users/me/people/xuid({})",
            target_xuid
        ))
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "1")
        .header("Content-Type", "application/json")
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("Failed to accept friend request: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[XBOX_ACCEPT] Error response: {}", error_text);
        println!("[XBOX_ACCEPT] Failed XUID was: {}", target_xuid);
        return Err(format!(
            "Failed to accept friend request on Xbox Live: {}",
            error_text
        ));
    }

    println!("[XBOX_ACCEPT] Successfully accepted friend request");
    Ok(())
}

/// Decline/Remove an Xbox Live friend request or friend
pub async fn decline_xbox_friend_request(
    refresh_token: &str,
    target_xuid: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_DECLINE] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_DECLINE] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_DECLINE] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Remove the friend/decline the request
    println!(
        "[XBOX_DECLINE] Declining friend request from XUID: {}",
        target_xuid
    );
    let response = client
        .delete(format!(
            "https://social.xboxlive.com/users/me/people/xuid({})",
            target_xuid
        ))
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "1")
        .send()
        .await
        .map_err(|e| format!("Failed to decline friend request: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to decline friend request on Xbox Live: {}",
            error_text
        ));
    }

    println!("[XBOX_DECLINE] Successfully declined friend request");
    Ok(())
}

/// Get Xbox profiles for specific XUIDs (batch request)
pub async fn get_xbox_profiles_by_xuids(
    refresh_token: &str,
    xuids: Vec<String>,
) -> Result<Vec<XboxFriend>, String> {
    if xuids.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();

    // Step 1: Refresh Microsoft token
    println!("[XBOX_PROFILES] Refreshing Microsoft token...");
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let ms_token: MsTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Step 2: Authenticate with Xbox Live
    println!("[XBOX_PROFILES] Authenticating with Xbox Live...");
    let (xbox_token, _user_hash) = authenticate_xbox_live(&client, &ms_token.access_token).await?;

    // Step 3: Get XSTS token for Xbox Live
    println!("[XBOX_PROFILES] Getting XSTS token for Xbox Live...");
    let (xsts_token, user_hash) = get_xsts_token_for_xbox(&client, &xbox_token).await?;

    // Step 4: Get profile details for all XUIDs (batch request)
    println!(
        "[XBOX_PROFILES] Fetching profiles for {} XUIDs...",
        xuids.len()
    );
    let profile_request = serde_json::json!({
        "userIds": xuids,
        "settings": ["Gamertag", "GameDisplayName", "Gamerscore", "GameDisplayPicRaw", "RealName"]
    });

    let profile_response = client
        .post("https://profile.xboxlive.com/users/batch/profile/settings")
        .header(
            "Authorization",
            format!("XBL3.0 x={};{}", user_hash, xsts_token),
        )
        .header("x-xbl-contract-version", "2")
        .header("Content-Type", "application/json")
        .header("Accept-Language", "en-US")
        .json(&profile_request)
        .send()
        .await
        .map_err(|e| format!("Failed to get profiles: {}", e))?;

    if !profile_response.status().is_success() {
        let error_text = profile_response.text().await.unwrap_or_default();
        println!("[XBOX_PROFILES] Profile API failed: {}", error_text);
        return Ok(Vec::new());
    }

    let profile_text = profile_response.text().await.unwrap_or_default();
    println!("[XBOX_PROFILES] Profile response: {}", profile_text);

    // Parse profiles
    let mut friends = Vec::new();
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&profile_text) {
        if let Some(users) = json.get("profileUsers").and_then(|u| u.as_array()) {
            for user in users {
                let xuid = user
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();

                let mut gamertag = String::new();
                let mut display_pic_raw = None;
                let mut real_name = None;
                let mut gamerscore = None;

                if let Some(settings) = user.get("settings").and_then(|s| s.as_array()) {
                    for setting in settings {
                        if let Some(id) = setting.get("id").and_then(|i| i.as_str()) {
                            match id {
                                "Gamertag" | "GameDisplayName" => {
                                    if let Some(value) =
                                        setting.get("value").and_then(|v| v.as_str())
                                    {
                                        if gamertag.is_empty() {
                                            gamertag = value.to_string();
                                        }
                                    }
                                }
                                "Gamerscore" => {
                                    gamerscore = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "GameDisplayPicRaw" => {
                                    display_pic_raw = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                "RealName" => {
                                    real_name = setting
                                        .get("value")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if !gamertag.is_empty() {
                    println!(
                        "[XBOX_PROFILES] Found profile: {} (XUID: {})",
                        gamertag, xuid
                    );
                    friends.push(XboxFriend {
                        gamertag,
                        xuid,
                        display_pic_raw,
                        real_name,
                        gamerscore,
                    });
                }
            }
        }
    }

    println!(
        "[XBOX_PROFILES] Successfully fetched {} profiles",
        friends.len()
    );
    Ok(friends)
}
