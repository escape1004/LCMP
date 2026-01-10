use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_database_path() -> Result<PathBuf, String> {
    // data 디렉토리 경로
    let mut db_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    db_path.push("data");
    db_path.push("database.db");
    Ok(db_path)
}

pub fn get_connection() -> Result<Connection, String> {
    let db_path = get_database_path()?;
    
    // data 디렉토리 생성
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    Ok(conn)
}
