use crate::database::get_connection;
use crate::models::Folder;
use crate::commands::player::extract_metadata;
use crate::commands::song::{normalize_tags, set_song_tags};
use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderList {
    pub folders: Vec<Folder>,
}

#[tauri::command]
pub async fn get_folders() -> Result<FolderList, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, path, name, \"order\", added_at FROM folders ORDER BY \"order\" ASC, added_at DESC")
        .map_err(|e| e.to_string())?;
    
    let folder_iter = stmt
        .query_map([], |row| Folder::from_row(row))
        .map_err(|e| e.to_string())?;
    
    let mut folders = Vec::new();
    for folder in folder_iter {
        folders.push(folder.map_err(|e| e.to_string())?);
    }
    
    Ok(FolderList { folders })
}

#[tauri::command]
pub async fn add_folder(path: String, name: Option<String>) -> Result<Folder, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // 폴더 경로 확인
    if !Path::new(&path).exists() {
        return Err("폴더가 존재하지 않습니다".to_string());
    }
    
    // 기존 폴더 개수로 order 설정
    let folder_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM folders", [], |row| row.get(0))
        .unwrap_or(0);
    
    conn.execute(
        "INSERT INTO folders (path, name, \"order\") VALUES (?1, ?2, ?3)",
        params![path, name.unwrap_or_default(), folder_count],
    )
    .map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    
    // 폴더 내부 오디오 파일 스캔 및 DB 추가
    scan_folder_for_songs(&conn, &path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, path, name, \"order\", added_at FROM folders WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let folder = stmt
        .query_row([id], |row| Folder::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(folder)
}

// 폴더 내부 오디오 파일을 스캔해서 DB에 추가
// song.rs에서도 사용하므로 pub(crate)로 공개
pub(crate) fn scan_folder_for_songs(conn: &rusqlite::Connection, folder_path: &str) -> Result<(), String> {
    // 지원 가능한 오디오 확장자
    let audio_extensions = ["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "mp4", "m4v"];
    
    let walker = WalkDir::new(folder_path).into_iter();
    
    for entry in walker {
        let entry = entry.map_err(|e| format!("파일 스캔 오류: {}", e))?;
        let path = entry.path();
        
        // 파일인지 확인
        if !path.is_file() {
            continue;
        }
        
        // 확장자 확인
        if let Some(ext) = path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if !audio_extensions.contains(&ext_str.as_str()) {
                continue;
            }
        } else {
            continue;
        }
        
        // 파일 경로를 문자열로 변환
        let file_path = path.to_string_lossy().to_string();
        
        // DB에 존재하는지 확인
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM songs WHERE file_path = ?1)",
                [&file_path],
                |row| row.get(0),
            )
            .unwrap_or(false);
        
        if !exists {
            // 메타데이터 추출 시도
            let (title_meta, artist_meta, album_meta, year_meta, genre_meta, duration_meta, tags_meta) = 
                extract_metadata(&file_path).unwrap_or((None, None, None, None, None, None, Vec::new()));
            
            // 파일명에서 기본 제목 추출
            let default_title = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("제목 없음")
                .to_string();
            
            let title = title_meta.unwrap_or(default_title);
            let artist = artist_meta.unwrap_or_else(|| "아티스트 없음".to_string());
            let album = album_meta.unwrap_or_else(|| "앨범 없음".to_string());
            
            // 노래 추가
            conn.execute(
                "INSERT OR IGNORE INTO songs (file_path, title, artist, album, duration, year, genre) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![&file_path, &title, &artist, &album, &duration_meta, &year_meta, &genre_meta],
            )
            .map_err(|e| format!("노래 추가 오류: {}", e))?;

            if !tags_meta.is_empty() {
                let song_id: i64 = conn
                    .query_row(
                        "SELECT id FROM songs WHERE file_path = ?1",
                        [&file_path],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                if song_id != 0 {
                    let normalized = normalize_tags(tags_meta);
                    let _ = set_song_tags(conn, song_id, normalized);
                }
            }
        } else {
            // 기존 노래에 메타데이터가 없으면 업데이트 시도
            let (title_meta, artist_meta, album_meta, year_meta, genre_meta, duration_meta, tags_meta) = 
                extract_metadata(&file_path).unwrap_or((None, None, None, None, None, None, Vec::new()));
            
            if !tags_meta.is_empty() {
                let song_id: i64 = conn
                    .query_row(
                        "SELECT id FROM songs WHERE file_path = ?1",
                        [&file_path],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                if song_id != 0 {
                    let has_tags: bool = conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM song_tags WHERE song_id = ?1)",
                            [song_id],
                            |row| row.get(0),
                        )
                        .unwrap_or(false);
                    if !has_tags {
                        let normalized = normalize_tags(tags_meta.clone());
                        let _ = set_song_tags(conn, song_id, normalized);
                    }
                }
            }
            
            // 기존 노래 메타데이터가 "없음" 또는 NULL이면 업데이트
            let existing: Option<(Option<String>, Option<String>, Option<String>)> = conn
                .query_row(
                    "SELECT title, artist, album FROM songs WHERE file_path = ?1",
                    [&file_path],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .ok();
            
            let needs_update = if let Some((existing_title, existing_artist, existing_album)) = existing {
                (existing_title.is_none() || existing_title.as_deref() == Some("제목 없음")) ||
                (existing_artist.is_none() || existing_artist.as_deref() == Some("아티스트 없음")) ||
                (existing_album.is_none() || existing_album.as_deref() == Some("앨범 없음"))
            } else {
                false
            };
            
            if needs_update && (title_meta.is_some() || artist_meta.is_some() || album_meta.is_some() || 
               year_meta.is_some() || genre_meta.is_some() || duration_meta.is_some()) {
                // 기존 값과 병합
                let existing: (Option<String>, Option<String>, Option<String>, Option<i32>, Option<String>, Option<f64>) = conn
                    .query_row(
                        "SELECT title, artist, album, year, genre, duration FROM songs WHERE file_path = ?1",
                        [&file_path],
                        |row| Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                            row.get(5)?,
                        )),
                    )
                    .unwrap_or((None, None, None, None, None, None));
                
                let final_title = title_meta.or(existing.0);
                let final_artist = artist_meta.or(existing.1);
                let final_album = album_meta.or(existing.2);
                let final_year = year_meta.or(existing.3);
                let final_genre = genre_meta.or(existing.4);
                let final_duration = duration_meta.or(existing.5);
                
                conn.execute(
                    "UPDATE songs SET title = ?1, artist = ?2, album = ?3, year = ?4, genre = ?5, duration = ?6, updated_at = CURRENT_TIMESTAMP WHERE file_path = ?7",
                    params![&final_title, &final_artist, &final_album, &final_year, &final_genre, &final_duration, &file_path],
                )
                .map_err(|e| format!("메타데이터 업데이트 오류: {}", e))?;
            }
        }
    }
    
    // 스캔 완료 후 웨이브폼 없는 곡을 백그라운드에서 생성
    crate::commands::song::generate_waveforms_for_songs_without_waveform(conn);
    
    Ok(())
}

