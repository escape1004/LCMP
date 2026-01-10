use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub is_dynamic: i32, // 0: static, 1: dynamic
    pub filter_tags: Option<String>, // JSON array
    pub filter_mode: Option<String>, // "AND" or "OR"
    pub order: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Playlist {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            is_dynamic: row.get(3)?,
            filter_tags: row.get(4)?,
            filter_mode: row.get(5)?,
            order: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }
}
