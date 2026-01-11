use crate::database::get_connection;
use crate::models::Song;
use crate::commands::folder::scan_folder_for_songs;
use rusqlite::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct SongList {
    pub songs: Vec<Song>,
}

#[tauri::command]
pub async fn get_songs_by_folder(folder_id: i64) -> Result<SongList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // 폴더 경로 가져오기
    let folder_path: String = conn
        .query_row(
            "SELECT path FROM folders WHERE id = ?1",
            [folder_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    
    // 폴더가 존재하는지 확인하고 스캔
    if Path::new(&folder_path).exists() {
        scan_folder_for_songs(&conn, &folder_path).map_err(|e| e.to_string())?;
    }
    
    // 폴더 경로 정규화 (Windows 경로 처리)
    let normalized_path = folder_path.replace("\\", "/");
    
    // 폴더 경로로 시작하는 노래들 가져오기
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at 
             FROM songs 
             WHERE REPLACE(file_path, '\\', '/') LIKE ?1 || '%' 
             ORDER BY title ASC"
        )
        .map_err(|e| e.to_string())?;
    
    let song_iter = stmt
        .query_map([&format!("{}%", normalized_path)], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    
    let mut songs = Vec::new();
    for song in song_iter {
        songs.push(song.map_err(|e| e.to_string())?);
    }
    
    Ok(SongList { songs })
}


#[tauri::command]
pub async fn get_songs_by_playlist(playlist_id: i64) -> Result<SongList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.file_path, s.title, s.artist, s.album, s.duration, s.year, s.genre, s.album_art_path, s.created_at, s.updated_at
             FROM songs s
             INNER JOIN playlist_songs ps ON s.id = ps.song_id
             WHERE ps.playlist_id = ?1
             ORDER BY ps.position ASC"
        )
        .map_err(|e| e.to_string())?;
    
    let song_iter = stmt
        .query_map([playlist_id], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    
    let mut songs = Vec::new();
    for song in song_iter {
        songs.push(song.map_err(|e| e.to_string())?);
    }
    
    Ok(SongList { songs })
}

#[tauri::command]
pub async fn get_all_songs() -> Result<SongList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at 
             FROM songs 
             ORDER BY title ASC"
        )
        .map_err(|e| e.to_string())?;
    
    let song_iter = stmt
        .query_map([], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    
    let mut songs = Vec::new();
    for song in song_iter {
        songs.push(song.map_err(|e| e.to_string())?);
    }
    
    Ok(SongList { songs })
}

