use crate::database::get_connection;
use crate::models::Song;
use crate::commands::folder::scan_folder_for_songs;
use crate::commands::player::{extract_metadata, extract_waveform};
use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};
use id3::TagLike;
use serde_json;
use std::path::{Path, PathBuf};
use std::fs;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::time::{Duration, SystemTime};
use tauri::api::path::cache_dir;
use std::thread;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Serialize, Deserialize)]
pub struct SongList {
    pub songs: Vec<Song>,
}

#[derive(Debug, Serialize)]
pub struct CachePruneResult {
    pub removed_files: usize,
    pub freed_bytes: u64,
    pub remaining_files: usize,
    pub remaining_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSync {
    pub song_id: i64,
    pub video_path: String,
    pub delay_ms: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSongMetadataPayload {
    pub song_id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub comment: Option<String>,
    pub album_art_path: Option<String>,
    pub composer: Option<String>,
    pub lyricist: Option<String>,
    pub bpm: Option<u32>,
    pub key: Option<String>,
    pub copyright: Option<String>,
    pub encoder: Option<String>,
    pub isrc: Option<String>,
    pub publisher: Option<String>,
    pub subtitle: Option<String>,
    pub grouping: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSongTagsPayload {
    pub song_id: i64,
    pub tags: Vec<String>,
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|val| {
        let trimmed = val.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub(crate) fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if seen.insert(key) {
            result.push(trimmed.to_string());
        }
    }
    result
}

fn fetch_song_tags(conn: &rusqlite::Connection, song_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.name
         FROM tags t
         INNER JOIN song_tags st ON st.tag_id = t.id
         WHERE st.song_id = ?1
         ORDER BY t.name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([song_id], |row| row.get(0))?;
    let mut tags = Vec::new();
    for tag in rows {
        tags.push(tag?);
    }
    Ok(tags)
}

pub(crate) fn set_song_tags(conn: &rusqlite::Connection, song_id: i64, tags: Vec<String>) -> Result<()> {
    conn.execute("DELETE FROM song_tags WHERE song_id = ?1", [song_id])?;
    if tags.is_empty() {
        conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM song_tags)", [])?;
        return Ok(());
    }
    for tag_name in tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            [&tag_name],
        )?;
        let tag_id: i64 = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            [&tag_name],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?1, ?2)",
            params![song_id, tag_id],
        )?;
    }
    conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM song_tags)", [])?;
    Ok(())
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Vec<String>, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let mut tags = Vec::new();
    for tag in rows {
        tags.push(tag.map_err(|e| e.to_string())?);
    }
    Ok(tags)
}

