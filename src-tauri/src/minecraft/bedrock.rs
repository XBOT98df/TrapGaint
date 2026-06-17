use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

// Bedrock Edition - Downloads from MediaFire and installs to .dragon(bedrock)
const BEDROCK_EXE_URL: &str =
    "https://www.mediafire.com/file/pp8edu9y7k2hr3n/Minecraft.Windows.exe/file";
const BEDROCK_CONTENT_URL: &str = "https://www.mediafire.com/file/6gdfhcpwupyd0sb/Content.zip/file";
const BEDROCK_VERSION: &str = "1.21.13201";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BedrockVersionInfo {
    pub id: String,
    pub version: String,
    pub download_url: String,
    pub file_size: u64,
    pub is_installed: bool,
}

impl super::MinecraftLauncher {
    /// Get the Bedrock game directory (.dragon(bedrock) in app data)
    pub fn get_bedrock_game_dir(&self) -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(appdata).join(".dragon(bedrock)")
        }
        #[cfg(not(target_os = "windows"))]
        {
            // On macOS/Linux, use home directory
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".dragon(bedrock)")
        }
    }

    /// Check if Bedrock Edition is installed
    pub fn is_bedrock_installed(&self) -> bool {
        let bedrock_dir = self.get_bedrock_game_dir();
        // Check if Minecraft.Windows.exe exists in the bedrock directory (Windows only)
        #[cfg(target_os = "windows")]
        {
            bedrock_dir.join("Minecraft.Windows.exe").exists()
        }
        #[cfg(not(target_os = "windows"))]
        {
            // Bedrock is Windows-only
            bedrock_dir.join("Minecraft.Windows.exe").exists()
        }
    }

    /// Get available Bedrock versions
    pub async fn get_bedrock_versions(&self) -> Result<Vec<BedrockVersionInfo>, String> {
        let is_installed = self.is_bedrock_installed();

        Ok(vec![BedrockVersionInfo {
            id: format!("bedrock-{}", BEDROCK_VERSION),
            version: BEDROCK_VERSION.to_string(),
            download_url: BEDROCK_EXE_URL.to_string(), // Main executable URL
            file_size: 0,                              // Will be determined during download
            is_installed,
        }])
    }

    /// Get installed Bedrock versions
    pub fn get_installed_bedrock_versions(&self) -> Result<Vec<String>, String> {
        if self.is_bedrock_installed() {
            Ok(vec![format!("bedrock-{}", BEDROCK_VERSION)])
        } else {
            Ok(vec![])
        }
    }

    /// Extract direct download URL from MediaFire page
    async fn get_mediafire_direct_url(&self, page_url: &str) -> Result<String, String> {
        println!("[Bedrock] Fetching MediaFire page: {}", page_url);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(page_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch MediaFire page: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("MediaFire returned status: {}", response.status()));
        }

        let html = response
            .text()
            .await
            .map_err(|e| format!("Failed to read MediaFire page: {}", e))?;

        println!("[Bedrock] Received HTML page, length: {} bytes", html.len());

        // Look for the direct download link in the HTML
        // MediaFire uses data-href or href with download link containing "download"
        // Pattern: href="https://download*.mediafire.com/..."

        // Try to find the download button URL
        let patterns = [
            r#"href="(https://download[^"]+mediafire\.com[^"]+)""#,
            r#"aria-label="Download file"[^>]*href="([^"]+)""#,
            r#"id="downloadButton"[^>]*href="([^"]+)""#,
        ];

        for pattern in patterns {
            println!("[Bedrock] Trying pattern: {}", pattern);
            if let Ok(re) = regex::Regex::new(pattern) {
                if let Some(captures) = re.captures(&html) {
                    if let Some(url_match) = captures.get(1) {
                        let direct_url = url_match.as_str().to_string();
                        println!("[Bedrock] Found direct download URL: {}", direct_url);
                        return Ok(direct_url);
                    }
                }
            }
        }

        // Fallback: Look for any download link
        println!("[Bedrock] Trying fallback pattern");
        if let Ok(re) = regex::Regex::new(r#"(https://download\d*\.mediafire\.com/[^"'\s]+)"#) {
            if let Some(captures) = re.captures(&html) {
                if let Some(url_match) = captures.get(1) {
                    let direct_url = url_match.as_str().to_string();
                    println!("[Bedrock] Found fallback download URL: {}", direct_url);
                    return Ok(direct_url);
                }
            }
        }

        println!("[Bedrock] ERROR: Could not find download URL in HTML");
        Err("Could not find direct download URL in MediaFire page. The link may have expired or MediaFire changed their page structure.".to_string())
    }

    /// Install Bedrock Edition from MediaFire
    pub async fn install_bedrock<F>(
        &self,
        _version_id: &str,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, String) + Send + Sync,
    {
        progress_callback(0.0, "Preparing to download Bedrock Edition...".to_string());

        let bedrock_dir = self.get_bedrock_game_dir();

        // Create the directory if it doesn't exist
        fs::create_dir_all(&bedrock_dir)
            .map_err(|e| format!("Failed to create Bedrock directory: {}", e))?;

        // Step 1: Download Content.zip
        progress_callback(0.05, "Getting Content.zip download link...".to_string());
        let content_direct_url = self.get_mediafire_direct_url(BEDROCK_CONTENT_URL).await?;

        progress_callback(0.1, "Downloading Content.zip...".to_string());
        let temp_zip = bedrock_dir.join("Content.zip");
        self.download_mediafire_file(&content_direct_url, &temp_zip, |progress| {
            let adjusted_progress = 0.1 + progress * 0.3; // 10% to 40%
            progress_callback(
                adjusted_progress,
                format!("Downloading Content.zip... {:.0}%", progress * 100.0),
            );
        })
        .await?;

        println!("[Bedrock] Content.zip downloaded successfully");

        // Step 2: Extract Content.zip to bedrock directory
        progress_callback(0.4, "Extracting Content.zip...".to_string());

        let zip_file =
            fs::File::open(&temp_zip).map_err(|e| format!("Failed to open ZIP file: {}", e))?;

        let mut archive = zip::ZipArchive::new(zip_file)
            .map_err(|e| format!("Failed to read ZIP archive: {}", e))?;

        let total_files = archive.len();
        println!(
            "[Bedrock] Extracting {} files to {}...",
            total_files,
            bedrock_dir.display()
        );

        for i in 0..total_files {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read file from archive: {}", e))?;

            let outpath = match file.enclosed_name() {
                Some(path) => bedrock_dir.join(path),
                None => continue,
            };

            // Update progress
            let progress = 0.4 + (i as f32 / total_files as f32) * 0.25;
            if i % 100 == 0 {
                progress_callback(
                    progress,
                    format!("Extracting files... {}/{}", i, total_files),
                );
            }

            if file.name().ends_with('/') {
                // Directory
                fs::create_dir_all(&outpath).ok();
            } else {
                // File
                if let Some(parent) = outpath.parent() {
                    fs::create_dir_all(parent).ok();
                }

                let mut outfile = fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;

                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;
            }
        }

        // Clean up the temp ZIP file
        fs::remove_file(&temp_zip).ok();
        println!("[Bedrock] Content.zip extracted successfully");

        // Step 3: Download Minecraft.Windows.exe to bedrock directory
        progress_callback(
            0.65,
            "Getting Minecraft.Windows.exe download link...".to_string(),
        );
        let exe_direct_url = self.get_mediafire_direct_url(BEDROCK_EXE_URL).await?;

        progress_callback(0.7, "Downloading Minecraft.Windows.exe...".to_string());
        let exe_path = bedrock_dir.join("Minecraft.Windows.exe");
        self.download_mediafire_file(&exe_direct_url, &exe_path, |progress| {
            let adjusted_progress = 0.7 + progress * 0.25; // 70% to 95%
            progress_callback(
                adjusted_progress,
                format!(
                    "Downloading Minecraft.Windows.exe... {:.0}%",
                    progress * 100.0
                ),
            );
        })
        .await?;

        println!("[Bedrock] Minecraft.Windows.exe downloaded successfully");

        progress_callback(1.0, "Bedrock Edition installed successfully!".to_string());
        println!(
            "[Bedrock] Installation complete at: {}",
            bedrock_dir.display()
        );
        println!("[Bedrock] Launcher executable: {}", exe_path.display());

        Ok(())
    }

    /// Helper function to download a file from MediaFire with progress tracking
    async fn download_mediafire_file<F>(
        &self,
        direct_url: &str,
        output_path: &PathBuf,
        progress_callback: F,
    ) -> Result<(), String>
    where
        F: Fn(f32) + Send + Sync,
    {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600)) // 10 minutes for large files
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(direct_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let total_size = response.content_length().unwrap_or(0);
        println!(
            "[Bedrock] Downloading to {}: {} bytes",
            output_path.display(),
            total_size
        );

        let mut file =
            fs::File::create(output_path).map_err(|e| format!("Failed to create file: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        use futures_util::StreamExt;
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write chunk: {}", e))?;

            downloaded += chunk.len() as u64;

            if total_size > 0 {
                let progress = downloaded as f32 / total_size as f32;
                progress_callback(progress);
            }
        }

        drop(file); // Close the file handle
        println!("[Bedrock] Download complete: {} bytes", downloaded);

        Ok(())
    }

    /// Launch Bedrock Edition
    #[cfg(target_os = "windows")]
    pub async fn launch_bedrock(&self, _version_id: &str) -> Result<(), String> {
        let bedrock_dir = self.get_bedrock_game_dir();
        let launcher = bedrock_dir.join("Minecraft.Windows.exe");

        if !launcher.exists() {
            return Err("Bedrock Edition is not installed. Please install it first.".to_string());
        }

        println!("[Bedrock] Launching: {}", launcher.display());

        // Launch the executable from the bedrock directory
        std::process::Command::new(&launcher)
            .current_dir(&bedrock_dir)
            .spawn()
            .map_err(|e| format!("Failed to launch Bedrock Edition: {}", e))?;

        println!("[Bedrock] Minecraft Bedrock Edition launched successfully");
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    pub async fn launch_bedrock(&self, _version_id: &str) -> Result<(), String> {
        Err("Bedrock Edition can only be launched on Windows. Installation completed successfully for testing on macOS.".to_string())
    }
}
