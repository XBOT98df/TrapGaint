use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Shared HTTP client for connection pooling - optimized for high-speed downloads
pub fn create_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("MinecraftLauncher/1.0")
        .timeout(std::time::Duration::from_secs(300)) // 5 min timeout for large files
        .connect_timeout(std::time::Duration::from_secs(15)) // Faster connect timeout
        .pool_max_idle_per_host(64) // More connections per host
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .tcp_nodelay(true) // Disable Nagle's algorithm for faster small packets
        .tcp_keepalive(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Create a high-performance client for bulk downloads
pub fn create_bulk_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("MinecraftLauncher/1.0")
        .timeout(std::time::Duration::from_secs(60))
        .connect_timeout(std::time::Duration::from_secs(10))
        .pool_max_idle_per_host(128) // Maximum connections for bulk downloads
        .pool_idle_timeout(std::time::Duration::from_secs(60))
        .tcp_nodelay(true)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Download task for parallel processing
#[derive(Clone)]
pub struct DownloadTask {
    pub url: String,
    pub path: PathBuf,
    pub fallback_urls: Vec<String>,
}

/// Download a single file with retries - optimized for speed
pub async fn download_file_with_client(
    client: &reqwest::Client,
    url: &str,
    path: &PathBuf,
) -> Result<(), String> {
    // Create parent directory if needed
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    // Get content length for pre-allocation
    let _content_length = response.content_length();

    // Use buffered writer for better I/O performance
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut writer = std::io::BufWriter::with_capacity(256 * 1024, file); // 256KB buffer

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        writer.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    writer.flush().map_err(|e| e.to_string())?;

    Ok(())
}

/// Download a file with retries and fallback URLs - faster retry logic
pub async fn download_with_retries(
    client: &reqwest::Client,
    task: &DownloadTask,
    max_retries: u32,
) -> Result<(), String> {
    // Skip if file already exists
    if task.path.exists() {
        return Ok(());
    }

    // Try primary URL first with minimal delay between retries
    for attempt in 0..max_retries {
        match download_file_with_client(client, &task.url, &task.path).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                if attempt < max_retries - 1 {
                    // Shorter delay: 50ms, 100ms, 150ms
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        50 * (attempt as u64 + 1),
                    ))
                    .await;
                } else {
                    // Try fallback URLs immediately without delay
                    for fallback_url in &task.fallback_urls {
                        match download_file_with_client(client, fallback_url, &task.path).await {
                            Ok(_) => return Ok(()),
                            Err(fallback_err) => {
                                // Log fallback failure but continue trying other fallbacks
                                println!(
                                    "[WARN] Fallback URL failed: {} - {}",
                                    fallback_url, fallback_err
                                );
                            }
                        }
                    }
                    // If all fallbacks failed, return the original error
                    return Err(format!(
                        "All download attempts failed for {}: {}",
                        task.url, e
                    ));
                }
            }
        }
    }

    Err("Max retries exceeded".to_string())
}

/// Progress callback type
pub type ProgressCallback<'a> = &'a (dyn Fn(f32, String) + Send + Sync);

