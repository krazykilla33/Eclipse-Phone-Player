use crate::models::{Settings, Song};
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn tools_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("tools"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?; Ok(dir)
}

pub fn load_songs(app: &AppHandle) -> Result<Vec<Song>, String> {
    let path = data_dir(app)?.join("library.json");
    if !path.exists() { return Ok(Vec::new()); }
    serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn save_songs(app: &AppHandle, songs: &[Song]) -> Result<(), String> {
    atomic_json(&data_dir(app)?.join("library.json"), songs)
}

pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = data_dir(app)?.join("settings.json");
    if !path.exists() { return Ok(Settings::default()); }
    serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    atomic_json(&data_dir(app)?.join("settings.json"), settings)
}

fn atomic_json<T: serde::Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if path.exists() { let _ = fs::copy(path, path.with_extension("bak")); }
    fs::rename(temp, path).map_err(|e| e.to_string())
}

pub fn find_legacy_file() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() { if let Some(parent) = exe.parent() { candidates.push(parent.join("MusicList.txt")); candidates.push(parent.parent().unwrap_or(parent).join("MusicList.txt")); } }
    if let Ok(cwd) = std::env::current_dir() { candidates.push(cwd.join("MusicList.txt")); }
    candidates.into_iter().find(|p| p.exists())
}

pub fn import_csv(path: &Path) -> Result<Vec<Song>, String> {
    let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_path(path).map_err(|e| e.to_string())?;
    let mut songs = Vec::new();
    for record in reader.records() {
        let r = record.map_err(|e| e.to_string())?; if r.len() < 4 { continue; }
        let artist = r.get(0).unwrap_or("").trim().to_string(); let album = r.get(1).unwrap_or("").trim().to_string(); let title = r.get(2).unwrap_or("").trim().to_string(); let url = r.get(3).unwrap_or("").trim().to_string();
        if artist.is_empty() || title.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) { continue; }
        songs.push(Song { id:uuid::Uuid::new_v4().to_string(), artist, album, title, url, favorite:r.get(4).unwrap_or("0").trim()=="1", length:r.get(5).unwrap_or("").trim().to_string(), artwork:None });
    }
    Ok(songs)
}
