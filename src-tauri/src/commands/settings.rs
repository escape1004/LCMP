use crate::database::get_connection;

#[tauri::command]
pub async fn get_table_columns() -> Result<Vec<String>, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    
    let columns_result = stmt
        .query_row(["table_columns"], |row| {
            let value: String = row.get(0)?;
            Ok(value)
        });
    
    match columns_result {
        Ok(value_str) => {
            // JSON 배열로 저장된 컬럼 목록 파싱
            let columns: Vec<String> = serde_json::from_str(&value_str)
                .map_err(|e| format!("Failed to parse columns: {}", e))?;
            Ok(columns)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // 저장된 설정이 없으면 기본값 반환: 제목, 아티스트, 앨범, 재생시간
            Ok(vec!["title".to_string(), "artist".to_string(), "album".to_string(), "duration".to_string()])
        }
        Err(e) => Err(format!("Failed to get table columns: {}", e)),
    }
}

#[tauri::command]
pub async fn set_table_columns(columns: Vec<String>) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // JSON 배열로 저장
    let value_str = serde_json::to_string(&columns)
        .map_err(|e| format!("Failed to serialize columns: {}", e))?;
    
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        ["table_columns", &value_str],
    )
    .map_err(|e| format!("Failed to save table columns: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_table_column_widths() -> Result<std::collections::HashMap<String, i32>, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    
    let widths_result = stmt
        .query_row(["table_column_widths"], |row| {
            let value: String = row.get(0)?;
            Ok(value)
        });
    
    match widths_result {
        Ok(value_str) => {
            // JSON 객체로 저장된 컬럼 너비 파싱
            let widths: std::collections::HashMap<String, i32> = serde_json::from_str(&value_str)
                .map_err(|e| format!("Failed to parse column widths: {}", e))?;
            Ok(widths)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // 저장된 설정이 없으면 빈 맵 반환
            Ok(std::collections::HashMap::new())
        }
        Err(e) => Err(format!("Failed to get table column widths: {}", e)),
    }
}

#[tauri::command]
pub async fn set_table_column_widths(widths: std::collections::HashMap<String, i32>) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    // JSON 객체로 저장
    let value_str = serde_json::to_string(&widths)
        .map_err(|e| format!("Failed to serialize column widths: {}", e))?;
    
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        ["table_column_widths", &value_str],
    )
    .map_err(|e| format!("Failed to save table column widths: {}", e))?;
    
    Ok(())
}