#[tauri::command]
pub async fn update_folder(folder_id: i64, name: Option<String>) -> Result<Folder, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE folders SET name = ?1 WHERE id = ?2",
        params![name.unwrap_or_default(), folder_id],
    )
    .map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, path, name, \"order\", added_at FROM folders WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let folder = stmt
        .query_row([folder_id], |row| Folder::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(folder)
}

#[tauri::command]
pub async fn update_folder_order(folder_ids: Vec<i64>) -> Result<(), String> {
    if folder_ids.is_empty() {
        return Ok(());
    }
    
    let mut conn = get_connection().map_err(|e| e.to_string())?;
    
    // 트랜잭션 시작
    let tx = conn.transaction().map_err(|e| format!("트랜잭션 시작 실패: {}", e))?;
    
    for (index, folder_id) in folder_ids.iter().enumerate() {
        tx.execute(
            "UPDATE folders SET \"order\" = ?1 WHERE id = ?2",
            params![index as i64, folder_id],
        )
        .map_err(|e| format!("폴더 순서 업데이트 실패 (id: {}, index: {}): {}", folder_id, index, e))?;
    }
    
    // 트랜잭션 커밋
    tx.commit().map_err(|e| format!("트랜잭션 커밋 실패: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn remove_folder(folder_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // 폴더 경로 가져오기
    let folder_path: String = conn
        .query_row(
            "SELECT path FROM folders WHERE id = ?1",
            [folder_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("폴더를 찾을 수 없습니다: {}", e))?;
    
    // 폴더 경로 정규화 (Windows 경로 처리)
    let normalized_path = folder_path.replace("\\", "/");
    
    // 해당 폴더 경로로 시작하는 모든 노래 삭제
    conn.execute(
        "DELETE FROM songs WHERE REPLACE(file_path, '\\', '/') LIKE ?1 || '%'",
        [&format!("{}%", normalized_path)],
    )
    .map_err(|e| format!("노래 삭제 실패: {}", e))?;
    
    // 폴더 삭제
    conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}


