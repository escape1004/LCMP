// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod models;

use database::{get_connection, run_migrations};
use commands::{
    get_folders, add_folder, update_folder, update_folder_order, remove_folder,
    get_playlists, create_playlist, update_playlist, update_playlist_order, remove_playlist,
    get_songs_by_folder, get_songs_by_playlist, get_all_songs,
    play_audio, pause_audio, resume_audio, stop_audio, set_volume, get_playback_position,
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
            get_songs_by_folder,
            get_songs_by_playlist,
            get_all_songs,
            play_audio,
            pause_audio,
            resume_audio,
            stop_audio,
            set_volume,
            get_playback_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
