use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub album_art_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Song {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Song {
            id: row.get(0)?,
            file_path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            duration: row.get(5)?,
            year: row.get(6)?,
            genre: row.get(7)?,
            album_art_path: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }
}

