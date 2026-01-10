use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // songs 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            duration REAL,
            year INTEGER,
            genre TEXT,
            album_art_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // tags 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // song_tags 테이블 (다대다 관계)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS song_tags (
            song_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (song_id, tag_id),
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // video_syncs 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_syncs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL UNIQUE,
            video_path TEXT NOT NULL,
            delay_ms INTEGER DEFAULT 0,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // folders 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            name TEXT,
            \"order\" INTEGER DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 기존 테이블에 order 컬럼 추가 (마이그레이션)
    conn.execute(
        "ALTER TABLE folders ADD COLUMN \"order\" INTEGER DEFAULT 0",
        [],
    ).ok(); // 이미 존재하면 무시

    // playlists 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_dynamic INTEGER DEFAULT 0,
            filter_tags TEXT,
            filter_mode TEXT DEFAULT 'OR',
            \"order\" INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 기존 테이블에 order 컬럼 추가 (마이그레이션)
    conn.execute(
        "ALTER TABLE playlists ADD COLUMN \"order\" INTEGER DEFAULT 0",
        [],
    ).ok(); // 이미 존재하면 무시

    // playlist_songs 테이블 (다대다 관계)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_songs (
            playlist_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, song_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // play_history 테이블 (재생 히스토리)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS play_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            play_duration REAL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 인덱스 생성
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_play_history_song_id ON play_history(song_id)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at)",
        [],
    )?;

    Ok(())
}
