use crate::{
    models::{SearchResult, Song},
    storage,
};

use reqwest::header::ACCEPT_ENCODING;

use std::{
    fs,
    io::{self, Cursor},
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::AppHandle;

fn youtube_video_id(value: &str) -> Option<String> {
    let url = reqwest::Url::parse(value).ok()?;
    let host = url.host_str()?;

    if host.contains("youtu.be") {
        return url
            .path_segments()?
            .next()
            .filter(|id| !id.is_empty())
            .map(str::to_string);
    }

    if host.contains("youtube.com") {
        if let Some(id) = url
            .query_pairs()
            .find(|(key, _)| key == "v")
            .map(|(_, value)| value.into_owned())
        {
            return Some(id);
        }

        let parts: Vec<_> = url.path_segments()?.collect();

        if matches!(parts.first(), Some(&"shorts") | Some(&"embed")) {
            return parts.get(1).map(|id| id.to_string());
        }
    }

    None
}

fn format_duration(total: u64) -> String {
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;

    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

fn youtube_duration(id: &str) -> Option<String> {
    let html = reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 Chrome/126 Safari/537.36",
        )
        .build()
        .ok()?
        .get(format!("https://www.youtube.com/watch?v={id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .ok()?;

    for marker in [
        "\"lengthSeconds\":\"",
        "\\\"lengthSeconds\\\":\\\"",
    ] {
        if let Some(start) = html.find(marker) {
            let digits: String = html[start + marker.len()..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();

            if let Ok(seconds) = digits.parse::<u64>() {
                return Some(format_duration(seconds));
            }
        }
    }

    None
}

// Hide command windows on Windows.
fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    command.creation_flags(0x08000000);

    command
}

pub fn dependency_paths(
    app: &AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let d = storage::tools_dir(app)?;

    Ok((
        d.join("yt-dlp.exe"),
        d.join("ffmpeg.exe"),
        d.join("ffprobe.exe"),
    ))
}

pub fn find_tool(
    app: &AppHandle,
    name: &str,
) -> Result<Option<PathBuf>, String> {
    let (y, f, p) = dependency_paths(app)?;

    let own = match name {
        "ytdlp" => y,
        "ffmpeg" => f,
        "ffprobe" => p,
        _ => return Err("Unknown dependency".into()),
    };

    if own.exists() {
        return Ok(Some(own));
    }

    let mut command = Command::new("where.exe");

    command.arg(match name {
        "ytdlp" => "yt-dlp.exe",
        "ffmpeg" => "ffmpeg.exe",
        _ => "ffprobe.exe",
    });

    let output = hidden(&mut command).output();

    if let Ok(out) = output {
        if out.status.success() {
            if let Some(line) =
                String::from_utf8_lossy(&out.stdout).lines().next()
            {
                let p = PathBuf::from(line.trim());

                if p.exists() {
                    return Ok(Some(p));
                }
            }
        }
    }

    Ok(None)
}

pub fn install(
    app: &AppHandle,
    name: &str,
) -> Result<(), String> {
    match name {
        "ytdlp" => {
            let bytes = download(
                "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            )?;

            if bytes.len() < 1_000_000 {
                return Err(
                    "The yt-dlp download was incomplete.".into()
                );
            }

            let (path, _, _) = dependency_paths(app)?;

            fs::write(path, bytes).map_err(|e| e.to_string())
        }

        "ffmpeg" => install_ffmpeg(app),

        _ => Err("Unknown dependency".into()),
    }
}

fn download(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::blocking::Client::builder()
        .user_agent("EclipsePhonePlayer/1.2")
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .header(ACCEPT_ENCODING, "identity")
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(response
        .bytes()
        .map_err(|e| {
            format!("Could not read the downloaded file: {e}")
        })?
        .to_vec())
}

fn install_ffmpeg(app: &AppHandle) -> Result<(), String> {
    let bytes = download(
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    )?;

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| {
            format!("The FFmpeg download was not a valid ZIP: {e}")
        })?;

    let tools = storage::tools_dir(app)?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| e.to_string())?;

        let name = Path::new(file.name())
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("");

        if name.eq_ignore_ascii_case("ffmpeg.exe")
            || name.eq_ignore_ascii_case("ffprobe.exe")
        {
            let mut out = fs::File::create(tools.join(name))
                .map_err(|e| e.to_string())?;

            io::copy(&mut file, &mut out)
                .map_err(|e| e.to_string())?;
        }
    }

    if !tools.join("ffmpeg.exe").exists()
        || !tools.join("ffprobe.exe").exists()
    {
        return Err(
            "FFmpeg or FFprobe was not found inside the downloaded package."
                .into(),
        );
    }

    Ok(())
}

// YouTube search using yt-dlp with IPv4 enabled.
pub fn search(
    app: &AppHandle,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    let exe = find_tool(app, "ytdlp")?
        .ok_or("yt-dlp is not installed")?;

    let template =
        "%(title)s\t%(uploader)s\t%(duration_string)s\t%(webpage_url)s\t%(thumbnail)s";

    let mut command = Command::new(exe);

    command.arg("--force-ipv4");

    command.args([
        format!("ytsearch15:{query}"),
        "--flat-playlist".into(),
        "--no-warnings".into(),
        "--encoding".into(),
        "utf-8".into(),
        "--print".into(),
        template.into(),
    ]);

    let output = hidden(&mut command)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(
            String::from_utf8_lossy(&output.stderr)
                .trim()
                .to_string(),
        );
    }

    let mut results = Vec::new();

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let f: Vec<_> = line.split('\t').collect();

        if f.len() < 4 {
            continue;
        }

        results.push(SearchResult {
            title: f[0].into(),
            channel: f[1].into(),
            length: if f[2] == "NA" {
                "—".into()
            } else {
                f[2].into()
            },
            url: f[3].into(),
            thumbnail: f
                .get(4)
                .map(|x| x.to_string())
                .filter(|x| x != "NA"),
        });
    }

    Ok(results)
}

