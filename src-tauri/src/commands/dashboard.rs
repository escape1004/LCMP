use rusqlite::{params, Connection};
use serde::Serialize;

use crate::database::get_connection;

#[derive(Serialize)]
pub struct DashboardDateCount {
    pub label: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct DashboardSongStat {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub file_path: String,
    pub play_count: i64,
}

#[derive(Serialize)]
pub struct DashboardRecentSong {
    pub id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DashboardNamedCount {
    pub name: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct DashboardTagUsage {
    pub name: String,
    pub song_count: i64,
}

#[derive(Serialize)]
pub struct DashboardPlaylistCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct DashboardFolderCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct DashboardStats {
    pub total_song_count: i64,
    pub total_duration_seconds: f64,
    pub total_size_bytes: i64,
    pub date_counts: Vec<DashboardDateCount>,
    pub top_songs: Vec<DashboardSongStat>,
    pub recent_songs: Vec<DashboardRecentSong>,
    pub top_artists: Vec<DashboardNamedCount>,
    pub top_tags: Vec<DashboardNamedCount>,
    pub top_playlists: Vec<DashboardPlaylistCount>,
    pub top_folders: Vec<DashboardFolderCount>,
    pub artist_most_played: Option<DashboardNamedCount>,
    pub artist_least_played: Option<DashboardNamedCount>,
    pub tag_most_played: Option<DashboardNamedCount>,
    pub tag_least_played: Option<DashboardNamedCount>,
    pub tag_most_used: Option<DashboardNamedCount>,
    pub tag_least_used: Option<DashboardNamedCount>,
    pub tag_usage: Vec<DashboardTagUsage>,
}

fn get_total_size(conn: &Connection) -> i64 {
    let mut total: i64 = 0;
    let mut stmt = match conn.prepare("SELECT file_path FROM songs") {
        Ok(stmt) => stmt,
        Err(_) => return 0,
    };

    if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
        for path_result in rows.flatten() {
            if let Ok(metadata) = std::fs::metadata(&path_result) {
                total += metadata.len() as i64;
            }
        }
    }

    total
}

fn get_date_counts(conn: &Connection, unit: &str) -> Vec<DashboardDateCount> {
    let sql = match unit {
        "month" => {
            "WITH RECURSIVE months(m) AS (
                SELECT date('now','start of month','-11 months')
                UNION ALL
                SELECT date(m,'+1 month') FROM months WHERE m < date('now','start of month')
            )
            SELECT strftime('%Y-%m', m) AS bucket,
                   COALESCE(COUNT(ph.id), 0) AS cnt
            FROM months
            LEFT JOIN play_history ph
              ON strftime('%Y-%m', ph.played_at) = strftime('%Y-%m', m)
            GROUP BY m
            ORDER BY m ASC"
        }
        "year" => {
            "WITH RECURSIVE years(y) AS (
                SELECT date('now','start of year','-4 years')
                UNION ALL
                SELECT date(y,'+1 year') FROM years WHERE y < date('now','start of year')
            )
            SELECT strftime('%Y', y) AS bucket,
                   COALESCE(COUNT(ph.id), 0) AS cnt
            FROM years
            LEFT JOIN play_history ph
              ON strftime('%Y', ph.played_at) = strftime('%Y', y)
            GROUP BY y
            ORDER BY y ASC"
        }
        _ => {
            "WITH RECURSIVE days(d) AS (
                SELECT date('now','-29 days')
                UNION ALL
                SELECT date(d,'+1 day') FROM days WHERE d < date('now')
            )
            SELECT strftime('%Y-%m-%d', d) AS bucket,
                   COALESCE(COUNT(ph.id), 0) AS cnt
            FROM days
            LEFT JOIN play_history ph
              ON date(ph.played_at) = d
            GROUP BY d
            ORDER BY d ASC"
        }
    };

    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let mut out = Vec::new();
    if let Ok(rows) = stmt.query_map([], |row| {
        let label: String = row.get(0)?;
        let count: i64 = row.get(1)?;
        Ok(DashboardDateCount { label, count })
    }) {
        for row in rows.flatten() {
            out.push(row);
        }
    }
    out
}

