use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModpackMod {
    pub name: String,
    pub project_id: String,
    pub version_id: String,
    pub required: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Modpack {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub mc_version: String,
    pub icon: String,
    #[serde(default)]
    pub banner: String,
    pub mods: Vec<ModpackMod>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModpacksConfig {
    pub modpacks: Vec<Modpack>,
}

fn extract_modrinth_gallery_url(value: &serde_json::Value) -> Option<String> {
    if let Some(url) = value.as_str() {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    for key in ["raw_url", "url"] {
        if let Some(url) = value.get(key).and_then(serde_json::Value::as_str) {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

fn extract_modrinth_banner_url(hit: &serde_json::Value) -> String {
    if let Some(gallery) = hit.get("gallery").and_then(serde_json::Value::as_array) {
        if let Some(featured_url) = gallery
            .iter()
            .find(|entry| {
                entry
                    .get("featured")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false)
            })
            .and_then(extract_modrinth_gallery_url)
        {
            return featured_url;
        }

        if let Some(first_url) = gallery.iter().find_map(extract_modrinth_gallery_url) {
            return first_url;
        }
    }

    hit.get("icon_url")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string()
}

impl super::MinecraftLauncher {
    async fn download_modpack_file_from_urls(
        &self,
        urls: &[String],
        path: &std::path::Path,
    ) -> Result<String, String> {
        let target = path.to_path_buf();
        let mut last_error = None;

        for url in urls {
            match self.download_file(url, &target).await {
                Ok(_) => return Ok(url.clone()),
                Err(error) => {
                    last_error = Some(format!("{} ({})", url, error));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "No usable download URL found".to_string()))
    }

    fn count_manifest_mod_files(files: &[serde_json::Value]) -> usize {
        files
            .iter()
            .filter(|file_entry| {
                file_entry["path"]
                    .as_str()
                    .map(|path| path.starts_with("mods/"))
                    .unwrap_or(false)
            })
            .count()
    }

    /// Get installed modpack runtime version IDs
    pub fn get_installed_modpack_versions(&self) -> Result<Vec<String>, String> {
        let versions_dir = self.game_dir.join("versions");
        let mut installed = Vec::new();

        if versions_dir.exists() {
            for entry in fs::read_dir(&versions_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if !entry.path().is_dir() {
                    continue;
                }

                let version_id = entry.file_name().to_string_lossy().to_string();
                let json_path = entry.path().join(format!("{}.json", version_id));
                let metadata_path = entry.path().join("modpack-metadata.json");

                if json_path.exists() && metadata_path.exists() {
                    println!("[Modpacks] Found installed modpack runtime: {}", version_id);
                    installed.push(version_id);
                }
            }
        }

        installed.sort_by(|a, b| compare_modpack_version_ids(b, a));
        Ok(installed)
    }

    /// Get all available modpacks from Modrinth with caching
    pub async fn get_modpacks(&self) -> Result<Vec<Modpack>, String> {
        println!("[Modpacks] Fetching modpacks from Modrinth API...");

        // Check cache first
        let cache_dir = self.game_dir.join("cache");
        fs::create_dir_all(&cache_dir).ok();
        let cache_file = cache_dir.join("modpacks_cache.json");

        // Try to load from cache (valid for 1 hour)
        if let Ok(metadata) = fs::metadata(&cache_file) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() < 3600 {
                        // 1 hour cache
                        if let Ok(cache_content) = fs::read_to_string(&cache_file) {
                            if let Ok(cached_modpacks) =
                                serde_json::from_str::<Vec<Modpack>>(&cache_content)
                            {
                                if cached_modpacks
                                    .iter()
                                    .all(|modpack| !modpack.banner.trim().is_empty())
                                {
                                    println!(
                                        "[Modpacks] Loaded {} modpacks from cache",
                                        cached_modpacks.len()
                                    );
                                    return Ok(cached_modpacks);
                                }

                                println!(
                                    "[Modpacks] Cache is missing banner imagery, refreshing from Modrinth"
                                );
                            }
                        }
                    }
                }
            }
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let mut all_modpacks = Vec::new();
        let mut offset = 0;
        let limit = 100; // Max allowed by Modrinth API

        // Fetch modpacks in batches until we have them all
        loop {
            println!("[Modpacks] Fetching batch at offset {}...", offset);

            // Search for ALL modpacks on Modrinth, sorted by downloads
            let search_url = format!(
                "https://api.modrinth.com/v2/search?facets=[[\"project_type:modpack\"]]&limit={}&offset={}&index=downloads",
                limit, offset
            );

            let response = client
                .get(&search_url)
                .header("User-Agent", "Block-Launcher/2.0")
                .send()
                .await
                .map_err(|e| format!("Failed to fetch modpacks: {}", e))?;

            if !response.status().is_success() {
                return Err(format!(
                    "Modrinth API returned status: {}",
                    response.status()
                ));
            }

            let search_result: serde_json::Value = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let hits = search_result["hits"]
                .as_array()
                .ok_or_else(|| "No hits in response".to_string())?;

            if hits.is_empty() {
                break; // No more results
            }

            for hit in hits.iter() {
                let project_id = hit["project_id"].as_str().unwrap_or("").to_string();
                let title = hit["title"].as_str().unwrap_or("Unknown").to_string();
                let description = hit["description"].as_str().unwrap_or("").to_string();
                let icon_url = hit["icon_url"].as_str().unwrap_or("").to_string();
                let banner_url = extract_modrinth_banner_url(hit);

                // Include ALL modpacks (no download filter)
                all_modpacks.push(Modpack {
                    id: project_id.clone(),
                    name: title,
                    description: description,
                    version: "latest".to_string(),
                    mc_version: "".to_string(),
                    icon: icon_url,
                    banner: banner_url,
                    mods: vec![],
                });
            }

            offset += limit;

            // Continue until we get all modpacks (no artificial limit)
            // Modrinth has thousands of modpacks, so this will take a while on first load

            // Small delay to respect API rate limits
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        println!(
            "[Modpacks] Fetched {} total modpacks from Modrinth",
            all_modpacks.len()
        );

        // Cache the results
        if let Ok(cache_json) = serde_json::to_string_pretty(&all_modpacks) {
            fs::write(&cache_file, cache_json).ok();
        }

        Ok(all_modpacks)
    }

    /// Get modpacks with pagination (9 per page) - fetches directly from Modrinth
    pub async fn get_modpacks_paginated(
        &self,
        page: usize,
        per_page: usize,
        query: Option<&str>,
        game_version: Option<&str>,
        loader: Option<&str>,
    ) -> Result<(Vec<Modpack>, usize), String> {
        let offset = page * per_page;
        let trimmed_query = query.map(str::trim).filter(|value| !value.is_empty());

        println!(
            "[Modpacks] Fetching page {} ({} per page, offset {}, query: {:?}, version: {:?}, loader: {:?})...",
            page, per_page, offset, trimmed_query, game_version, loader
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| {
                let err_msg = format!("Failed to create HTTP client: {}", e);
                eprintln!("[Modpacks ERROR] {}", err_msg);
                err_msg
            })?;

        let mut search_url =
            reqwest::Url::parse("https://api.modrinth.com/v2/search").map_err(|e| {
                let err_msg = format!("Failed to build Modrinth search URL: {}", e);
                eprintln!("[Modpacks ERROR] {}", err_msg);
                err_msg
            })?;

        {
            let mut query_pairs = search_url.query_pairs_mut();

            let mut facets = vec!["[\"project_type:modpack\"]".to_string()];
            if let Some(version) = game_version {
                facets.push(format!("[\"versions:{}\"]", version));
            }
            if let Some(l) = loader {
                let norm_loader = if l.to_lowercase() == "lapetus" || l.to_lowercase() == "dragon" {
                    "fabric".to_string()
                } else {
                    l.to_lowercase()
                };
                if norm_loader != "vanilla" && !norm_loader.is_empty() {
                    facets.push(format!("[\"categories:{}\"]", norm_loader));
                }
            }
            let facets_str = format!("[{}]", facets.join(","));

            query_pairs.append_pair("facets", &facets_str);
            query_pairs.append_pair("limit", &per_page.to_string());
            query_pairs.append_pair("offset", &offset.to_string());
            query_pairs.append_pair("index", "downloads");

            if let Some(search_query) = trimmed_query {
                query_pairs.append_pair("query", search_query);
            }
        }

        println!("[Modpacks] Request URL: {}", search_url);

        let response = client
            .get(search_url.clone())
            .header("User-Agent", "Block-Launcher/2.0")
            .send()
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to fetch modpacks from {}: {}", search_url, e);
                eprintln!("[Modpacks ERROR] {}", err_msg);
                err_msg
            })?;

        if !response.status().is_success() {
            let err_msg = format!(
                "Modrinth API returned status: {} for URL: {}",
                response.status(),
                search_url
            );
            eprintln!("[Modpacks ERROR] {}", err_msg);
            return Err(err_msg);
        }

        let search_result: serde_json::Value = response.json().await.map_err(|e| {
            let err_msg = format!("Failed to parse response: {}", e);
            eprintln!("[Modpacks ERROR] {}", err_msg);
            err_msg
        })?;

        let total_hits = search_result["total_hits"].as_u64().unwrap_or(0) as usize;
        let hits = search_result["hits"].as_array().ok_or_else(|| {
            let err_msg = "No hits in response".to_string();
            eprintln!("[Modpacks ERROR] {}", err_msg);
            err_msg
        })?;

        let mut modpacks = Vec::new();

        for hit in hits.iter() {
            let project_id = hit["project_id"].as_str().unwrap_or("").to_string();
            let title = hit["title"].as_str().unwrap_or("Unknown").to_string();
            let description = hit["description"].as_str().unwrap_or("").to_string();
            let icon_url = hit["icon_url"].as_str().unwrap_or("").to_string();
            let banner_url = extract_modrinth_banner_url(hit);

            modpacks.push(Modpack {
                id: project_id.clone(),
                name: title,
                description: description,
                version: "latest".to_string(),
                mc_version: "".to_string(),
                icon: icon_url,
                banner: banner_url,
                mods: vec![],
            });
        }

        println!(
            "[Modpacks] Successfully fetched {} modpacks for page {} (total: {})",
            modpacks.len(),
            page,
            total_hits
        );
        Ok((modpacks, total_hits))
    }

    /// Get available versions for a modpack from Modrinth with caching
    pub async fn get_modpack_versions(
        &self,
        project_id: &str,
    ) -> Result<Vec<serde_json::Value>, String> {
        println!("[Modpacks] Fetching versions for modpack: {}", project_id);

        // Check cache first
        let cache_dir = self.game_dir.join("cache").join("modpack_versions");
        fs::create_dir_all(&cache_dir).ok();
        let cache_file = cache_dir.join(format!("{}.json", project_id));

        // Try to load from cache (valid for 30 minutes)
        if let Ok(metadata) = fs::metadata(&cache_file) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() < 1800 {
                        // 30 minutes cache
                        if let Ok(cache_content) = fs::read_to_string(&cache_file) {
                            if let Ok(cached_versions) =
                                serde_json::from_str::<Vec<serde_json::Value>>(&cache_content)
                            {
                                println!(
                                    "[Modpacks] Loaded {} versions from cache for {}",
                                    cached_versions.len(),
                                    project_id
                                );
                                return Ok(cached_versions);
                            }
                        }
                    }
                }
            }
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15)) // Reduced timeout
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let versions_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);

        let response = client
            .get(&versions_url)
            .header("User-Agent", "Block-Launcher/2.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch modpack versions: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Modrinth API returned status: {}",
                response.status()
            ));
        }

        let versions: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse versions: {}", e))?;

        // Cache the results
        if let Ok(cache_json) = serde_json::to_string_pretty(&versions) {
            fs::write(&cache_file, cache_json).ok();
        }

        println!(
            "[Modpacks] Found {} versions for modpack {} (cached)",
            versions.len(),
            project_id
        );
        Ok(versions)
    }

    /// Install a modpack
    pub async fn install_modpack<F>(
        &self,
        version_id: &str,
        modpack_name: &str,
        game_version: &str,
        progress_callback: F,
    ) -> Result<String, String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("[Modpack Install] Starting installation:");
        println!("  Version ID: {}", version_id);
        println!("  Modpack Name: {}", modpack_name);
        println!("  Game Version: {}", game_version);

        progress_callback(0.0, format!("Loading modpack version {}...", version_id));

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        // Step 1: Get version details from Modrinth
        progress_callback(0.05, "Fetching modpack details...".to_string());
        println!("[Modpack Install] Fetching version details from Modrinth...");
        let version_url = format!("https://api.modrinth.com/v2/version/{}", version_id);

        let response = client
            .get(&version_url)
            .header("User-Agent", "Block-Launcher/1.0")
            .send()
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to fetch version details: {}", e);
                println!("[Modpack Install] ERROR: {}", err_msg);
                err_msg
            })?;

        if !response.status().is_success() {
            return Err(format!(
                "Modrinth API returned status: {}",
                response.status()
            ));
        }

        let version_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version data: {}", e))?;

        // Get the primary file (mrpack file)
        let files = version_data["files"]
            .as_array()
            .ok_or_else(|| "No files found in version".to_string())?;

        let mrpack_file = files
            .iter()
            .find(|f| f["filename"].as_str().unwrap_or("").ends_with(".mrpack"))
            .ok_or_else(|| "No .mrpack file found".to_string())?;

        let download_url = mrpack_file["url"]
            .as_str()
            .ok_or_else(|| "No download URL found".to_string())?;

        let filename = mrpack_file["filename"]
            .as_str()
            .ok_or_else(|| "No filename found".to_string())?;

        // Step 2: Ensure vanilla Minecraft is installed
        progress_callback(0.10, "Checking Minecraft installation...".to_string());
        let vanilla_jar = self
            .versions_dir
            .join(game_version)
            .join(format!("{}.jar", game_version));
        if !vanilla_jar.exists() {
            println!(
                "[Modpack Install] Vanilla Minecraft {} not found, installing...",
                game_version
            );
            progress_callback(0.12, format!("Installing Minecraft {}...", game_version));

            // Install vanilla Minecraft
            self.install_version(game_version, |p, s| {
                progress_callback(0.12 + p * 0.18, format!("Minecraft: {}", s));
            })
            .await?;

            println!(
                "[Modpack Install] Vanilla Minecraft {} installed successfully",
                game_version
            );
        } else {
            println!(
                "[Modpack Install] Vanilla Minecraft {} already installed",
                game_version
            );
        }

        // Step 2.5: Ensure required Java version is installed
        let required_java = super::MinecraftLauncher::get_required_java_version(game_version);
        progress_callback(
            0.30,
            format!("Checking Java {} installation...", required_java),
        );

        if !self.check_java_installed_version(required_java) {
            println!(
                "[Modpack Install] Java {} not found, installing...",
                required_java
            );
            progress_callback(0.31, format!("Installing Java {}...", required_java));

            self.install_java_version(required_java, &|p, s| {
                progress_callback(0.31 + p * 0.10, format!("Java {}: {}", required_java, s));
            })
            .await
            .map_err(|e| format!("Failed to install Java {}: {}", required_java, e))?;

            println!(
                "[Modpack Install] Java {} installed successfully",
                required_java
            );
        } else {
            println!("[Modpack Install] Java {} already installed", required_java);
        }

        // Step 3: Download the mrpack file
        progress_callback(0.15, format!("Downloading {}...", filename));
        let temp_dir = self.game_dir.join("temp");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir).ok();
        }
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;

        let mrpack_path = temp_dir.join(filename);

        let response = client
            .get(download_url)
            .header("User-Agent", "Block-Launcher/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download modpack: {}", e))?;

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        let mut file =
            fs::File::create(&mrpack_path).map_err(|e| format!("Failed to create file: {}", e))?;

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to download chunk: {}", e))?;
            std::io::Write::write_all(&mut file, &chunk)
                .map_err(|e| format!("Failed to write chunk: {}", e))?;
            downloaded += chunk.len() as u64;

            if total_size > 0 {
                let progress = 0.15 + (downloaded as f32 / total_size as f32) * 0.30;
                progress_callback(
                    progress,
                    format!(
                        "Downloading... {:.1}%",
                        (downloaded as f32 / total_size as f32) * 100.0
                    ),
                );
            }
        }

        drop(file);

        // Step 4: Extract the mrpack file (it's a zip)
        progress_callback(0.45, "Extracting modpack...".to_string());

        let extract_dir = temp_dir.join("extracted");
        fs::create_dir_all(&extract_dir)
            .map_err(|e| format!("Failed to create extract directory: {}", e))?;

        let file = fs::File::open(&mrpack_path)
            .map_err(|e| format!("Failed to open mrpack file: {}", e))?;

        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read mrpack archive: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read archive entry: {}", e))?;

            let outpath = extract_dir.join(file.name());

            if file.name().ends_with('/') {
                fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    fs::create_dir_all(p).ok();
                }
                let mut outfile = fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create extracted file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;
            }
        }

        // Step 5: Read modrinth.index.json to get mod list and loader info
        progress_callback(0.50, "Reading modpack manifest...".to_string());

        let index_path = extract_dir.join("modrinth.index.json");
        let index_content = fs::read_to_string(&index_path)
            .map_err(|e| format!("Failed to read modrinth.index.json: {}", e))?;

        let index: serde_json::Value = serde_json::from_str(&index_content)
            .map_err(|e| format!("Failed to parse modrinth.index.json: {}", e))?;

        let manifest_files = index["files"]
            .as_array()
            .ok_or_else(|| "No files found in manifest".to_string())?;
        let manifest_mod_count = Self::count_manifest_mod_files(manifest_files);

        // Get loader info
        let dependencies = index["dependencies"]
            .as_object()
            .ok_or_else(|| "No dependencies found in manifest".to_string())?;

        // Check what loader the modpack actually uses
        let has_fabric = dependencies.contains_key("fabric-loader");
        let has_forge = dependencies.contains_key("forge");
        let has_quilt = dependencies.contains_key("quilt-loader");

        println!(
            "[Modpack Install] Modpack loaders: fabric={}, forge={}, quilt={}",
            has_fabric, has_forge, has_quilt
        );

        let manifest_mc_version = dependencies.get("minecraft").and_then(|v| v.as_str());
        let minecraft_version = manifest_mc_version
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(game_version);

        println!("[Modpack Install] Version selection:");
        println!("  Manifest specifies: {:?}", manifest_mc_version);
        println!("  Frontend requested: {}", game_version);
        println!("  Using: {} (manifest takes priority)", minecraft_version);

        // Check Java version requirement from modpack
        let required_java_from_modpack = if let Some(java_req) = dependencies.get("java") {
            // Java version can be specified as a string or number
            if let Some(java_str) = java_req.as_str() {
                // Parse Java version requirement (e.g., "21", "17", "8")
                // Modrinth format just specifies the minimum version as a plain number
                java_str.parse::<u8>().ok()
            } else if let Some(java_num) = java_req.as_u64() {
                // Sometimes it's specified as a number directly
                Some(java_num as u8)
            } else {
                None
            }
        } else {
            None
        };

        // Determine required Java version (use modpack requirement if higher than MC requirement)
        let mc_required_java =
            super::MinecraftLauncher::get_required_java_version(minecraft_version);
        let required_java = if let Some(modpack_java) = required_java_from_modpack {
            println!(
                "[Modpack Install] Modpack requires Java {}, MC {} requires Java {}",
                modpack_java, minecraft_version, mc_required_java
            );
            std::cmp::max(modpack_java, mc_required_java)
        } else {
            mc_required_java
        };

        // Install required Java if not present
        if !self.check_java_installed_version(required_java) {
            println!(
                "[Modpack Install] Java {} not found, installing...",
                required_java
            );
            progress_callback(0.52, format!("Installing Java {}...", required_java));

            self.install_java_version(required_java, &|p, s| {
                progress_callback(0.52 + p * 0.08, format!("Java {}: {}", required_java, s));
            })
            .await
            .map_err(|e| format!("Failed to install Java {}: {}", required_java, e))?;

            println!(
                "[Modpack Install] Java {} installed successfully",
                required_java
            );
        } else {
            println!("[Modpack Install] Java {} already installed", required_java);
        }

        // Handle different loaders
        let loader_version_id = if has_fabric {
            // === FABRIC MODPACK ===
            println!("[Modpack Install] Installing Fabric modpack...");

            // Check if Fabric supports this Minecraft version (Fabric only supports 1.14+)
            let mc_parts: Vec<&str> = minecraft_version.split('.').collect();
            let major = mc_parts
                .get(0)
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0);
            let minor = mc_parts
                .get(1)
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0);

            if major == 1 && minor < 14 {
                return Err(format!("Fabric does not support Minecraft {} (requires 1.14+). This modpack cannot be installed.", minecraft_version));
            }

            let manifest_fabric_loader = dependencies.get("fabric-loader").and_then(|v| v.as_str());

            // Fetch Fabric loader that meets the modpack's requirement
            let fabric_loader = if let Some(required_loader) = manifest_fabric_loader {
                // The manifest specifies a minimum version (e.g., "0.17.0")
                println!(
                    "[Modpack Install] Manifest requires Fabric loader: {}",
                    required_loader
                );

                // Fetch a Fabric loader that meets the requirement
                self.fetch_latest_fabric_loader(&client, minecraft_version, Some(required_loader))
                    .await?
            } else {
                println!("[Modpack Install] No Fabric loader requirement in manifest, fetching latest for MC {}...", minecraft_version);
                self.fetch_latest_fabric_loader(&client, minecraft_version, None)
                    .await?
            };

            println!("[Modpack Install] Fabric Loader: {}", fabric_loader);

            // Install Fabric loader
            progress_callback(0.35, "Setting up Fabric loader...".to_string());
            let fabric_version_id =
                format!("fabric-loader-{}-{}", fabric_loader, minecraft_version);
            let fabric_version_dir = self.versions_dir.join(&fabric_version_id);

            if !fabric_version_dir
                .join(format!("{}.json", fabric_version_id))
                .exists()
            {
                let fabric_info = super::FabricVersionInfo {
                    id: fabric_version_id.clone(),
                    loader_version: fabric_loader.to_string(),
                    mc_version: minecraft_version.to_string(),
                    stable: true,
                };

                self.install_fabric(&fabric_info, |p, s| {
                    progress_callback(0.35 + p * 0.10, format!("Fabric: {}", s));
                })
                .await?;
            }

            fabric_version_id
        } else if has_forge {
            // === FORGE MODPACK ===
            println!("[Modpack Install] Installing Forge modpack...");

            let manifest_forge_version = dependencies.get("forge").and_then(|v| v.as_str());

            // Fetch available Forge versions for this Minecraft version
            let forge_version = if let Some(version) = manifest_forge_version {
                println!(
                    "[Modpack Install] Using manifest Forge version: {}",
                    version
                );
                version.to_string()
            } else {
                println!(
                    "[Modpack Install] No Forge version in manifest, fetching latest for MC {}...",
                    minecraft_version
                );
                self.fetch_latest_forge_version(&client, minecraft_version)
                    .await?
            };

            println!("[Modpack Install] Forge Version: {}", forge_version);

            // Install Forge
            progress_callback(0.35, "Setting up Forge loader...".to_string());

            // Forge version ID format: {mc_version}-forge-{forge_version} or {mc_version}-forge{mc_version}-{forge_version}
            let forge_version_id = if forge_version.contains(&minecraft_version) {
                format!("{}-forge-{}", minecraft_version, forge_version)
            } else {
                format!(
                    "{}-forge{}-{}",
                    minecraft_version, minecraft_version, forge_version
                )
            };

            let forge_version_dir = self.versions_dir.join(&forge_version_id);

            if !forge_version_dir
                .join(format!("{}.json", forge_version_id))
                .exists()
            {
                // Try to fetch Forge versions to get the installer URL
                let forge_versions = self.get_forge_versions_for_mc(minecraft_version).await?;

                // Try to find exact match first
                let forge_info = forge_versions
                    .iter()
                    .find(|v| v.forge_version == forge_version)
                    .cloned();

                let forge_info = if let Some(info) = forge_info {
                    println!(
                        "[Modpack Install] Found Forge version in API: {}",
                        info.installer_url
                    );
                    info
                } else {
                    // If not found, construct the ForgeVersionInfo manually and try multiple URL formats
                    println!("[Modpack Install] Forge version {} not found in API, trying multiple URL formats", forge_version);

                    // Try to download from multiple possible URLs
                    let full_version = format!("{}-{}", minecraft_version, forge_version);

                    // Possible URL formats for different Forge versions
                    let possible_urls = vec![
                        // Format 1: Old Forge format with MC version at start and end (1.7.10 - 1.12.2)
                        // Example: 1.8.9-11.15.1.2318-1.8.9/forge-1.8.9-11.15.1.2318-1.8.9-installer.jar
                        format!(
                            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}-{}/forge-{}-{}-{}-installer.jar",
                            minecraft_version, forge_version, minecraft_version,
                            minecraft_version, forge_version, minecraft_version
                        ),
                        // Format 2: files.minecraftforge.net mirror with triple MC version
                        format!(
                            "https://files.minecraftforge.net/maven/net/minecraftforge/forge/{}-{}-{}/forge-{}-{}-{}-installer.jar",
                            minecraft_version, forge_version, minecraft_version,
                            minecraft_version, forge_version, minecraft_version
                        ),
                        // Format 3: Old format with MC version twice (some versions)
                        format!(
                            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
                            minecraft_version, forge_version, minecraft_version, forge_version
                        ),
                        // Format 4: Modern format (1.13+)
                        format!(
                            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
                            full_version, full_version
                        ),
                    ];

                    // Try each URL to find one that works
                    let mut working_url = None;
                    for url in &possible_urls {
                        println!("[Modpack Install] Trying installer URL: {}", url);

                        // Quick HEAD request to check if URL exists
                        match client.head(url).send().await {
                            Ok(response) if response.status().is_success() => {
                                println!("[Modpack Install] Found working URL: {}", url);
                                working_url = Some(url.clone());
                                break;
                            }
                            _ => {
                                println!("[Modpack Install] URL not found: {}", url);
                                continue;
                            }
                        }
                    }

                    let installer_url = working_url.ok_or_else(|| {
                        format!(
                            "Could not find Forge installer for version {}. Tried multiple URLs but none worked. \
                            This modpack may require a Forge version that is no longer available.",
                            forge_version
                        )
                    })?;

                    super::ForgeVersionInfo {
                        id: forge_version_id.clone(),
                        mc_version: minecraft_version.to_string(),
                        forge_version: forge_version.clone(),
                        installer_url,
                        is_recommended: false,
                    }
                };

                let actual_forge_version_id = self
                    .install_forge(&forge_info, |p, s| {
                        progress_callback(0.35 + p * 0.10, format!("Forge: {}", s));
                    })
                    .await?;

                // Use the actual installed version ID instead of our guess
                println!(
                    "[Modpack Install] Forge installed as: {}",
                    actual_forge_version_id
                );
                actual_forge_version_id
            } else {
                // Already installed, use the constructed ID
                forge_version_id
            }
        } else if has_quilt {
            return Err("Quilt modpacks are not yet supported. Only Fabric and Forge modpacks are supported.".to_string());
        } else {
            return Err(
                "Unknown modpack loader. Only Fabric and Forge modpacks are supported.".to_string(),
            );
        };

        progress_callback(0.30, format!("Minecraft {} with loader", minecraft_version));

        // Step 7: Create modpack version
        progress_callback(0.45, format!("Creating {} version...", modpack_name));

        println!("[Modpack Install] Creating version ID:");
        println!("  Raw modpack name: '{}'", modpack_name);

        // Create a clean version ID: modpack-name-game-version
        let clean_modpack_name = modpack_name
            .to_lowercase()
            .replace(" ", "-")
            .replace("'", "")
            .replace("\"", "")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();

        println!("  Cleaned name: '{}'", clean_modpack_name);
        println!("  Minecraft version: '{}'", minecraft_version);

        let modpack_version_id = format!("{}-{}", clean_modpack_name, minecraft_version);

        println!("  Final version ID: '{}'", modpack_version_id);
        let modpack_version_dir = self.versions_dir.join(&modpack_version_id);
        fs::create_dir_all(&modpack_version_dir).map_err(|e| e.to_string())?;

        // Create profile in state system to track installation
        let loader_name = if has_fabric {
            "fabric"
        } else if has_forge {
            "forge"
        } else if has_quilt {
            "quilt"
        } else {
            "vanilla"
        };
        let profile = crate::minecraft::state::Profile {
            id: modpack_version_id.clone(),
            name: modpack_name.to_string(),
            game_version: minecraft_version.to_string(),
            loader: loader_name.to_string(),
            loader_version: Some(loader_version_id.clone()),
            install_stage: crate::minecraft::state::InstallStage::Installing,
            java_path: None,
            java_version: Some(required_java),
            memory_mb: None,
            created: chrono::Utc::now(),
            modified: chrono::Utc::now(),
            last_played: None,
            icon_url: None,
            project_id: None, // We don't have the project ID here, only version ID
            version_id: Some(version_id.to_string()),
            mod_count: Some(manifest_mod_count),
        };

        self.state.upsert_profile(&profile).ok();
        println!("[Modpack Install] Created profile in state system with stage: Installing");

        let modpack_json = serde_json::json!({
            "id": modpack_version_id,
            "inheritsFrom": loader_version_id,
            "type": "release",
            "time": chrono::Utc::now().to_rfc3339(),
            "releaseTime": chrono::Utc::now().to_rfc3339(),
            "arguments": {
                "game": [],
                "jvm": []
            }
        });

        let modpack_json_path = modpack_version_dir.join(format!("{}.json", modpack_version_id));
        fs::write(
            &modpack_json_path,
            serde_json::to_string_pretty(&modpack_json).unwrap(),
        )
        .map_err(|e| format!("Failed to write modpack JSON: {}", e))?;

        // Step 8: Setup modpack instance directory
        progress_callback(0.50, "Setting up modpack directory...".to_string());

        let instance_dir = self.game_dir.join("instances").join(&modpack_version_id);
        fs::create_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to create instance directory: {}", e))?;

        // Copy overrides from extracted modpack
        let overrides_dir = extract_dir.join("overrides");
        if overrides_dir.exists() {
            progress_callback(0.72, "Copying modpack files...".to_string());
            super::MinecraftLauncher::copy_dir_recursive(&overrides_dir, &instance_dir)?;
        }

        // Create necessary directories
        let mods_dir = instance_dir.join("mods");
        if mods_dir.exists() {
            fs::remove_dir_all(&mods_dir)
                .map_err(|e| format!("Failed to clear stale mods directory: {}", e))?;
        }
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;
        fs::create_dir_all(instance_dir.join("config")).ok();
        fs::create_dir_all(instance_dir.join("resourcepacks")).ok();
        fs::create_dir_all(instance_dir.join("screenshots")).ok();

        // Symlink saves folder to main saves
        let instance_saves = instance_dir.join("saves");
        let main_saves = self.game_dir.join("saves");
        fs::create_dir_all(&main_saves).ok();
        if !instance_saves.exists() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(&main_saves, &instance_saves).ok();
            #[cfg(windows)]
            std::os::windows::fs::symlink_dir(&main_saves, &instance_saves).ok();
        }

        // Step 9: Download mods from manifest
        progress_callback(0.75, "Downloading mods...".to_string());

        let files = index["files"]
            .as_array()
            .ok_or_else(|| "No files found in manifest".to_string())?;
        let mod_file_entries: Vec<&serde_json::Value> = files
            .iter()
            .filter(|file_entry| {
                file_entry["path"]
                    .as_str()
                    .map(|path| path.starts_with("mods/"))
                    .unwrap_or(false)
            })
            .collect();

        let total_mods = mod_file_entries.len();
        let mut failed_mod_downloads = Vec::new();
        for (i, file_entry) in mod_file_entries.iter().enumerate() {
            let progress = 0.75 + (i as f32 / total_mods as f32) * 0.20;

            let path = file_entry["path"].as_str().unwrap_or("");
            let downloads = file_entry["downloads"].as_array();

            let filename = path.strip_prefix("mods/").unwrap_or(path);
            progress_callback(progress, format!("Downloading {}...", filename));

            if let Some(downloads) = downloads {
                let download_urls: Vec<String> = downloads
                    .iter()
                    .filter_map(|value| value.as_str())
                    .map(|value| value.to_string())
                    .collect();

                if download_urls.is_empty() {
                    let error = "manifest did not include a usable download URL".to_string();
                    println!(
                        "[Modpack] Warning: Failed to download {}: {}",
                        filename, error
                    );
                    failed_mod_downloads.push(format!("{} ({})", filename, error));
                    continue;
                }

                let mod_path = mods_dir.join(filename);
                match self
                    .download_modpack_file_from_urls(&download_urls, &mod_path)
                    .await
                {
                    Ok(source_url) => {
                        println!("[Modpack] Downloaded {} from {}", filename, source_url)
                    }
                    Err(error) => {
                        println!(
                            "[Modpack] Warning: Failed to download {}: {}",
                            filename, error
                        );
                        failed_mod_downloads.push(format!("{} ({})", filename, error));
                    }
                }
            } else {
                let error = "manifest did not contain a downloads array".to_string();
                println!(
                    "[Modpack] Warning: Failed to download {}: {}",
                    filename, error
                );
                failed_mod_downloads.push(format!("{} ({})", filename, error));
            }
        }

        if !failed_mod_downloads.is_empty() {
            fs::remove_dir_all(&temp_dir).ok();
            return Err(format!(
                "Failed to download {} modpack file(s): {}",
                failed_mod_downloads.len(),
                failed_mod_downloads
                    .iter()
                    .take(5)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        if mods_dir.exists() {
            println!(
                "[Modpack Install] Downloaded manifest mods into {}",
                mods_dir.display()
            );
        }

        // Step 10: Save metadata
        progress_callback(0.95, "Finalizing installation...".to_string());

        let metadata = serde_json::json!({
            "modpack_name": modpack_name,
            "version_id": version_id,
            "game_version": minecraft_version,
            "loader_version_id": loader_version_id,
            "installed_at": chrono::Utc::now().to_rfc3339(),
            "mod_count": total_mods,
            "manifest_mod_count": total_mods
        });

        let metadata_path = modpack_version_dir.join("modpack-metadata.json");
        fs::write(
            &metadata_path,
            serde_json::to_string_pretty(&metadata).unwrap(),
        )
        .ok();

        // Cleanup temp files
        fs::remove_dir_all(&temp_dir).ok();

        // Update profile to Installed state
        self.state
            .update_install_stage(
                &modpack_version_id,
                crate::minecraft::state::InstallStage::Installed,
            )
            .ok();
        println!("[Modpack Install] Updated profile state to: Installed");

        progress_callback(1.0, format!("{} installed!", modpack_name));

        println!("[Modpack Install] ✓ Installation complete!");
        println!("  Modpack Version ID: {}", modpack_version_id);
        println!("  Instance Directory: {}", instance_dir.display());
        println!("  Mods Directory: {}", mods_dir.display());
        println!("  Total Mods: {}", total_mods);
        println!("  Minecraft Version: {}", minecraft_version);
        println!("  Loader Version ID: {}", loader_version_id);

        Ok(modpack_version_id)
    }

    /// Check if a modpack is installed
    pub fn is_modpack_installed(&self, modpack_id: &str, mc_version: &str) -> bool {
        // Sanitize the modpack ID to match installation format
        let clean_modpack_name = modpack_id
            .to_lowercase()
            .replace(" ", "-")
            .replace("'", "")
            .replace("\"", "")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();

        let modpack_version_id = format!("{}-{}", clean_modpack_name, mc_version);

        // Check if the version directory and JSON file actually exist
        let modpack_version_dir = self.versions_dir.join(&modpack_version_id);
        let json_path = modpack_version_dir.join(format!("{}.json", modpack_version_id));

        if !json_path.exists() {
            // Files don't exist, clean up state if needed
            if let Ok(profiles) = self.state.get_profiles() {
                for profile in profiles {
                    if profile.id == modpack_version_id {
                        // State says installed but files are gone - clean it up
                        self.state.remove_profile(&modpack_version_id).ok();
                        println!(
                            "[Modpack] Cleaned up stale state for: {}",
                            modpack_version_id
                        );
                        break;
                    }
                }
            }
            return false;
        }

        // Files exist, return true
        true
    }

    /// Uninstall a modpack
    pub fn uninstall_modpack(&self, modpack_id: &str, mc_version: &str) -> Result<(), String> {
        let modpack_version_id = format!("{}-{}", modpack_id, mc_version);
        let version_dir = self.versions_dir.join(&modpack_version_id);

        if version_dir.exists() {
            fs::remove_dir_all(&version_dir).map_err(|e| e.to_string())?;
        }

        // Remove instance directory
        let instance_dir = self.game_dir.join("instances").join(&modpack_version_id);
        if instance_dir.exists() {
            fs::remove_dir_all(&instance_dir).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// Verify and repair modpack installation
    /// Checks if all mods are present and re-downloads missing ones
    pub async fn verify_and_repair_modpack<F>(
        &self,
        version_id: &str,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        println!("[Modpack Verify] Starting verification for: {}", version_id);
        progress_callback(0.0, "Verifying modpack installation...".to_string());

        // Get the modpack version directory
        let modpack_version_dir = self.versions_dir.join(version_id);
        if !modpack_version_dir.exists() {
            return Err(format!("Modpack version {} not found", version_id));
        }

        // Read metadata to get original version info
        let metadata_path = modpack_version_dir.join("modpack-metadata.json");
        if !metadata_path.exists() {
            println!("[Modpack Verify] No metadata found, skipping verification");
            return Ok(());
        }

        let metadata_content = fs::read_to_string(&metadata_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        let metadata: serde_json::Value = serde_json::from_str(&metadata_content)
            .map_err(|e| format!("Failed to parse metadata: {}", e))?;

        let modrinth_version_id = metadata["version_id"]
            .as_str()
            .ok_or_else(|| "No version_id in metadata".to_string())?;

        progress_callback(0.1, "Fetching modpack manifest...".to_string());

        // Fetch the modpack version from Modrinth to get the manifest
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let version_url = format!(
            "https://api.modrinth.com/v2/version/{}",
            modrinth_version_id
        );

        let response = client
            .get(&version_url)
            .header("User-Agent", "Block-Launcher/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch version details: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Modrinth API returned status: {}",
                response.status()
            ));
        }

        let version_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version data: {}", e))?;

        // Get the mrpack file
        let files = version_data["files"]
            .as_array()
            .ok_or_else(|| "No files found in version".to_string())?;

        let mrpack_file = files
            .iter()
            .find(|f| f["filename"].as_str().unwrap_or("").ends_with(".mrpack"))
            .ok_or_else(|| "No .mrpack file found".to_string())?;

        let download_url = mrpack_file["url"]
            .as_str()
            .ok_or_else(|| "No download URL found".to_string())?;

        progress_callback(0.2, "Downloading manifest...".to_string());

        // Download and extract just the manifest
        let temp_dir = self.game_dir.join("temp").join("verify");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir).ok();
        }
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;

        let mrpack_path = temp_dir.join("modpack.mrpack");

        let response = client
            .get(download_url)
            .header("User-Agent", "Block-Launcher/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download modpack: {}", e))?;

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&mrpack_path, &bytes).map_err(|e| format!("Failed to write mrpack: {}", e))?;

        // Extract just the manifest
        let manifest_content = {
            let file = fs::File::open(&mrpack_path)
                .map_err(|e| format!("Failed to open mrpack file: {}", e))?;

            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read mrpack archive: {}", e))?;

            let mut manifest_file = archive
                .by_name("modrinth.index.json")
                .map_err(|e| format!("Failed to find manifest in mrpack: {}", e))?;

            let mut content = String::new();
            std::io::Read::read_to_string(&mut manifest_file, &mut content)
                .map_err(|e| format!("Failed to read manifest: {}", e))?;

            content
            // archive and manifest_file are dropped here
        };

        let manifest: serde_json::Value = serde_json::from_str(&manifest_content)
            .map_err(|e| format!("Failed to parse manifest: {}", e))?;

        progress_callback(0.3, "Checking installed mods...".to_string());

        // Get the mods directory
        let instance_dir = self.game_dir.join("instances").join(version_id);
        let mods_dir = instance_dir.join("mods");
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;

        // Get list of mods from manifest
        let files_list = manifest["files"]
            .as_array()
            .ok_or_else(|| "No files found in manifest".to_string())?;

        let mut missing_mods = Vec::new();
        let mut corrupted_mods = Vec::new();
        let mut total_mods = 0;

        println!(
            "[Modpack Verify] Checking {} files from manifest...",
            files_list.len()
        );

        for (idx, file_entry) in files_list.iter().enumerate() {
            let path = file_entry["path"].as_str().unwrap_or("");

            // Only check mods
            if !path.starts_with("mods/") {
                continue;
            }

            total_mods += 1;
            let filename = path.strip_prefix("mods/").unwrap_or(path);
            let mod_path = mods_dir.join(filename);

            // Show progress every 10 mods
            if idx % 10 == 0 {
                let check_progress = 0.3 + (idx as f32 / files_list.len() as f32) * 0.1;
                progress_callback(
                    check_progress,
                    format!("Checking mods... {}/{}", idx, files_list.len()),
                );
            }

            // Check if mod exists and is a valid JAR file
            let mut is_valid = false;
            let mut is_corrupted = false;

            if mod_path.exists() {
                // Check file size
                if let Ok(metadata) = fs::metadata(&mod_path) {
                    if metadata.len() > 1000 {
                        // Verify it's a valid ZIP/JAR file by trying to open it
                        match fs::File::open(&mod_path) {
                            Ok(file) => match zip::ZipArchive::new(file) {
                                Ok(_) => {
                                    is_valid = true;
                                }
                                Err(e) => {
                                    println!(
                                        "[Modpack Verify] ✗ Corrupted JAR {}: {}",
                                        filename, e
                                    );
                                    is_corrupted = true;
                                }
                            },
                            Err(e) => {
                                println!("[Modpack Verify] ✗ Cannot open {}: {}", filename, e);
                                is_corrupted = true;
                            }
                        }
                    } else {
                        println!(
                            "[Modpack Verify] ✗ File too small {}: {} bytes",
                            filename,
                            metadata.len()
                        );
                        is_corrupted = true;
                    }
                } else {
                    println!("[Modpack Verify] ✗ Cannot read metadata for {}", filename);
                }
            } else {
                println!("[Modpack Verify] ✗ Missing: {}", filename);
            }

            if !is_valid {
                if is_corrupted {
                    corrupted_mods.push(filename.to_string());
                }
                missing_mods.push((filename.to_string(), file_entry.clone()));
            }
        }

        if missing_mods.is_empty() {
            progress_callback(1.0, format!("✓ All {} mods verified!", total_mods));
            println!("[Modpack Verify] ✓ All mods present and valid");
            fs::remove_dir_all(&temp_dir).ok();
            return Ok(());
        }

        println!(
            "[Modpack Verify] Found {} missing/corrupted mods out of {}",
            missing_mods.len(),
            total_mods
        );
        if !corrupted_mods.is_empty() {
            println!("[Modpack Verify] Corrupted mods: {:?}", corrupted_mods);
        }
        progress_callback(0.45, format!("Repairing {} mods...", missing_mods.len()));
        // Re-download missing mods
        let mut successful_downloads = 0;
        let mut failed_downloads = 0;

        for (i, (filename, file_entry)) in missing_mods.iter().enumerate() {
            let progress = 0.45 + (i as f32 / missing_mods.len() as f32) * 0.50;
            progress_callback(
                progress,
                format!(
                    "Downloading {} ({}/{})",
                    filename,
                    i + 1,
                    missing_mods.len()
                ),
            );

            let downloads = file_entry["downloads"].as_array();

            if let Some(downloads) = downloads {
                let download_urls: Vec<String> = downloads
                    .iter()
                    .filter_map(|value| value.as_str())
                    .map(|value| value.to_string())
                    .collect();

                if !download_urls.is_empty() {
                    let mod_path = mods_dir.join(filename);

                    // Remove corrupted file if exists
                    if mod_path.exists() {
                        println!("[Modpack Verify] Removing corrupted file: {}", filename);
                        fs::remove_file(&mod_path).ok();
                    }

                    // Download the mod
                    println!(
                        "[Modpack Verify] Attempting download for {} from {} sources",
                        filename,
                        download_urls.len()
                    );
                    match self
                        .download_modpack_file_from_urls(&download_urls, &mod_path)
                        .await
                    {
                        Ok(source_url) => {
                            // Verify the downloaded file
                            if let Ok(file) = fs::File::open(&mod_path) {
                                match zip::ZipArchive::new(file) {
                                    Ok(_) => {
                                        successful_downloads += 1;
                                        println!(
                                            "[Modpack Verify] ✓ Downloaded and verified {} from {}",
                                            filename, source_url
                                        );
                                        progress_callback(
                                            progress,
                                            format!(
                                                "✓ {} ({}/{})",
                                                filename,
                                                i + 1,
                                                missing_mods.len()
                                            ),
                                        );
                                    }
                                    Err(e) => {
                                        failed_downloads += 1;
                                        println!("[Modpack Verify] ✗ Downloaded but still corrupted {}: {}", filename, e);
                                        fs::remove_file(&mod_path).ok();
                                        progress_callback(
                                            progress,
                                            format!(
                                                "✗ Failed: {} ({}/{})",
                                                filename,
                                                i + 1,
                                                missing_mods.len()
                                            ),
                                        );
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            failed_downloads += 1;
                            println!("[Modpack Verify] ✗ Failed to download {}: {}", filename, e);
                            progress_callback(
                                progress,
                                format!(
                                    "✗ Failed: {} ({}/{})",
                                    filename,
                                    i + 1,
                                    missing_mods.len()
                                ),
                            );
                            // Continue with other mods even if one fails
                        }
                    }
                } else {
                    failed_downloads += 1;
                    println!("[Modpack Verify] ✗ No download URL for {}", filename);
                }
            } else {
                failed_downloads += 1;
                println!("[Modpack Verify] ✗ No downloads array for {}", filename);
            }
        }

        // Cleanup
        fs::remove_dir_all(&temp_dir).ok();

        if failed_downloads > 0 {
            progress_callback(
                1.0,
                format!(
                    "⚠ Repaired {}/{} mods ({} failed)",
                    successful_downloads,
                    missing_mods.len(),
                    failed_downloads
                ),
            );
            println!(
                "[Modpack Verify] ⚠ Repair complete with errors: {} succeeded, {} failed",
                successful_downloads, failed_downloads
            );
        } else {
            progress_callback(1.0, format!("✓ Repaired {} mods!", successful_downloads));
            println!(
                "[Modpack Verify] ✓ Repair complete! Fixed {} mods",
                successful_downloads
            );
        }

        if let Ok(metadata_content) = fs::read_to_string(&metadata_path) {
            if let Ok(mut metadata) = serde_json::from_str::<serde_json::Value>(&metadata_content) {
                if let Some(object) = metadata.as_object_mut() {
                    object.insert(
                        "mod_count".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(total_mods as u64)),
                    );
                    object.insert(
                        "manifest_mod_count".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(total_mods as u64)),
                    );
                    let _ = fs::write(
                        &metadata_path,
                        serde_json::to_string_pretty(&metadata)
                            .unwrap_or_else(|_| metadata_content.clone()),
                    );
                }
            }
        }

        Ok(())
    }

    /// Quick check if modpack needs verification (has missing mods)
    pub fn needs_verification(&self, version_id: &str) -> bool {
        let instance_dir = self.game_dir.join("instances").join(version_id);
        let mods_dir = instance_dir.join("mods");

        if !mods_dir.exists() {
            return true;
        }

        // Check if metadata exists
        let modpack_version_dir = self.versions_dir.join(version_id);
        let metadata_path = modpack_version_dir.join("modpack-metadata.json");

        if !metadata_path.exists() {
            return false; // Not a modpack or no metadata
        }

        // Read expected mod count from metadata
        if let Ok(metadata_content) = fs::read_to_string(&metadata_path) {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&metadata_content) {
                let expected_count = metadata["manifest_mod_count"]
                    .as_u64()
                    .or_else(|| metadata["mod_count"].as_u64());

                if metadata["manifest_mod_count"].as_u64().is_none() {
                    println!(
                        "[Modpack Verify] {} uses legacy metadata - forcing one full verification",
                        version_id
                    );
                    return true;
                }

                if let Some(expected_count) = expected_count {
                    // Count actual valid mods (check if they're valid JAR files)
                    if let Ok(entries) = fs::read_dir(&mods_dir) {
                        let mut valid_count = 0;
                        let mut has_corrupted = false;

                        for entry in entries.filter_map(|e| e.ok()) {
                            let path = entry.path();
                            let name = path
                                .file_name()
                                .map(|value| value.to_string_lossy().to_ascii_lowercase())
                                .unwrap_or_default();

                            if name.ends_with(".jar") || name.ends_with(".jar.disabled") {
                                // Quick validation: check if file can be opened as ZIP
                                match fs::File::open(&path) {
                                    Ok(file) => match zip::ZipArchive::new(file) {
                                        Ok(_) => valid_count += 1,
                                        Err(_) => {
                                            println!(
                                                "[Modpack Verify] Corrupted JAR detected: {:?}",
                                                path.file_name()
                                            );
                                            has_corrupted = true;
                                        }
                                    },
                                    Err(_) => {
                                        has_corrupted = true;
                                    }
                                }
                            }
                        }

                        if has_corrupted || (valid_count as u64) < expected_count {
                            println!(
                                "[Modpack Verify] {} needs verification: valid={}/{}, corrupted={}",
                                version_id, valid_count, expected_count, has_corrupted
                            );
                            return true;
                        }
                    }
                }
            }
        }

        false
    }

    /// Fetch latest Fabric loader for a Minecraft version that meets minimum version requirement
    async fn fetch_latest_fabric_loader(
        &self,
        client: &reqwest::Client,
        mc_version: &str,
        min_version: Option<&str>,
    ) -> Result<String, String> {
        let loaders_url = format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}",
            mc_version
        );
        let loaders_response = client
            .get(&loaders_url)
            .header("User-Agent", "Block-Launcher/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Fabric loaders: {}", e))?;

        if !loaders_response.status().is_success() {
            return Err(format!(
                "Fabric API returned status: {}",
                loaders_response.status()
            ));
        }

        let loaders: Vec<serde_json::Value> = loaders_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Fabric loaders: {}", e))?;

        // If a minimum version is specified, filter loaders that meet it
        let suitable_loaders: Vec<&serde_json::Value> = if let Some(min_ver) = min_version {
            let min_parts: Vec<u32> = min_ver.split('.').filter_map(|s| s.parse().ok()).collect();

            loaders
                .iter()
                .filter(|l| {
                    if let Some(version_str) = l["loader"]["version"].as_str() {
                        let version_parts: Vec<u32> = version_str
                            .split('.')
                            .filter_map(|s| s.parse().ok())
                            .collect();

                        // Compare versions
                        if version_parts.len() >= 2 && min_parts.len() >= 2 {
                            if version_parts[0] > min_parts[0] {
                                return true;
                            } else if version_parts[0] == min_parts[0] {
                                if version_parts.get(1).unwrap_or(&0)
                                    > min_parts.get(1).unwrap_or(&0)
                                {
                                    return true;
                                } else if version_parts.get(1).unwrap_or(&0)
                                    == min_parts.get(1).unwrap_or(&0)
                                {
                                    return version_parts.get(2).unwrap_or(&0)
                                        >= min_parts.get(2).unwrap_or(&0);
                                }
                            }
                        }
                    }
                    false
                })
                .collect()
        } else {
            loaders.iter().collect()
        };

        if suitable_loaders.is_empty() {
            return Err(format!(
                "No Fabric loader found for Minecraft {} that meets minimum version requirement {}",
                mc_version,
                min_version.unwrap_or("(none)")
            ));
        }

        // Get the first stable loader from suitable loaders, or just the first one
        let selected_loader = suitable_loaders
            .iter()
            .find(|l| l["loader"]["stable"].as_bool().unwrap_or(false))
            .or_else(|| suitable_loaders.first())
            .ok_or_else(|| {
                format!(
                    "No suitable Fabric loaders found for Minecraft {}",
                    mc_version
                )
            })?;

        let loader_version = selected_loader["loader"]["version"]
            .as_str()
            .ok_or_else(|| "No loader version found".to_string())?;

        if let Some(min_ver) = min_version {
            println!(
                "[Modpack Install] Using Fabric loader {} (meets requirement: {})",
                loader_version, min_ver
            );
        } else {
            println!(
                "[Modpack Install] Using latest stable Fabric loader: {}",
                loader_version
            );
        }

        Ok(loader_version.to_string())
    }

    /// Fetch latest Forge version for a Minecraft version
    async fn fetch_latest_forge_version(
        &self,
        _client: &reqwest::Client,
        mc_version: &str,
    ) -> Result<String, String> {
        // Use existing get_forge_versions_for_mc method
        let forge_versions = self.get_forge_versions_for_mc(mc_version).await?;

        // Get the first recommended version, or the first version if no recommended
        let forge_info = forge_versions
            .iter()
            .find(|v| v.is_recommended)
            .or_else(|| forge_versions.first())
            .ok_or_else(|| format!("No Forge versions found for Minecraft {}", mc_version))?;

        println!(
            "[Modpack Install] Using Forge version: {}",
            forge_info.forge_version
        );
        Ok(forge_info.forge_version.clone())
    }
}