// Retrieve metadata for YouTube and other supported URLs.
pub fn metadata(
    app: &AppHandle,
    url: &str,
) -> Result<SearchResult, String> {
    if !(url.starts_with("http://")
        || url.starts_with("https://"))
    {
        return Err(
            "Enter a complete http:// or https:// media URL."
                .into(),
        );
    }

    if let Some(id) = youtube_video_id(url) {
        let endpoint = format!(
            "https://www.youtube.com/oembed?url={}&format=json",
            urlencoding::encode(url)
        );

        let response = reqwest::blocking::Client::builder()
            .user_agent("EclipsePhonePlayer/1.5")
            .build()
            .map_err(|e| e.to_string())?
            .get(endpoint)
            .send()
            .map_err(|e| format!("Could not contact YouTube: {e}"))?
            .error_for_status()
            .map_err(|e| {
                format!("YouTube returned an error: {e}")
            })?;

        let body = response
            .text()
            .map_err(|e| {
                format!("Could not read YouTube's response: {e}")
            })?;

        let data: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| {
                format!("Could not understand YouTube's response: {e}")
            })?;

        return Ok(SearchResult {
            title: data["title"]
                .as_str()
                .unwrap_or("Untitled")
                .into(),
            channel: data["author_name"]
                .as_str()
                .unwrap_or("Unknown artist")
                .into(),
            length: youtube_duration(&id)
                .unwrap_or_else(|| "—".into()),
            url: format!(
                "https://www.youtube.com/watch?v={id}"
            ),
            thumbnail: data["thumbnail_url"]
                .as_str()
                .map(str::to_string)
                .or_else(|| {
                    Some(format!(
                        "https://i.ytimg.com/vi/{id}/mqdefault.jpg"
                    ))
                }),
        });
    }

    let exe = find_tool(app, "ytdlp")?
        .ok_or("yt-dlp is not installed")?;

    let template =
        "%(title)s\t%(uploader)s\t%(duration_string)s\t%(webpage_url)s\t%(thumbnail)s";

    let mut command = Command::new(exe);

    // IPv4 fix for yt-dlp metadata extraction.
    command.arg("--force-ipv4");

    command.args([
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--encoding",
        "utf-8",
        "--print",
        template,
        url,
    ]);

    let output = hidden(&mut command)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string();

        return Err(if error.is_empty() {
            "Could not read information from that media URL."
                .into()
        } else {
            error
        });
    }

    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .to_string();

    let f: Vec<_> = line.split('\t').collect();

    if f.len() < 4 {
        return Err(
            "The media information response was incomplete.".into()
        );
    }

    Ok(SearchResult {
        title: f[0].into(),
        channel: if f[1] == "NA" {
            "Unknown artist".into()
        } else {
            f[1].into()
        },
        length: if f[2] == "NA" {
            "—".into()
        } else {
            f[2].into()
        },
        url: if f[3] == "NA" {
            url.into()
        } else {
            f[3].into()
        },
        thumbnail: f
            .get(4)
            .map(|x| x.to_string())
            .filter(|x| x != "NA"),
    })
}

