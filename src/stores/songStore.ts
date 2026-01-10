import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Song } from '../types';

interface SongStore {
  songs: Song[];
  isLoading: boolean;
  loadSongsByFolder: (folderId: number) => Promise<void>;
  loadSongsByPlaylist: (playlistId: number) => Promise<void>;
  loadAllSongs: () => Promise<void>;
  clearSongs: () => void;
}

export const useSongStore = create<SongStore>((set) => ({
  songs: [],
  isLoading: false,

  loadSongsByFolder: async (folderId: number) => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ songs: Song[] }>('get_songs_by_folder', {
        folderId,
      });
      set({ songs: result.songs, isLoading: false });
    } catch (error) {
      console.error('Failed to load songs by folder:', error);
      set({ isLoading: false, songs: [] });
    }
  },

  loadSongsByPlaylist: async (playlistId: number) => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ songs: Song[] }>('get_songs_by_playlist', {
        playlistId,
      });
      set({ songs: result.songs, isLoading: false });
    } catch (error) {
      console.error('Failed to load songs by playlist:', error);
      set({ isLoading: false, songs: [] });
    }
  },

  loadAllSongs: async () => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ songs: Song[] }>('get_all_songs');
      set({ songs: result.songs, isLoading: false });
    } catch (error) {
      console.error('Failed to load all songs:', error);
      set({ isLoading: false, songs: [] });
    }
  },

  clearSongs: () => {
    set({ songs: [] });
  },
}));