/// Download multiple files in parallel with a concurrency limit - HIGH SPEED VERSION
pub async fn download_parallel<F>(
    tasks: Vec<DownloadTask>,
    max_concurrent: usize,
    progress_callback: F,
    base_progress: f32,
    progress_range: f32,
    progress_label: &str,
) -> (usize, usize)
where
    F: Fn(f32, String) + Send + Sync,
{
    if tasks.is_empty() {
        return (0, 0);
    }

    // Use bulk client for better connection pooling
    let client = Arc::new(create_bulk_client());
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let _total = tasks.len();
    let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let failed = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    // Filter out already existing files
    let tasks_to_download: Vec<_> = tasks.into_iter().filter(|t| !t.path.exists()).collect();
    let actual_total = tasks_to_download.len();

    if actual_total == 0 {
        progress_callback(
            base_progress + progress_range,
            format!("{} (all cached)", progress_label),
        );
        return (0, 0);
    }

    let mut handles = Vec::with_capacity(actual_total);

    for task in tasks_to_download {
        let client = Arc::clone(&client);
        let semaphore = Arc::clone(&semaphore);
        let completed = Arc::clone(&completed);
        let failed = Arc::clone(&failed);

        let handle = tokio::spawn(async move {
            // Add timeout per task to prevent individual downloads from hanging
            let download_future = async {
                let _permit = semaphore.acquire().await.unwrap();

                // Use 3 retries for better reliability
                download_with_retries(&client, &task, 3).await
            };

            // 60 second timeout per file
            let result =
                match tokio::time::timeout(std::time::Duration::from_secs(60), download_future)
                    .await
                {
                    Ok(r) => r,
                    Err(_) => {
                        println!("[WARN] Download timeout for: {}", task.url);
                        Err("Download timeout".to_string())
                    }
                };

            if result.is_err() {
                failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }

            completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            result
        });

        handles.push(handle);
    }

    // Update progress more frequently for better UX
    let mut last_reported = 0;
    loop {
        let current = completed.load(std::sync::atomic::Ordering::Relaxed);
        if current != last_reported {
            let progress =
                base_progress + (progress_range * (current as f32 / actual_total as f32));
            progress_callback(
                progress,
                format!("{} ({}/{})...", progress_label, current, actual_total),
            );
            last_reported = current;
        }

        if current >= actual_total {
            break;
        }

        // Faster progress updates (50ms instead of 100ms)
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }

    // Wait for all downloads to complete
    for handle in handles {
        let _ = handle.await;
    }

    let downloaded = actual_total - failed.load(std::sync::atomic::Ordering::Relaxed);
    let failed_count = failed.load(std::sync::atomic::Ordering::Relaxed);

    progress_callback(
        base_progress + progress_range,
        format!(
            "{} complete ({} downloaded, {} failed)",
            progress_label, downloaded, failed_count
        ),
    );

    (downloaded, failed_count)
}

/// Verify a file's SHA1 hash matches the expected hex string.
/// Returns true if the file exists, is non-empty, and its hash matches.
/// Returns false if the file is missing, empty, or has a different hash.
pub fn file_hash_matches(path: &PathBuf, expected_sha1_hex: &str) -> bool {
    match std::fs::File::open(path) {
        Ok(mut file) => {
            // Fast path: zero-byte files are always invalid (interrupted download stub).
            if let Ok(metadata) = file.metadata() {
                if metadata.len() == 0 {
                    return false;
                }
            }
            let mut hasher = Sha1::new();
            if std::io::copy(&mut file, &mut hasher).is_err() {
                return false;
            }
            let actual = format!("{:x}", hasher.finalize());
            actual.eq_ignore_ascii_case(expected_sha1_hex)
        }
        Err(_) => false,
    }
}

/// Download assets in parallel (optimized for many small files)
pub async fn download_assets_parallel<F>(
    objects: &serde_json::Map<String, serde_json::Value>,
    objects_dir: &PathBuf,
    progress_callback: F,
    base_progress: f32,
    progress_range: f32,
) -> (usize, usize)
where
    F: Fn(f32, String) + Send + Sync,
{
    let mut tasks = Vec::new();

    for (_name, obj) in objects.iter() {
        if let Some(hash) = obj["hash"].as_str() {
            let prefix = &hash[..2];
            let asset_dir = objects_dir.join(prefix);
            let asset_path = asset_dir.join(hash);

            // Only skip the download if the file already exists AND its SHA1 matches
            // the expected hash. An interrupted download (common on Windows due to
            // antivirus interference, network blips, or process kill) leaves a stub
            // file that the launcher previously treated as "done", causing
            // missing/corrupt textures on the home screen.
            if asset_path.exists() && file_hash_matches(&asset_path, hash) {
                continue;
            }

            // Stale/empty/corrupt file: remove it so the downloader starts clean.
            if asset_path.exists() {
                let _ = std::fs::remove_file(&asset_path);
            }

            let url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, hash
            );
            tasks.push(DownloadTask {
                url,
                path: asset_path,
                fallback_urls: vec![],
            });
        }
    }

    // Use HIGH concurrency for small asset files (32 concurrent downloads)
    download_parallel(
        tasks,
        32,
        progress_callback,
        base_progress,
        progress_range,
        "Downloading assets",
    )
    .await
}

