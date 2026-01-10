use crate::database::get_connection;
use crate::models::Playlist;
use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistList {
    pub playlists: Vec<Playlist>,
}

#[tauri::command]
pub async fn get_playlists() -> Result<PlaylistList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, created_at, updated_at FROM playlists ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let playlist_iter = stmt
        .query_map([], |row| Playlist::from_row(row))
        .map_err(|e| e.to_string())?;
    
    let mut playlists = Vec::new();
    for playlist in playlist_iter {
        playlists.push(playlist.map_err(|e| e.to_string())?);
    }
    
    Ok(PlaylistList { playlists })
}

#[tauri::command]
pub async fn create_playlist(
    name: String,
    description: Option<String>,
    is_dynamic: Option<bool>,
) -> Result<Playlist, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let is_dynamic_value: i32 = if is_dynamic.unwrap_or(false) { 1 } else { 0 };
    let description_str = description.unwrap_or_default();
    
    conn.execute(
        "INSERT INTO playlists (name, description, is_dynamic) VALUES (?1, ?2, ?3)",
        params![name, description_str, is_dynamic_value],
    )
    .map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, created_at, updated_at FROM playlists WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let playlist = stmt
        .query_row([id], |row| Playlist::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(playlist)
}

#[tauri::command]
pub async fn update_playlist(
    playlist_id: i64,
    name: String,
    description: Option<String>,
    is_dynamic: Option<bool>,
) -> Result<Playlist, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let is_dynamic_value: i32 = if is_dynamic.unwrap_or(false) { 1 } else { 0 };
    let description_str = description.unwrap_or_default();
    
    conn.execute(
        "UPDATE playlists SET name = ?1, description = ?2, is_dynamic = ?3, updated_at = datetime('now') WHERE id = ?4",
        params![name, description_str, is_dynamic_value, playlist_id],
    )
    .map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, created_at, updated_at FROM playlists WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let playlist = stmt
        .query_row([playlist_id], |row| Playlist::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(playlist)
}

#[tauri::command]
pub async fn remove_playlist(playlist_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