fn compare_modpack_version_ids(a: &str, b: &str) -> std::cmp::Ordering {
    extract_modpack_mc_version(a)
        .cmp(&extract_modpack_mc_version(b))
        .then_with(|| a.cmp(b))
}

fn extract_modpack_mc_version(version_id: &str) -> (u32, u32, u32) {
    let version = version_id.rsplit('-').next().unwrap_or(version_id);
    let mut parts = version
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());

    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

impl super::MinecraftLauncher {
    /// Clear modpack cache to force refresh
    pub fn clear_modpack_cache(&self) -> Result<(), String> {
        let cache_dir = self.game_dir.join("cache");

        // Clear modpacks cache
        let modpacks_cache = cache_dir.join("modpacks_cache.json");
        if modpacks_cache.exists() {
            fs::remove_file(&modpacks_cache).map_err(|e| e.to_string())?;
        }

        // Clear modpack versions cache
        let versions_cache_dir = cache_dir.join("modpack_versions");
        if versions_cache_dir.exists() {
            fs::remove_dir_all(&versions_cache_dir).map_err(|e| e.to_string())?;
        }

        println!("[Modpacks] Cache cleared");
        Ok(())
    }

    /// Get list of mods for a specific modpack version
    pub fn get_modpack_mods(&self, version_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let instance_dir = self.game_dir.join("instances").join(version_id);
        let mods_dir = instance_dir.join("mods");

        if !mods_dir.exists() {
            return Ok(vec![]);
        }

        let mut mods = Vec::new();

        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                // Skip non-JAR files
                if !filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
                    continue;
                }

