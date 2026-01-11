use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub name: Option<String>,
    pub order: i64,
    pub added_at: String,
}

impl Folder {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Folder {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            order: row.get(3)?,
            added_at: row.get(4)?,
        })
    }
}

