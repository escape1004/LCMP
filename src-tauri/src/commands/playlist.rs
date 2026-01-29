use crate::database::get_connection;
use crate::models::Playlist;
use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistList {
    pub playlists: Vec<Playlist>,
}

#[tauri::command]
pub async fn get_playlists() -> Result<PlaylistList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, \"order\", created_at, updated_at FROM playlists ORDER BY \"order\" ASC, created_at DESC")
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
    filter_tags: Option<Vec<String>>,
    filter_mode: Option<String>,
) -> Result<Playlist, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let is_dynamic_value: i32 = if is_dynamic.unwrap_or(false) { 1 } else { 0 };
    let description_str = description.unwrap_or_default();
    let filter_tags_json = if is_dynamic_value == 1 {
        filter_tags
            .and_then(|tags| serde_json::to_string(&tags).ok())
            .or_else(|| Some("[]".to_string()))
    } else {
        None
    };
    let filter_mode_value = if is_dynamic_value == 1 {
        filter_mode.unwrap_or_else(|| "OR".to_string())
    } else {
        "OR".to_string()
    };
    
    // 기존 플레이리스트 개수로 order 설정
    let playlist_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM playlists", [], |row| row.get(0))
        .unwrap_or(0);
    
    conn.execute(
        "INSERT INTO playlists (name, description, is_dynamic, filter_tags, filter_mode, \"order\") VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            name,
            description_str,
            is_dynamic_value,
            filter_tags_json,
            filter_mode_value,
            playlist_count
        ],
    )
    .map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, \"order\", created_at, updated_at FROM playlists WHERE id = ?1")
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
    filter_tags: Option<Vec<String>>,
    filter_mode: Option<String>,
) -> Result<Playlist, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let is_dynamic_value: i32 = if is_dynamic.unwrap_or(false) { 1 } else { 0 };
    let description_str = description.unwrap_or_default();
    let filter_tags_json = if is_dynamic_value == 1 {
        filter_tags
            .and_then(|tags| serde_json::to_string(&tags).ok())
            .or_else(|| Some("[]".to_string()))
    } else {
        None
    };
    let filter_mode_value = if is_dynamic_value == 1 {
        filter_mode.unwrap_or_else(|| "OR".to_string())
    } else {
        "OR".to_string()
    };
    
    conn.execute(
        "UPDATE playlists SET name = ?1, description = ?2, is_dynamic = ?3, filter_tags = ?4, filter_mode = ?5, updated_at = datetime('now') WHERE id = ?6",
        params![
            name,
            description_str,
            is_dynamic_value,
            filter_tags_json,
            filter_mode_value,
            playlist_id
        ],
    )
    .map_err(|e| e.to_string())?;

    if is_dynamic_value == 1 {
        conn.execute(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
    }
    
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_dynamic, filter_tags, filter_mode, \"order\", created_at, updated_at FROM playlists WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let playlist = stmt
        .query_row([playlist_id], |row| Playlist::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(playlist)
}

#[tauri::command]
pub async fn update_playlist_order(playlist_ids: Vec<i64>) -> Result<(), String> {
    if playlist_ids.is_empty() {
        return Ok(());
    }
    
    let mut conn = get_connection().map_err(|e| e.to_string())?;
    
    // 트랜잭션 시작
    let tx = conn.transaction().map_err(|e| format!("트랜잭션 시작 실패: {}", e))?;
    
    for (index, playlist_id) in playlist_ids.iter().enumerate() {
        tx.execute(
            "UPDATE playlists SET \"order\" = ?1 WHERE id = ?2",
            params![index as i64, playlist_id],
        )
        .map_err(|e| format!("플레이리스트 순서 업데이트 실패 (id: {}, index: {}): {}", playlist_id, index, e))?;
    }
    
    // 트랜잭션 커밋
    tx.commit().map_err(|e| format!("트랜잭션 커밋 실패: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn remove_playlist(playlist_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn add_song_to_playlist(playlist_id: i64, song_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // 이미 추가되어 있는지 확인
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2)",
            params![playlist_id, song_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    
    if exists {
        return Err("이미 플레이리스트에 추가된 노래입니다.".to_string());
    }
    
    // 플레이리스트의 현재 노래 개수로 position 설정
    let position: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
        params![playlist_id, song_id, position],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn remove_song_from_playlist(playlist_id: i64, song_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    conn.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2",
        params![playlist_id, song_id],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
