use crate::database::get_connection;
use crate::models::Folder;
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
    
    // 폴더 내 오디오 파일 스캔 및 데이터베이스에 추가
    scan_folder_for_songs(&conn, &path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, path, name, \"order\", added_at FROM folders WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let folder = stmt
        .query_row([id], |row| Folder::from_row(row))
        .map_err(|e| e.to_string())?;
    
    Ok(folder)
}

// 폴더 내 오디오 파일을 재귀적으로 스캔하고 데이터베이스에 추가
// song.rs에서도 사용하므로 pub으로 공개
pub(crate) fn scan_folder_for_songs(conn: &rusqlite::Connection, folder_path: &str) -> Result<(), String> {
    // 지원하는 오디오 파일 확장자
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
        
        // 이미 존재하는지 확인
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM songs WHERE file_path = ?1)",
                [&file_path],
                |row| row.get(0),
            )
            .unwrap_or(false);
        
        if !exists {
            // 노래 추가 (메타데이터는 나중에 추출)
            let title = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("제목 없음")
                .to_string();
            let artist = "알 수 없음".to_string();
            let album = "알 수 없음".to_string();
            
            conn.execute(
                "INSERT OR IGNORE INTO songs (file_path, title, artist, album) VALUES (?1, ?2, ?3, ?4)",
                [&file_path, &title, &artist, &album],
            )
            .map_err(|e| format!("노래 추가 오류: {}", e))?;
        }
    }
    
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
    
    conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