#[tauri::command]
pub async fn get_video_sync(song_id: i64) -> Result<Option<VideoSync>, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT song_id, video_path, delay_ms
             FROM video_syncs
             WHERE song_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([song_id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(VideoSync {
            song_id: row.get(0).map_err(|e| e.to_string())?,
            video_path: row.get(1).map_err(|e| e.to_string())?,
            delay_ms: row.get(2).map_err(|e| e.to_string())?,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn set_video_sync(song_id: i64, video_path: String, delay_ms: i64) -> Result<VideoSync, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO video_syncs (song_id, video_path, delay_ms)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(song_id) DO UPDATE SET
           video_path = excluded.video_path,
           delay_ms = excluded.delay_ms",
        params![song_id, video_path, delay_ms],
    )
    .map_err(|e| e.to_string())?;

    Ok(VideoSync { song_id, video_path, delay_ms })
}

#[tauri::command]
pub async fn update_video_sync_delay(song_id: i64, delay_ms: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE video_syncs SET delay_ms = ?1 WHERE song_id = ?2",
        params![delay_ms, song_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_video_sync(song_id: i64) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM video_syncs WHERE song_id = ?1", [song_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

type ExtractedMeta = (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<i32>,
    Option<String>,
    Option<f64>,
    Vec<String>,
);

static METADATA_CACHE: OnceLock<Mutex<HashMap<String, (u64, ExtractedMeta)>>> = OnceLock::new();

fn metadata_cache() -> &'static Mutex<HashMap<String, (u64, ExtractedMeta)>> {
    METADATA_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_file_mtime_seconds(file_path: &str) -> Option<u64> {
    let metadata = fs::metadata(file_path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(SystemTime::UNIX_EPOCH).ok()?;
    Some(duration.as_secs())
}

fn merge_file_metadata(song: &mut Song) -> Vec<String> {
    if !Path::new(&song.file_path).exists() {
        return Vec::new();
    }
    let mtime = match get_file_mtime_seconds(&song.file_path) {
        Some(value) => value,
        None => return Vec::new(),
    };

    let cached = {
        let cache = metadata_cache().lock().ok();
        cache.and_then(|map| map.get(&song.file_path).cloned())
    };

    let (title, artist, album, year, genre, duration, tags) = if let Some((cached_mtime, cached_meta)) = cached {
        if cached_mtime == mtime {
            cached_meta
        } else {
            let extracted = extract_metadata(&song.file_path).ok();
            if let Some(meta) = extracted {
                if let Ok(mut map) = metadata_cache().lock() {
                    map.insert(song.file_path.clone(), (mtime, meta.clone()));
                }
                meta
            } else {
                return Vec::new();
            }
        }
    } else {
        let extracted = extract_metadata(&song.file_path).ok();
        if let Some(meta) = extracted {
            if let Ok(mut map) = metadata_cache().lock() {
                map.insert(song.file_path.clone(), (mtime, meta.clone()));
            }
            meta
        } else {
            return Vec::new();
        }
    };

    if title.is_some() {
        song.title = title;
    }
    if artist.is_some() {
        song.artist = artist;
    }
    if album.is_some() {
        song.album = album;
    }
    if year.is_some() {
        song.year = year;
    }
    if genre.is_some() {
        song.genre = genre;
    }
    if duration.is_some() {
        song.duration = duration;
    }
    tags
}

fn guess_mime_type(path: &str) -> Option<&'static str> {
    let ext = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());
    
    match ext.as_deref() {
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("png") => Some("image/png"),
        Some("webp") => Some("image/webp"),
        Some("bmp") => Some("image/bmp"),
        _ => None,
    }
}

fn update_mp3_metadata(
    file_path: &str,
    title: &Option<String>,
    artist: &Option<String>,
    album: &Option<String>,
    year: Option<i32>,
    genre: &Option<String>,
    album_artist: &Option<String>,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    comment: &Option<String>,
    album_art_path: &Option<String>,
    composer: &Option<String>,
    lyricist: &Option<String>,
    bpm: Option<u32>,
    key: &Option<String>,
    copyright: &Option<String>,
    encoder: &Option<String>,
    isrc: &Option<String>,
    publisher: &Option<String>,
    subtitle: &Option<String>,
    grouping: &Option<String>,
    tags: &Option<Vec<String>>,
) -> Result<(), String> {
    use id3::frame::{Comment, Picture, PictureType, Content, Frame, ExtendedText};
    use id3::Tag;
    
    let mut tag = Tag::read_from_path(file_path).unwrap_or_else(|_| Tag::new());

    fn set_text_frame(tag: &mut Tag, frame_id: &str, value: &Option<String>) {
        tag.remove(frame_id);
        if let Some(text) = value.as_deref() {
            tag.add_frame(Frame::with_content(frame_id, Content::Text(text.to_string())));
        }
    }
    
    if let Some(value) = title.as_deref() {
        tag.set_title(value);
    } else {
        tag.remove("TIT2");
    }
    
    if let Some(value) = artist.as_deref() {
        tag.set_artist(value);
    } else {
        tag.remove("TPE1");
    }
    
    if let Some(value) = album.as_deref() {
        tag.set_album(value);
    } else {
        tag.remove("TALB");
    }
    
    if let Some(value) = album_artist.as_deref() {
        tag.set_album_artist(value);
    } else {
        tag.remove("TPE2");
    }
    
    if let Some(value) = year {
        tag.set_year(value);
    } else {
        tag.remove("TDRC");
        tag.remove("TYER");
    }
    
    if let Some(value) = genre.as_deref() {
        tag.set_genre(value);
    } else {
        tag.remove("TCON");
    }
    
    if let Some(value) = track_number {
        tag.set_track(value);
    } else {
        tag.remove("TRCK");
    }
    
    if let Some(value) = disc_number {
        tag.set_disc(value);
    } else {
        tag.remove("TPOS");
    }
    
    tag.remove("COMM");
    if let Some(value) = comment.as_deref() {
        tag.add_frame(Comment {
            lang: "eng".to_string(),
            description: String::new(),
            text: value.to_string(),
        });
    }
    
    let bpm_text = bpm.map(|v| v.to_string());
    set_text_frame(&mut tag, "TCOM", composer);
    set_text_frame(&mut tag, "TEXT", lyricist);
    set_text_frame(&mut tag, "TBPM", &bpm_text);
    set_text_frame(&mut tag, "TKEY", key);
    set_text_frame(&mut tag, "TCOP", copyright);
    set_text_frame(&mut tag, "TENC", encoder);
    set_text_frame(&mut tag, "TSRC", isrc);
    set_text_frame(&mut tag, "TPUB", publisher);
    set_text_frame(&mut tag, "TIT3", subtitle);
    set_text_frame(&mut tag, "TIT1", grouping);

    let existing_ext: Vec<(String, String)> = tag
        .extended_texts()
        .filter(|text| text.description != "LCMP_TAGS")
        .map(|text| (text.description.to_string(), text.value.to_string()))
        .collect();
    tag.remove("TXXX");
    for (description, value) in existing_ext {
        tag.add_frame(Frame::with_content(
            "TXXX",
            Content::ExtendedText(ExtendedText { description, value }),
        ));
    }
    if let Some(values) = tags {
        if values.is_empty() {
            // keep cleared
        } else if let Ok(json) = serde_json::to_string(values) {
            tag.add_frame(Frame::with_content(
                "TXXX",
                Content::ExtendedText(ExtendedText {
                    description: "LCMP_TAGS".to_string(),
                    value: json,
                }),
            ));
        }
    }
    
    tag.remove("USLT");
    
    if let Some(cover_path) = album_art_path.as_deref() {
        let mime_type = guess_mime_type(cover_path)
            .ok_or_else(|| "Unsupported cover image format".to_string())?;
        let image_data = fs::read(cover_path)
            .map_err(|e| format!("Failed to read cover image: {}", e))?;
        
        tag.remove_picture_by_type(PictureType::CoverFront);
        tag.add_frame(Picture {
            mime_type: mime_type.to_string(),
            picture_type: PictureType::CoverFront,
            description: String::new(),
            data: image_data,
        });
    }
    
    tag.write_to_path(file_path, id3::Version::Id3v24)
        .map_err(|e| format!("Failed to write ID3 tag: {}", e))?;
    
    Ok(())
}

fn update_mp3_tags_only(file_path: &str, tags: &[String]) -> Result<(), String> {
    use id3::frame::{Content, ExtendedText, Frame};
    use id3::Tag;

    let mut tag = Tag::read_from_path(file_path).unwrap_or_else(|_| Tag::new());

    let existing_ext: Vec<(String, String)> = tag
        .extended_texts()
        .filter(|text| text.description != "LCMP_TAGS")
        .map(|text| (text.description.to_string(), text.value.to_string()))
        .collect();
    tag.remove("TXXX");
    for (description, value) in existing_ext {
        tag.add_frame(Frame::with_content(
            "TXXX",
            Content::ExtendedText(ExtendedText { description, value }),
        ));
    }
    if !tags.is_empty() {
        let json = serde_json::to_string(tags).map_err(|e| e.to_string())?;
        tag.add_frame(Frame::with_content(
            "TXXX",
            Content::ExtendedText(ExtendedText {
                description: "LCMP_TAGS".to_string(),
                value: json,
            }),
        ));
    }

    tag.write_to_path(file_path, id3::Version::Id3v24)
        .map_err(|e| format!("Failed to write ID3 tag: {}", e))?;

    Ok(())
}

fn update_flac_metadata(
    file_path: &str,
    title: &Option<String>,
    artist: &Option<String>,
    album: &Option<String>,
    year: Option<i32>,
    genre: &Option<String>,
    album_artist: &Option<String>,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    comment: &Option<String>,
    album_art_path: &Option<String>,
    composer: &Option<String>,
    lyricist: &Option<String>,
    bpm: Option<u32>,
    key: &Option<String>,
    copyright: &Option<String>,
    encoder: &Option<String>,
    isrc: &Option<String>,
    publisher: &Option<String>,
    subtitle: &Option<String>,
    grouping: &Option<String>,
    tags: &Option<Vec<String>>,
) -> Result<(), String> {
    use metaflac::block::PictureType as FlacPictureType;
    
    let mut tag = metaflac::Tag::read_from_path(file_path)
        .map_err(|e| format!("Failed to read FLAC tag: {}", e))?;
    
    {
        let vorbis = tag.vorbis_comments_mut();
        
        if let Some(value) = title.as_deref() {
            vorbis.set_title(vec![value.to_string()]);
        } else {
            vorbis.comments.remove("TITLE");
        }
        
        if let Some(value) = artist.as_deref() {
            vorbis.set_artist(vec![value.to_string()]);
        } else {
            vorbis.comments.remove("ARTIST");
        }
        
        if let Some(value) = album.as_deref() {
            vorbis.set_album(vec![value.to_string()]);
        } else {
            vorbis.comments.remove("ALBUM");
        }
        
        if let Some(value) = album_artist.as_deref() {
            vorbis.set_album_artist(vec![value.to_string()]);
        } else {
            vorbis.comments.remove("ALBUMARTIST");
        }
        
        if let Some(value) = year {
            vorbis.comments.insert("DATE".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("DATE");
        }
        
        if let Some(value) = genre.as_deref() {
            vorbis.set_genre(vec![value.to_string()]);
        } else {
            vorbis.comments.remove("GENRE");
        }
        
        if let Some(value) = track_number {
            vorbis.set_track(value);
        } else {
            vorbis.comments.remove("TRACKNUMBER");
        }
        
        if let Some(value) = disc_number {
            vorbis.comments.insert("DISCNUMBER".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("DISCNUMBER");
        }
        
        if let Some(value) = comment.as_deref() {
            vorbis.comments.insert("COMMENT".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("COMMENT");
        }
        
        if let Some(value) = composer.as_deref() {
            vorbis.comments.insert("COMPOSER".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("COMPOSER");
        }
        
        if let Some(value) = lyricist.as_deref() {
            vorbis.comments.insert("LYRICIST".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("LYRICIST");
        }
        
        if let Some(value) = bpm {
            vorbis.comments.insert("BPM".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("BPM");
        }
        
        if let Some(value) = key.as_deref() {
            vorbis.comments.insert("KEY".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("KEY");
        }
        
        if let Some(value) = copyright.as_deref() {
            vorbis.comments.insert("COPYRIGHT".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("COPYRIGHT");
        }
        
        if let Some(value) = encoder.as_deref() {
            vorbis.comments.insert("ENCODER".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("ENCODER");
        }
        
        if let Some(value) = isrc.as_deref() {
            vorbis.comments.insert("ISRC".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("ISRC");
        }
        
        if let Some(value) = publisher.as_deref() {
            vorbis.comments.insert("PUBLISHER".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("PUBLISHER");
        }
        
        if let Some(value) = subtitle.as_deref() {
            vorbis.comments.insert("SUBTITLE".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("SUBTITLE");
        }
        
        if let Some(value) = grouping.as_deref() {
            vorbis.comments.insert("GROUPING".to_string(), vec![value.to_string()]);
        } else {
            vorbis.comments.remove("GROUPING");
        }

        if let Some(values) = tags {
            if values.is_empty() {
                vorbis.comments.remove("LCMP_TAGS");
            } else if let Ok(json) = serde_json::to_string(values) {
                vorbis.comments.insert("LCMP_TAGS".to_string(), vec![json]);
            }
        }
    }
    
    if let Some(cover_path) = album_art_path.as_deref() {
        let mime_type = guess_mime_type(cover_path)
            .ok_or_else(|| "Unsupported cover image format".to_string())?;
        let image_data = fs::read(cover_path)
            .map_err(|e| format!("Failed to read cover image: {}", e))?;
        
        tag.remove_picture_type(FlacPictureType::CoverFront);
        tag.add_picture(mime_type, FlacPictureType::CoverFront, image_data);
    }
    
    tag.write_to_path(file_path)
        .map_err(|e| format!("Failed to write FLAC tag: {}", e))?;
    
    Ok(())
}

fn update_flac_tags_only(file_path: &str, tags: &[String]) -> Result<(), String> {
    let mut tag = metaflac::Tag::read_from_path(file_path)
        .map_err(|e| format!("Failed to read FLAC tag: {}", e))?;
    {
        let vorbis = tag.vorbis_comments_mut();
        if tags.is_empty() {
            vorbis.comments.remove("LCMP_TAGS");
        } else {
            let json = serde_json::to_string(tags).map_err(|e| e.to_string())?;
            vorbis.comments.insert("LCMP_TAGS".to_string(), vec![json]);
        }
    }
    tag.write_to_path(file_path)
        .map_err(|e| format!("Failed to write FLAC tag: {}", e))?;
    Ok(())
}

fn pick_album_art_path(cache_root: &Path, cache_key: &str) -> Option<PathBuf> {
    let extensions = ["jpg", "jpeg", "png", "webp", "bmp"];
    for ext in extensions {
        let candidate = cache_root.join(format!("{}.{}", cache_key, ext));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/jpeg" | "image/jpg" => "jpg",
        _ => "jpg",
    }
}

fn compute_cache_key(file_path: &str) -> Result<String, String> {
    let metadata = fs::metadata(file_path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let modified_ms = modified.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_millis();
    let size = metadata.len();
    
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    size.hash(&mut hasher);
    modified_ms.hash(&mut hasher);
    let hash = hasher.finish();
    Ok(format!("{:016x}", hash))
}

fn extract_embedded_art_mp3(file_path: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    if let Ok(tag) = id3::Tag::read_from_path(file_path) {
        let mut cover = tag.pictures().find(|p| p.picture_type == id3::frame::PictureType::CoverFront);
        if cover.is_none() {
            cover = tag.pictures().next();
        }
        if let Some(picture) = cover {
            return Ok(Some((picture.data.clone(), picture.mime_type.clone())));
        }
    }
    Ok(None)
}

fn extract_embedded_art_flac(file_path: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    let tag = metaflac::Tag::read_from_path(file_path)
        .map_err(|e| format!("Failed to read FLAC tag: {}", e))?;
    let mut cover = tag.pictures().find(|p| p.picture_type == metaflac::block::PictureType::CoverFront);
    if cover.is_none() {
        cover = tag.pictures().next();
    }
    if let Some(picture) = cover {
        return Ok(Some((picture.data.clone(), picture.mime_type.clone())));
    }
    Ok(None)
}

fn get_cache_root() -> Option<PathBuf> {
    cache_dir().map(|root| root.join("lcmp").join("album_art"))
}

#[tauri::command]
pub async fn get_album_art_cache_path(file_path: String) -> Result<Option<String>, String> {
    if !Path::new(&file_path).exists() {
        return Ok(None);
    }
    
    let cache_root = if let Some(root) = get_cache_root() {
        root
    } else {
        return Ok(None);
    };
    
    fs::create_dir_all(&cache_root)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    
    let cache_key = compute_cache_key(&file_path)?;
    
    if let Some(existing) = pick_album_art_path(&cache_root, &cache_key) {
        return Ok(Some(existing.to_string_lossy().to_string()));
    }
    
    let extension = Path::new(&file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase());
    
    let extracted = match extension.as_deref() {
        Some("mp3") => extract_embedded_art_mp3(&file_path)?,
        Some("flac") => extract_embedded_art_flac(&file_path)?,
        _ => None,
    };
    
    if let Some((data, mime)) = extracted {
        let ext = extension_from_mime(&mime);
        let output_path = cache_root.join(format!("{}.{}", cache_key, ext));
        fs::write(&output_path, data)
            .map_err(|e| format!("Failed to write album art cache: {}", e))?;
        return Ok(Some(output_path.to_string_lossy().to_string()));
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn clear_album_art_cache() -> Result<CachePruneResult, String> {
    let cache_root = if let Some(root) = get_cache_root() {
        root
    } else {
        return Ok(CachePruneResult {
            removed_files: 0,
            freed_bytes: 0,
            remaining_files: 0,
            remaining_bytes: 0,
        });
    };
    
    if !cache_root.exists() {
        return Ok(CachePruneResult {
            removed_files: 0,
            freed_bytes: 0,
            remaining_files: 0,
            remaining_bytes: 0,
        });
    }
    
    let mut removed_files = 0usize;
    let mut freed_bytes = 0u64;
    
    let entries = fs::read_dir(&cache_root)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read cache entry: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            if let Ok(metadata) = entry.metadata() {
                freed_bytes += metadata.len();
            }
            if fs::remove_file(&path).is_ok() {
                removed_files += 1;
            }
        }
    }
    
    Ok(CachePruneResult {
        removed_files,
        freed_bytes,
        remaining_files: 0,
        remaining_bytes: 0,
    })
}

#[tauri::command]
pub async fn prune_album_art_cache(max_size_mb: Option<u64>, max_age_days: Option<u64>) -> Result<CachePruneResult, String> {
    let cache_root = if let Some(root) = get_cache_root() {
        root
    } else {
        return Ok(CachePruneResult {
            removed_files: 0,
            freed_bytes: 0,
            remaining_files: 0,
            remaining_bytes: 0,
        });
    };
    
    if !cache_root.exists() {
        return Ok(CachePruneResult {
            removed_files: 0,
            freed_bytes: 0,
            remaining_files: 0,
            remaining_bytes: 0,
        });
    }
    
    let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    let entries = fs::read_dir(&cache_root)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read cache entry: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| format!("Failed to read cache metadata: {}", e))?;
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        files.push((path, modified, metadata.len()));
    }
    
    let mut removed_files = 0usize;
    let mut freed_bytes = 0u64;
    
    if let Some(days) = max_age_days {
        let cutoff = SystemTime::now()
            .checked_sub(Duration::from_secs(days * 24 * 60 * 60))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        for (path, modified, size) in files.iter() {
            if *modified < cutoff {
                if fs::remove_file(path).is_ok() {
                    removed_files += 1;
                    freed_bytes += *size;
                }
            }
        }
    }
    
    let mut remaining: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    for (path, modified, size) in files.into_iter() {
        if path.exists() {
            remaining.push((path, modified, size));
        }
    }
    
    if let Some(max_mb) = max_size_mb {
        let max_bytes = max_mb.saturating_mul(1024 * 1024);
        remaining.sort_by_key(|(_, modified, _)| *modified);
        let mut total_bytes: u64 = remaining.iter().map(|(_, _, size)| *size).sum();
        
        for (path, _, size) in remaining.iter() {
            if total_bytes <= max_bytes {
                break;
            }
            if fs::remove_file(path).is_ok() {
                removed_files += 1;
                freed_bytes += *size;
                total_bytes = total_bytes.saturating_sub(*size);
            }
        }
    }
    
    let mut remaining_files = 0usize;
    let mut remaining_bytes = 0u64;
    if cache_root.exists() {
        let entries = fs::read_dir(&cache_root)
            .map_err(|e| format!("Failed to read cache directory: {}", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read cache entry: {}", e))?;
            if let Ok(metadata) = entry.metadata() {
                if entry.path().is_file() {
                    remaining_files += 1;
                    remaining_bytes += metadata.len();
                }
            }
        }
    }
    
    Ok(CachePruneResult {
        removed_files,
        freed_bytes,
        remaining_files,
        remaining_bytes,
    })
}

// 현재 웨이브폼 생성 중인 곡 ID를 추적하는 전역 상태
static GENERATING_WAVEFORM_SONG_ID: Mutex<Option<i64>> = Mutex::new(None);

// 웨이브폼을 DB에 저장하는 함수
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

// 웨이브폼이 없는 곡을 백그라운드에서 생성하는 함수
pub(crate) fn generate_waveforms_for_songs_without_waveform(conn: &rusqlite::Connection) {
    // 이미 처리 중인 곡이 있으면 스킵
    if GENERATING_WAVEFORM_SONG_ID.lock().unwrap().is_some() {
        return;
    }
    
    // 웨이브폼 없는 곡 찾기 (한 번에 1곡만 처리해 메모리 사용 최소화)
    // 제목 순서로 처리해 사용자에게 보이는 순서와 일치
    let mut stmt = match conn.prepare(
        "SELECT id, file_path FROM songs WHERE waveform_data IS NULL OR waveform_data = '' ORDER BY title ASC LIMIT 1"
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
    
    // 백그라운드 스레드에서 웨이브폼 생성
    if !songs.is_empty() {
        let (song_id, file_path) = songs[0].clone();
        
        // 처리 시작 시 ID 설정
        *GENERATING_WAVEFORM_SONG_ID.lock().unwrap() = Some(song_id);
        
        thread::spawn(move || {
            // 파일 존재 확인
            if Path::new(&file_path).exists() {
                // ?⑥씠??異붿텧
                match tokio::runtime::Runtime::new() {
                    Ok(rt) => {
                        if let Ok(waveform) = rt.block_on(extract_waveform(file_path.clone(), 150)) {
                            // DB에 저장
                            if let Err(e) = save_waveform_to_db(&file_path, &waveform) {
                                eprintln!("Failed to save waveform for {}: {}", file_path, e);
                            } else {
                                // 저장 성공 후 잠시 대기해 상태 업데이트 보장
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
            
            // 다음 곡 처리 (재귀 호출)
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
    
    // 폴더가 존재하면 스캔
    // scan_folder_for_songs 내부에서 웨이브폼 생성 호출을 하므로 중복 호출 방지
    if Path::new(&folder_path).exists() {
        scan_folder_for_songs(&conn, &folder_path).map_err(|e| e.to_string())?;
    }
    
    // 폴더 경로 정규화 (Windows 경로 처리)
    let normalized_path = folder_path.replace("\\", "/");
    
    // 폴더 경로로 시작하는 노래 가져오기
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
        let mut song = song.map_err(|e| e.to_string())?;
        let file_tags = merge_file_metadata(&mut song);
        let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
        if !db_tags.is_empty() {
            song.tags = db_tags;
        } else if !file_tags.is_empty() {
            song.tags = file_tags.clone();
            let _ = set_song_tags(&conn, song.id, file_tags);
        } else {
            song.tags = Vec::new();
        }
        songs.push(song);
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
        let mut song = song.map_err(|e| e.to_string())?;
        let file_tags = merge_file_metadata(&mut song);
        let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
        if !db_tags.is_empty() {
            song.tags = db_tags;
        } else if !file_tags.is_empty() {
            song.tags = file_tags.clone();
            let _ = set_song_tags(&conn, song.id, file_tags);
        } else {
            song.tags = Vec::new();
        }
        songs.push(song);
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
        let mut song = song.map_err(|e| e.to_string())?;
        let file_tags = merge_file_metadata(&mut song);
        let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
        if !db_tags.is_empty() {
            song.tags = db_tags;
        } else if !file_tags.is_empty() {
            song.tags = file_tags.clone();
            let _ = set_song_tags(&conn, song.id, file_tags);
        } else {
            song.tags = Vec::new();
        }
        songs.push(song);
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
                // 파일이 없거나 읽을 수 없으면 0으로 설정
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
    
    let mut song = stmt
        .query_row([song_id], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    let file_tags = merge_file_metadata(&mut song);
    let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
    if !db_tags.is_empty() {
        song.tags = db_tags;
    } else if !file_tags.is_empty() {
        song.tags = file_tags.clone();
        let _ = set_song_tags(&conn, song.id, file_tags);
    } else {
        song.tags = Vec::new();
    }
    
    Ok(song)
}

#[tauri::command]
pub async fn update_song_metadata(payload: UpdateSongMetadataPayload) -> Result<Song, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM songs WHERE id = ?1",
            [payload.song_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load song path: {}", e))?;
    
    if !Path::new(&file_path).exists() {
        return Err("파일이 존재하지 않습니다.".to_string());
    }
    
    let title = normalize_optional_string(payload.title);
    let artist = normalize_optional_string(payload.artist);
    let album = normalize_optional_string(payload.album);
    let genre = normalize_optional_string(payload.genre);
    let album_artist = normalize_optional_string(payload.album_artist);
    let comment = normalize_optional_string(payload.comment);
    let album_art_path = normalize_optional_string(payload.album_art_path);
    let composer = normalize_optional_string(payload.composer);
    let lyricist = normalize_optional_string(payload.lyricist);
    let key = normalize_optional_string(payload.key);
    let copyright = normalize_optional_string(payload.copyright);
    let encoder = normalize_optional_string(payload.encoder);
    let isrc = normalize_optional_string(payload.isrc);
    let publisher = normalize_optional_string(payload.publisher);
    let subtitle = normalize_optional_string(payload.subtitle);
    let grouping = normalize_optional_string(payload.grouping);
    let normalized_tags = payload.tags.map(normalize_tags);
    
    let extension = Path::new(&file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase());

    let ext = extension.as_deref().unwrap_or("");
    let supports_file_metadata = matches!(ext, "mp3" | "flac");
    if !supports_file_metadata {
        return Err(format!(
            "지원하지 않는 파일 확장자입니다. 파일 메타데이터는 mp3/flac만 지원합니다. (현재: {})",
            if ext.is_empty() { "확장자 없음" } else { ext }
        ));
    }
    
    match ext {
        "mp3" => {
            update_mp3_metadata(
                &file_path,
                &title,
                &artist,
                &album,
                payload.year,
                &genre,
                &album_artist,
                payload.track_number,
                payload.disc_number,
                &comment,
                &album_art_path,
                &composer,
                &lyricist,
                payload.bpm,
                &key,
                &copyright,
                &encoder,
                &isrc,
                &publisher,
                &subtitle,
                &grouping,
                &normalized_tags,
            )?;
        }
        "flac" => {
            update_flac_metadata(
                &file_path,
                &title,
                &artist,
                &album,
                payload.year,
                &genre,
                &album_artist,
                payload.track_number,
                payload.disc_number,
                &comment,
                &album_art_path,
                &composer,
                &lyricist,
                payload.bpm,
                &key,
                &copyright,
                &encoder,
                &isrc,
                &publisher,
                &subtitle,
                &grouping,
                &normalized_tags,
            )?;
        }
        _ => {}
    }
    
    conn.execute(
        "UPDATE songs 
         SET title = ?1, artist = ?2, album = ?3, year = ?4, genre = ?5, album_art_path = ?6, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?7",
        params![
            &title,
            &artist,
            &album,
            &payload.year,
            &genre,
            &album_art_path,
            payload.song_id
        ],
    )
    .map_err(|e| format!("Failed to update song metadata: {}", e))?;

    if let Some(tags) = normalized_tags {
        set_song_tags(&conn, payload.song_id, tags)
            .map_err(|e| format!("Failed to update song tags: {}", e))?;
    }
    
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at, waveform_data 
             FROM songs 
             WHERE id = ?1"
        )
        .map_err(|e| e.to_string())?;
    
    let mut song = stmt
        .query_row([payload.song_id], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;
    let file_tags = merge_file_metadata(&mut song);
    let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
    if !db_tags.is_empty() {
        song.tags = db_tags;
    } else if !file_tags.is_empty() {
        song.tags = file_tags.clone();
        let _ = set_song_tags(&conn, song.id, file_tags);
    } else {
        song.tags = Vec::new();
    }
    
    Ok(song)
}

#[tauri::command]
pub async fn update_song_tags(payload: UpdateSongTagsPayload) -> Result<Song, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;

    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM songs WHERE id = ?1",
            [payload.song_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load song path: {}", e))?;

    if !Path::new(&file_path).exists() {
        return Err("파일이 존재하지 않습니다.".to_string());
    }

    let normalized = normalize_tags(payload.tags);

    let extension = Path::new(&file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase());
    let ext = extension.as_deref().unwrap_or("");
    match ext {
        "mp3" => {
            update_mp3_tags_only(&file_path, &normalized)?;
        }
        "flac" => {
            update_flac_tags_only(&file_path, &normalized)?;
        }
        _ => {
            return Err(format!(
                "지원하지 않는 파일 확장자입니다. 파일 메타데이터는 mp3/flac만 지원합니다. (현재: {})",
                if ext.is_empty() { "확장자 없음" } else { ext }
            ));
        }
    }

    set_song_tags(&conn, payload.song_id, normalized)
        .map_err(|e| format!("Failed to update song tags: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, artist, album, duration, year, genre, album_art_path, created_at, updated_at, waveform_data 
             FROM songs 
             WHERE id = ?1"
        )
        .map_err(|e| e.to_string())?;

    let mut song = stmt
        .query_row([payload.song_id], |row| Song::from_row(row))
        .map_err(|e| e.to_string())?;

    let file_tags = merge_file_metadata(&mut song);
    let db_tags = fetch_song_tags(&conn, song.id).unwrap_or_default();
    if !db_tags.is_empty() {
        song.tags = db_tags;
    } else if !file_tags.is_empty() {
        song.tags = file_tags.clone();
        let _ = set_song_tags(&conn, song.id, file_tags);
    } else {
        song.tags = Vec::new();
    }

    Ok(song)
}


