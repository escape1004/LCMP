// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod models;

use database::{get_connection, run_migrations};
use commands::{
    get_folders, add_folder, update_folder, update_folder_order, remove_folder,
    get_playlists, create_playlist, update_playlist, update_playlist_order, remove_playlist,
    add_song_to_playlist, remove_song_from_playlist,
    get_songs_by_folder, get_songs_by_playlist, get_all_songs, get_song_by_id, update_song_metadata, update_song_tags, get_all_tags, get_album_art_cache_path, clear_album_art_cache, prune_album_art_cache,
    get_audio_duration, get_file_sizes, get_current_generating_waveform_song_id,
    play_audio, pause_audio, resume_audio, stop_audio, seek_audio, set_volume,
    get_saved_volume, extract_waveform,
    get_table_columns, set_table_columns,
    get_table_column_widths, set_table_column_widths,
    get_audio_format_info,
};

fn main() {
    // 데이터베이스 초기화
    match get_connection() {
        Ok(conn) => {
            if let Err(e) = run_migrations(&conn) {
                eprintln!("Database migration error: {}", e);
            }
        }
        Err(e) => {
            eprintln!("Failed to initialize database: {}", e);
        }
    }
    
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_folders,
            add_folder,
            update_folder,
            update_folder_order,
            remove_folder,
            get_playlists,
            create_playlist,
            update_playlist,
            update_playlist_order,
            remove_playlist,
            add_song_to_playlist,
            remove_song_from_playlist,
            get_songs_by_folder,
            get_songs_by_playlist,
            get_all_songs,
            get_song_by_id,
            update_song_metadata,
            update_song_tags,
            get_all_tags,
            get_album_art_cache_path,
            clear_album_art_cache,
            prune_album_art_cache,
            get_audio_duration,
            get_file_sizes,
            get_current_generating_waveform_song_id,
            play_audio,
            pause_audio,
            resume_audio,
            stop_audio,
            seek_audio,
            set_volume,
            get_saved_volume,
            extract_waveform,
            get_table_columns,
            set_table_columns,
            get_table_column_widths,
            set_table_column_widths,
            get_audio_format_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