#[tauri::command]
pub async fn record_queue_event(
    source_type: String,
    source_id: i64,
    song_count: i64,
) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO queue_events (source_type, source_id, song_count, created_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
        params![source_type, source_id, song_count],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_dashboard_stats(date_unit: String) -> Result<DashboardStats, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;

    let total_song_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM songs", [], |row| row.get(0))
        .unwrap_or(0);

    let total_duration_seconds: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration), 0) FROM songs",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    let total_size_bytes = get_total_size(&conn);

    let date_counts = get_date_counts(&conn, date_unit.as_str());

    let mut top_songs = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT s.id, s.title, s.artist, s.file_path, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN songs s ON s.id = ph.song_id
         GROUP BY ph.song_id
         ORDER BY play_count DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardSongStat {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                file_path: row.get(3)?,
                play_count: row.get(4)?,
            })
        }) {
            top_songs = rows.flatten().collect();
        }
    }

    let mut recent_songs = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, title, artist, created_at
         FROM songs
         ORDER BY datetime(created_at) DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardRecentSong {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                created_at: row.get(3)?,
            })
        }) {
            recent_songs = rows.flatten().collect();
        }
    }

    let mut top_artists = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(s.artist, '알 수 없음') as artist, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN songs s ON s.id = ph.song_id
         GROUP BY artist
         ORDER BY play_count DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            top_artists = rows.flatten().collect();
        }
    }

    let mut top_tags = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.name, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN song_tags st ON st.song_id = ph.song_id
         JOIN tags t ON t.id = st.tag_id
         GROUP BY t.id
         ORDER BY play_count DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            top_tags = rows.flatten().collect();
        }
    }

    let mut top_playlists = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT p.id, p.name, COUNT(q.id) as cnt
         FROM queue_events q
         JOIN playlists p ON p.id = q.source_id
         WHERE q.source_type = 'playlist'
         GROUP BY q.source_id
         ORDER BY cnt DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardPlaylistCount {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
            })
        }) {
            top_playlists = rows.flatten().collect();
        }
    }

    let mut top_folders = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT f.id, COALESCE(f.name, f.path) as name, COUNT(q.id) as cnt
         FROM queue_events q
         JOIN folders f ON f.id = q.source_id
         WHERE q.source_type = 'folder'
         GROUP BY q.source_id
         ORDER BY cnt DESC
         LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardFolderCount {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
            })
        }) {
            top_folders = rows.flatten().collect();
        }
    }

    let mut artist_most_played = None;
    let mut artist_least_played = None;
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(s.artist, '알 수 없음') as artist, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN songs s ON s.id = ph.song_id
         GROUP BY artist
         HAVING COUNT(ph.id) > 0
         ORDER BY play_count DESC
         LIMIT 1",
    ) {
        if let Ok(row) = stmt.query_row([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            artist_most_played = Some(row);
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(s.artist, '알 수 없음') as artist, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN songs s ON s.id = ph.song_id
         GROUP BY artist
         HAVING COUNT(ph.id) > 0
         ORDER BY play_count ASC
         LIMIT 1",
    ) {
        if let Ok(row) = stmt.query_row([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            artist_least_played = Some(row);
        }
    }

    let mut tag_most_played = None;
    let mut tag_least_played = None;
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.name, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN song_tags st ON st.song_id = ph.song_id
         JOIN tags t ON t.id = st.tag_id
         GROUP BY t.id
         HAVING COUNT(ph.id) > 0
         ORDER BY play_count DESC
         LIMIT 1",
    ) {
        if let Ok(row) = stmt.query_row([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            tag_most_played = Some(row);
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.name, COUNT(ph.id) as play_count
         FROM play_history ph
         JOIN song_tags st ON st.song_id = ph.song_id
         JOIN tags t ON t.id = st.tag_id
         GROUP BY t.id
         HAVING COUNT(ph.id) > 0
         ORDER BY play_count ASC
         LIMIT 1",
    ) {
        if let Ok(row) = stmt.query_row([], |row| {
            Ok(DashboardNamedCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }) {
            tag_least_played = Some(row);
        }
    }

    let mut tag_usage = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.name, COUNT(st.song_id) as song_count
         FROM tags t
         LEFT JOIN song_tags st ON st.tag_id = t.id
         GROUP BY t.id
         ORDER BY song_count DESC, t.name COLLATE NOCASE ASC",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(DashboardTagUsage {
                name: row.get(0)?,
                song_count: row.get(1)?,
            })
        }) {
            tag_usage = rows.flatten().collect();
        }
    }

    let tag_most_used = tag_usage.first().map(|tag| DashboardNamedCount {
        name: tag.name.clone(),
        count: tag.song_count,
    });
    let tag_least_used = tag_usage.last().map(|tag| DashboardNamedCount {
        name: tag.name.clone(),
        count: tag.song_count,
    });

    Ok(DashboardStats {
        total_song_count,
        total_duration_seconds,
        total_size_bytes,
        date_counts,
        top_songs,
        recent_songs,
        top_artists,
        top_tags,
        top_playlists,
        top_folders,
        artist_most_played,
        artist_least_played,
        tag_most_played,
        tag_least_played,
        tag_most_used,
        tag_least_used,
        tag_usage,
    })
}