// Enrich imported songs with metadata.
pub fn enrich_legacy_songs(
    app: &AppHandle,
    songs: &mut [Song],
) -> Result<(), String> {
    if find_tool(app, "ytdlp")?.is_none() {
        return Err(
            "Install yt-dlp from Downloads before importing an old MusicList.txt so song lengths can be retrieved."
                .into(),
        );
    }

    let imported_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    for song in songs.iter_mut() {
        if song.added_at.is_none() {
            song.added_at = Some(imported_at);
        }

        if song.length.trim().is_empty()
            || song.artwork.is_none()
        {
            if let Ok(info) = metadata(app, &song.url) {
                if song.length.trim().is_empty() {
                    song.length = info.length;

                    if song.length == "—" {
                        song.length.clear();
                    }
                }

                if song.artwork.is_none() {
                    song.artwork = info.thumbnail;
                }
            }
        }
    }

    Ok(())
}

// Download MP3 or MP4 using yt-dlp.
// IPv4 is forced to avoid IPv6-related connectivity failures.
// Actual yt-dlp errors are captured for troubleshooting.
pub fn download_media(
    app: &AppHandle,
    url: &str,
    kind: &str,
) -> Result<String, String> {
    let ytdlp = find_tool(app, "ytdlp")?
        .ok_or("yt-dlp is not installed")?;

    let settings = storage::load_settings(app)?;

    let root = if settings.download_folder.trim().is_empty() {
        storage::data_dir(app)?.join("Downloads")
    } else {
        PathBuf::from(settings.download_folder)
    };

    let target = root.join(
        if kind == "audio" {
            "Downloaded Audio"
        } else {
            "Downloaded Video"
        }
    );

    fs::create_dir_all(&target)
        .map_err(|e| e.to_string())?;

    let mut cmd = Command::new(ytdlp);

    cmd.args([
        "--force-ipv4",
        "--no-playlist",
        "--windows-filenames",
        "--no-warnings",
        "-P",
    ])
    .arg(&target)
    .args([
        "-o",
        "%(title).180B [%(id)s].%(ext)s",
    ]);

    if kind == "audio" {
        let ffmpeg = find_tool(app, "ffmpeg")?
            .ok_or("FFmpeg is required for MP3 downloads")?;

        cmd.args([
            "-f",
            "bestaudio",
            "--extract-audio",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--ffmpeg-location",
        ])
        .arg(ffmpeg);
    } else if let Some(ffmpeg) = find_tool(app, "ffmpeg")? {
        cmd.args([
            "-f",
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
            "--merge-output-format",
            "mp4",
            "--ffmpeg-location",
        ])
        .arg(ffmpeg);
    } else {
        cmd.args([
            "-f",
            "b[ext=mp4]/b",
        ]);
    }

    // Add the requested media URL.
    cmd.arg(url);

    // Capture output instead of returning only an exit code.
    let output = hidden(&mut cmd)
        .output()
        .map_err(|e| {
            format!("Could not start yt-dlp: {e}")
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        let details = if !stderr.trim().is_empty() {
            stderr.trim()
        } else if !stdout.trim().is_empty() {
            stdout.trim()
        } else {
            "No additional error information was provided."
        };

        return Err(format!(
            "Download failed (exit code {:?}):\n{}",
            output.status.code(),
            details
        ));
    }

    Ok(target.to_string_lossy().to_string())
}
