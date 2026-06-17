use serde::{Deserialize, Serialize};
use std::fs;
use uuid::Uuid;

// Dragon Client Token Authentication System
// Similar to EasyMC - allows cracked accounts with custom skins

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonToken {
    pub token: String,
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub created_at: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonSession {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub skin_url: Option<String>,
    pub cape_url: Option<String>,
    pub model: String,
}

impl super::MinecraftLauncher {
    /// Generate a Dragon Client token for a username
    pub fn generate_dragon_token(&self, username: &str) -> Result<DragonToken, String> {
        // Generate a unique token
        let token = Uuid::new_v4().to_string();

        // Generate UUID from username (deterministic)
        let uuid = self.generate_uuid_from_username(username);

        // Generate access token
        let access_token = Uuid::new_v4().to_string();

        // Token valid for 30 days
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let expires_at = now + (30 * 24 * 60 * 60);

        let dragon_token = DragonToken {
            token: token.clone(),
            username: username.to_string(),
            uuid: uuid.clone(),
            access_token: access_token.clone(),
            created_at: now,
            expires_at,
        };

        // Save token
        self.save_dragon_token(&dragon_token)?;

        println!("[DragonAuth] Generated token for {}: {}", username, token);
        Ok(dragon_token)
    }

    /// Generate deterministic UUID from username
    fn generate_uuid_from_username(&self, username: &str) -> String {
        use sha1::{Digest, Sha1};

        // Generate UUID v3 (name-based) from username
        let mut hasher = Sha1::new();
        hasher.update(b"OfflinePlayer:");
        hasher.update(username.as_bytes());
        let hash = hasher.finalize();

        // Format as UUID
        format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            hash[0], hash[1], hash[2], hash[3],
            hash[4], hash[5],
            hash[6], hash[7],
            hash[8], hash[9],
            hash[10], hash[11], hash[12], hash[13], hash[14], hash[15]
        )
    }

    /// Save Dragon token
    fn save_dragon_token(&self, token: &DragonToken) -> Result<(), String> {
        let tokens_dir = self.game_dir.join("DragonAuth");
        fs::create_dir_all(&tokens_dir)
            .map_err(|e| format!("Failed to create tokens directory: {}", e))?;

        let token_file = tokens_dir.join(format!("{}.json", token.username));
        let content = serde_json::to_string_pretty(token)
            .map_err(|e| format!("Failed to serialize token: {}", e))?;

        fs::write(&token_file, content).map_err(|e| format!("Failed to write token: {}", e))?;

        Ok(())
    }

    /// Load Dragon token for a username
    pub fn load_dragon_token(&self, username: &str) -> Result<Option<DragonToken>, String> {
        let token_file = self
            .game_dir
            .join("DragonAuth")
            .join(format!("{}.json", username));

        if !token_file.exists() {
            return Ok(None);
        }

        let content =
            fs::read_to_string(&token_file).map_err(|e| format!("Failed to read token: {}", e))?;

        let token: DragonToken =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse token: {}", e))?;

        // Check if token is expired
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        if now > token.expires_at {
            println!(
                "[DragonAuth] Token expired for {}, generating new one",
                username
            );
            return Ok(None);
        }

        Ok(Some(token))
    }

    /// Get or create Dragon session for a username
    pub fn get_dragon_session(&self, username: &str) -> Result<DragonSession, String> {
        // Try to load existing token
        let token = match self.load_dragon_token(username)? {
            Some(t) => t,
            None => {
                // Generate new token
                self.generate_dragon_token(username)?
            }
        };

        // Get skin URLs from Dragon Skins system
        let skin_url = if let Ok(Some(_skin)) = self.get_dragon_skin(username) {
            Some(self.get_skin_url(username))
        } else {
            None
        };

        let cape_url = if let Ok(Some(skin)) = self.get_dragon_skin(username) {
            if skin.cape_path.is_some() {
                Some(self.get_cape_url(username))
            } else {
                None
            }
        } else {
            None
        };

        let model = if let Ok(Some(skin)) = self.get_dragon_skin(username) {
            skin.model
        } else {
            "default".to_string()
        };

        Ok(DragonSession {
            username: token.username,
            uuid: token.uuid,
            access_token: token.access_token,
            skin_url,
            cape_url,
            model,
        })
    }

    /// Get all Dragon tokens
    pub fn get_all_dragon_tokens(&self) -> Result<Vec<DragonToken>, String> {
        let tokens_dir = self.game_dir.join("DragonAuth");

        if !tokens_dir.exists() {
            return Ok(vec![]);
        }

        let mut tokens = vec![];

        for entry in fs::read_dir(&tokens_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(token) = serde_json::from_str::<DragonToken>(&content) {
                        tokens.push(token);
                    }
                }
            }
        }

        Ok(tokens)
    }

    /// Delete Dragon token
    pub fn delete_dragon_token(&self, username: &str) -> Result<(), String> {
        let token_file = self
            .game_dir
            .join("DragonAuth")
            .join(format!("{}.json", username));

        if token_file.exists() {
            fs::remove_file(&token_file).map_err(|e| format!("Failed to delete token: {}", e))?;
        }

        Ok(())
    }

    /// Refresh Dragon token (extend expiration)
    pub fn refresh_dragon_token(&self, username: &str) -> Result<DragonToken, String> {
        // Generate new token with extended expiration
        self.generate_dragon_token(username)
    }
}
