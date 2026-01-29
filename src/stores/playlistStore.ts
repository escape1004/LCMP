import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Playlist } from '../types';

interface PlaylistStore {
  playlists: Playlist[];
  selectedPlaylistId: number | null;
  isLoading: boolean;
  loadPlaylists: () => Promise<void>;
  createPlaylist: (
    name: string,
    description?: string,
    isDynamic?: boolean,
    filterTags?: string[],
    filterMode?: "OR" | "AND"
  ) => Promise<void>;
  updatePlaylist: (
    playlistId: number,
    name: string,
    description?: string,
    isDynamic?: boolean,
    filterTags?: string[],
    filterMode?: "OR" | "AND"
  ) => Promise<void>;
  updatePlaylistOrder: (playlistIds: number[]) => Promise<void>;
  removePlaylist: (playlistId: number) => Promise<void>;
  selectPlaylist: (playlistId: number | null) => void;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: [],
  selectedPlaylistId: null,
  isLoading: false,

  loadPlaylists: async () => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ playlists: Playlist[] }>('get_playlists');
      set({ playlists: result.playlists, isLoading: false });
    } catch (error) {
      console.error('Failed to load playlists:', error);
      set({ isLoading: false });
    }
  },

  createPlaylist: async (
    name: string,
    description?: string,
    isDynamic?: boolean,
    filterTags?: string[],
    filterMode?: "OR" | "AND"
  ) => {
    try {
      const playlist = await invoke<Playlist>('create_playlist', {
        name,
        description,
        isDynamic,
        filterTags,
        filterMode,
      });
      set((state) => ({
        playlists: [...state.playlists, playlist],
        selectedPlaylistId: playlist.id,
      }));
    } catch (error) {
      console.error('Failed to create playlist:', error);
      throw error;
    }
  },

  updatePlaylist: async (
    playlistId: number,
    name: string,
    description?: string,
    isDynamic?: boolean,
    filterTags?: string[],
    filterMode?: "OR" | "AND"
  ) => {
    try {
      const playlist = await invoke<Playlist>('update_playlist', {
        playlistId,
        name,
        description,
        isDynamic,
        filterTags,
        filterMode,
      });
      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === playlistId ? playlist : p)),
      }));
    } catch (error) {
      console.error('Failed to update playlist:', error);
      throw error;
    }
  },

  updatePlaylistOrder: async (playlistIds: number[]) => {
    try {
      await invoke('update_playlist_order', { playlistIds });
      // 순서 업데이트 후 플레이리스트 목록 다시 로드
      const result = await invoke<{ playlists: Playlist[] }>('get_playlists');
      set({ playlists: result.playlists });
    } catch (error) {
      console.error('Failed to update playlist order:', error);
      // 에러를 다시 throw하지 않고 로그만 남김
      // UI는 원래 상태를 유지
    }
  },

  removePlaylist: async (playlistId: number) => {
    try {
      await invoke('remove_playlist', { playlistId });
      set((state) => ({
        playlists: state.playlists.filter((p) => p.id !== playlistId),
        selectedPlaylistId:
          state.selectedPlaylistId === playlistId
            ? (() => {
                const remaining = state.playlists.filter((p) => p.id !== playlistId);
                return remaining.length > 0 ? remaining[0].id : null;
              })()
            : state.selectedPlaylistId,
      }));
    } catch (error) {
      console.error('Failed to remove playlist:', error);
      throw error;
    }
  },

  selectPlaylist: (playlistId: number | null) => {
    set({ selectedPlaylistId: playlistId });
  },
}));
