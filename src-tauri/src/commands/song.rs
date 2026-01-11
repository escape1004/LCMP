use crate::database::get_connection;
use crate::models::Song;
use crate::commands::folder::scan_folder_for_songs;
use crate::commands::player::extract_waveform;
use rusqlite::Result;
use serde::{Deserialize, Serialize};
use serde_json;
use std::path::Path;
use std::fs;
use std::thread;
use std::sync::Mutex;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct SongList {
    pub songs: Vec<Song>,
}

// 현재 웨이폼 생성 중인 노래 ID를 추적하는 전역 상태
static GENERATING_WAVEFORM_SONG_ID: Mutex<Option<i64>> = Mutex::new(None);

// 웨이폼을 데이터베이스에 저장하는 함수
fn save_waveform_to_db(file_path: &str, waveform: &[f32]) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // JSON으로 직렬화
    let waveform_json = serde_json::to_string(waveform)
        .map_err(|e| format!("Failed to serialize waveform: {}", e))?;
    
    conn.execute(
        "UPDATE songs SET waveform_data = ?1 WHERE file_path = ?2",
        [&waveform_json, file_path],
    )
    .map_err(|e| format!("Failed to save waveform: {}", e))?;
    
    Ok(())
}

// 웨이폼이 없는 노래들을 백그라운드에서 생성하는 함수
pub(crate) fn generate_waveforms_for_songs_without_waveform(conn: &rusqlite::Connection) {
    // 이미 처리 중인 노래가 있으면 스킵
    if GENERATING_WAVEFORM_SONG_ID.lock().unwrap().is_some() {
        return;
    }
    
    // 웨이폼이 없는 노래들 찾기 (한 번에 1개씩만 처리하여 메모리 사용량 최소화)
    let mut stmt = match conn.prepare(
        "SELECT id, file_path FROM songs WHERE waveform_data IS NULL OR waveform_data = '' LIMIT 1"
    ) {
        Ok(stmt) => stmt,
        Err(_) => return,
    };
    
    let songs: Vec<(i64, String)> = match stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }) {
        Ok(iter) => {
            iter.filter_map(|r| r.ok()).collect()
        },
        Err(_) => return,
    };
    
    // 백그라운드 스레드에서 웨이폼 생성
    if !songs.is_empty() {
        let (song_id, file_path) = songs[0].clone();
        
        // 처리 시작 시 ID 설정
        *GENERATING_WAVEFORM_SONG_ID.lock().unwrap() = Some(song_id);
        
        thread::spawn(move || {
            // 파일이 존재하는지 확인
            if Path::new(&file_path).exists() {
                // 웨이폼 추출
                match tokio::runtime::Runtime::new() {
                    Ok(rt) => {
                        if let Ok(waveform) = rt.block_on(extract_waveform(file_path.clone(), 150)) {
                            // 데이터베이스에 저장
                            if let Err(e) = save_waveform_to_db(&file_path, &waveform) {
                                eprintln!("Failed to save waveform for {}: {}", file_path, e);
                            } else {
                                // 저장 성공 후 약간의 지연을 두고 상태 업데이트 (데이터베이스 커밋 보장)
                                thread::sleep(Duration::from_millis(100));
                            }
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to create runtime for waveform extraction: {}", e);
                    }
                }
            }
            
            // 처리 완료 시 ID 제거
            *GENERATING_WAVEFORM_SONG_ID.lock().unwrap() = None;
            
            // 다음 노래 처리 (재귀적으로 호출)
            if let Ok(conn) = get_connection() {
                generate_waveforms_for_songs_without_waveform(&conn);
            }
        });
    }
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
    // scan_folder_for_songs 내부에서 이미 웨이폼 생성을 호출하므로 여기서는 중복 호출하지 않음
    if Path::new(&folder_path).exists() {
        scan_folder_for_songs(&conn, &folder_path).map_err(|e| e.to_string())?;
    }
    
    // 폴더 경로 정규화 (Windows 경로 처리)
    let normalized_path = folder_path.replace("\\", "/");
    
    // 폴더 경로로 시작하는 노래들 가져오기
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at, waveform_data 
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
            "SELECT s.id, s.file_path, s.title, s.artist, s.album, s.duration, s.year, s.genre, s.album_art_path, s.created_at, s.updated_at, s.waveform_data
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
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at, waveform_data 
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

#[tauri::command]
pub async fn get_file_sizes(file_paths: Vec<String>) -> Result<Vec<(String, u64)>, String> {
    let mut results = Vec::new();
    
    for file_path in file_paths {
        match fs::metadata(&file_path) {
            Ok(metadata) => {
                results.push((file_path, metadata.len()));
            }
            Err(_) => {
                // 파일이 없거나 접근할 수 없으면 0으로 설정
                results.push((file_path, 0));
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_current_generating_waveform_song_id() -> Result<Option<i64>, String> {
    Ok(*GENERATING_WAVEFORM_SONG_ID.lock().unwrap())
}

#[tauri::command]
pub async fn get_song_by_id(song_id: i64) -> Result<Song, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at, waveform_data 
             FROM songs 
             WHERE id = ?1"
        )
        .map_err(|e| e.to_string())?;
    
    let song = stmt
        .query_row([song_id], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(song)
}