/// Download libraries in parallel
pub async fn download_libraries_parallel<F>(
    libraries: &[&serde_json::Value],
    libraries_dir: &PathBuf,
    progress_callback: F,
    base_progress: f32,
    progress_range: f32,
) -> (usize, usize)
where
    F: Fn(f32, String) + Send + Sync,
{
    let mut tasks = Vec::new();

    // Determine current OS
    #[cfg(target_os = "windows")]
    let current_os = "windows";
    #[cfg(target_os = "macos")]
    let current_os = "osx";
    #[cfg(target_os = "linux")]
    let current_os = "linux";

    for lib in libraries {
        // Check rules
        let mut allowed = true;
        if let Some(rules) = lib.get("rules") {
            if let Some(rules_arr) = rules.as_array() {
                allowed = false;
                for rule in rules_arr {
                    let action = rule["action"].as_str().unwrap_or("allow");
                    if let Some(os) = rule.get("os") {
                        if let Some(name) = os["name"].as_str() {
                            if name == current_os && action == "allow" {
                                allowed = true;
                            } else if name == current_os && action == "disallow" {
                                allowed = false;
                                break;
                            }
                        }
                    } else if action == "allow" {
                        allowed = true;
                    }
                }
            }
        }

        if !allowed {
            continue;
        }

        // New format: downloads.artifact
        if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
            if let (Some(url), Some(path)) = (artifact["url"].as_str(), artifact["path"].as_str()) {
                // Convert forward slashes to platform-specific path separators
                let normalized_path = path.replace('/', std::path::MAIN_SEPARATOR_STR);
                let lib_path = libraries_dir.join(&normalized_path);
                if !lib_path.exists() {
                    tasks.push(DownloadTask {
                        url: url.to_string(),
                        path: lib_path,
                        fallback_urls: vec![],
                    });
                }
            }
        }
        // Old format: Maven coordinates
        else if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
            let parts: Vec<&str> = name.split(':').collect();
            if parts.len() >= 3 {
                let group = parts[0].replace('.', "/");
                let artifact = parts[1];
                let version = parts[2];
                let classifier = parts.get(3).map(|s| *s);

                let jar_name = if let Some(cls) = classifier {
                    format!("{}-{}-{}.jar", artifact, version, cls)
                } else {
                    format!("{}-{}.jar", artifact, version)
                };

                let lib_path = libraries_dir
                    .join(&group)
                    .join(artifact)
                    .join(version)
                    .join(&jar_name);

                if !lib_path.exists() {
                    let base_url = lib.get("url").and_then(|u| u.as_str()).unwrap_or("");
                    let primary_url = format!(
                        "{}{}/{}/{}/{}",
                        base_url, group, artifact, version, jar_name
                    );

                    let fallback_urls = vec![
                        format!(
                            "https://maven.fabricmc.net/{}/{}/{}/{}",
                            group, artifact, version, jar_name
                        ),
                        format!(
                            "https://libraries.minecraft.net/{}/{}/{}/{}",
                            group, artifact, version, jar_name
                        ),
                        format!(
                            "https://maven.minecraftforge.net/{}/{}/{}/{}",
                            group, artifact, version, jar_name
                        ),
                    ];

                    tasks.push(DownloadTask {
                        url: if primary_url.starts_with("http") {
                            primary_url
                        } else {
                            fallback_urls[0].clone()
                        },
                        path: lib_path,
                        fallback_urls,
                    });
                }
            }
        }
    }

    // Use higher concurrency for libraries (16 concurrent downloads)
    download_parallel(
        tasks,
        16,
        progress_callback,
        base_progress,
        progress_range,
        "Downloading libraries",
    )
    .await
}