                let is_enabled = filename.ends_with(".jar");
                let display_name = if is_enabled {
                    filename.trim_end_matches(".jar").to_string()
                } else {
                    filename.trim_end_matches(".jar.disabled").to_string()
                };

                // Get file size
                let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

                mods.push(serde_json::json!({
                    "filename": filename,
                    "display_name": display_name,
                    "enabled": is_enabled,
                    "size": size,
                    "path": path.to_string_lossy(),
                }));
            }
        }

        // Sort by name
        mods.sort_by(|a, b| {
            let a_name = a["display_name"].as_str().unwrap_or("");
            let b_name = b["display_name"].as_str().unwrap_or("");
            a_name.to_lowercase().cmp(&b_name.to_lowercase())
        });

        Ok(mods)
    }

    /// Toggle a mod (enable/disable) by renaming it
    pub fn toggle_mod(&self, version_id: &str, filename: &str) -> Result<bool, String> {
        let instance_dir = self.game_dir.join("instances").join(version_id);
        let mods_dir = instance_dir.join("mods");
        let mod_path = mods_dir.join(filename);

        if !mod_path.exists() {
            return Err(format!("Mod file not found: {}", filename));
        }

        let is_enabled = filename.ends_with(".jar");
        let new_filename = if is_enabled {
            format!("{}.disabled", filename)
        } else {
            filename.trim_end_matches(".disabled").to_string()
        };

        let new_path = mods_dir.join(&new_filename);

        fs::rename(&mod_path, &new_path).map_err(|e| format!("Failed to toggle mod: {}", e))?;

        println!(
            "[Mod Toggle] {} -> {} (enabled: {})",
            filename, new_filename, !is_enabled
        );
        Ok(!is_enabled)
    }
}
