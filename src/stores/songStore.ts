import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Song } from '../types';

interface SongStore {
  songs: Song[];
  isLoading: boolean;
  generatingWaveformSongId: number | null;
  currentFolderId: number | null;
  currentPlaylistId: number | null;
  songsVersion: number; // songs ë°°ì—´??ë³€ê²½ë  ?Œë§ˆ??ì¦ê??˜ëŠ” ë²„ì „ ë²ˆí˜¸
  loadSongsByFolder: (folderId: number) => Promise<void>;
  loadSongsByPlaylist: (playlistId: number) => Promise<void>;
  loadAllSongs: () => Promise<void>;
  clearSongs: () => void;
  checkGeneratingWaveform: () => Promise<void>;
  updateSong: (song: Song) => void;
  refreshCurrentList: () => Promise<void>;
}

export const useSongStore = create<SongStore>((set, get) => ({
  songs: [],
  isLoading: false,
  generatingWaveformSongId: null,
  currentFolderId: null,
  currentPlaylistId: null,
  songsVersion: 0,

  loadSongsByFolder: async (folderId: number) => {
    set({ isLoading: true, currentFolderId: folderId, currentPlaylistId: null });
    try {
      const result = await invoke<{ songs: Song[] }>('get_songs_by_folder', {
        folderId,
      });
      set({ songs: result.songs, isLoading: false, songsVersion: get().songsVersion + 1 });
    } catch (error) {
      console.error('Failed to load songs by folder:', error);
      set({ isLoading: false, songs: [], songsVersion: get().songsVersion + 1 });
    }
  },

  loadSongsByPlaylist: async (playlistId: number) => {
    set({ isLoading: true, currentFolderId: null, currentPlaylistId: playlistId });
    try {
      const result = await invoke<{ songs: Song[] }>('get_songs_by_playlist', {
        playlistId,
      });
      set({ songs: result.songs, isLoading: false, songsVersion: get().songsVersion + 1 });
    } catch (error) {
      console.error('Failed to load songs by playlist:', error);
      set({ isLoading: false, songs: [], songsVersion: get().songsVersion + 1 });
    }
  },

  loadAllSongs: async () => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ songs: Song[] }>('get_all_songs');
      set({ songs: result.songs, isLoading: false, songsVersion: get().songsVersion + 1 });
    } catch (error) {
      console.error('Failed to load all songs:', error);
      set({ isLoading: false, songs: [], songsVersion: get().songsVersion + 1 });
    }
  },

  clearSongs: () => {
    set({ songs: [], currentFolderId: null, currentPlaylistId: null, songsVersion: get().songsVersion + 1 });
  },

  refreshCurrentList: async () => {
    const state = get();
    if (state.currentFolderId !== null) {
      // isLoading??trueë¡??¤ì •?˜ì? ?Šê³  ëª©ë¡ë§??…ë°?´íŠ¸
      try {
        const result = await invoke<{ songs: Song[] }>('get_songs_by_folder', {
          folderId: state.currentFolderId,
        });
        set({ songs: result.songs, songsVersion: get().songsVersion + 1 });
      } catch (error) {
        console.error('Failed to refresh songs by folder:', error);
      }
    } else if (state.currentPlaylistId !== null) {
      // isLoading??trueë¡??¤ì •?˜ì? ?Šê³  ëª©ë¡ë§??…ë°?´íŠ¸
      try {
        const result = await invoke<{ songs: Song[] }>('get_songs_by_playlist', {
          playlistId: state.currentPlaylistId,
        });
        set({ songs: result.songs, songsVersion: get().songsVersion + 1 });
      } catch (error) {
        console.error('Failed to refresh songs by playlist:', error);
      }
    }
  },

  checkGeneratingWaveform: async () => {
    try {
      const songId = await invoke<number | null>('get_current_generating_waveform_song_id');
      const previousId = get().generatingWaveformSongId;
      
      // previousIdê°€ ë³€ê²½ë˜?ˆì„ ??(?¤ë¥¸ ?¸ë˜ë¡?ë³€ê²½ë˜ê±°ë‚˜ null???˜ì—ˆ????
      // ?´ì „ ?¸ë˜???¨ì´?¼ì´ ?„ë£Œ?˜ì—ˆ?????ˆìœ¼ë¯€ë¡??•ì¸
      if (previousId !== null && previousId !== songId) {
        // ?„ë£Œ???¸ë˜ ?•ë³´ë¥??¤ì‹œ ê°€?¸ì????•ì¸ (?¬ì‹œ??ë¡œì§ ?¬í•¨)
        let retries = 3;
        let updatedSong: Song | null = null;
        
        while (retries > 0 && !updatedSong) {
          try {
            const song = await invoke<Song>('get_song_by_id', { songId: previousId });
            // ?¨ì´???°ì´?°ê? ?¤ì œë¡??ˆëŠ”ì§€ ?•ì¸
            if (song.waveform_data && song.waveform_data.trim() !== '') {
              updatedSong = song;
            } else {
              // ?„ì§ ?€?¥ë˜ì§€ ?Šì•˜?¼ë©´ ? ì‹œ ?€ê¸????¬ì‹œ??              await new Promise(resolve => setTimeout(resolve, 200));
              retries--;
            }
          } catch (error) {
            console.error('Failed to check song after waveform generation:', error);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        }
        
        // ?¨ì´?¼ì´ ?ì„±?˜ì—ˆ?¼ë©´ ?´ë‹¹ ?¸ë˜ë§??…ë°?´íŠ¸ (?±ëŠ¥ ìµœì ??
        if (updatedSong) {
          const currentState = get();
          const songIndex = currentState.songs.findIndex((song) => song.id === previousId);
          
          if (songIndex !== -1) {
            const existingSong = currentState.songs[songIndex];
            // ?¤ì œë¡?ë³€ê²½ë˜?ˆëŠ”ì§€ ?•ì¸
            if (existingSong.waveform_data !== updatedSong.waveform_data) {
              // ?´ë‹¹ ?¸ë˜ë§??…ë°?´íŠ¸???ˆë¡œ??ë°°ì—´ ?ì„±
              // ëª¨ë“  ?¸ë˜ë¥???ê°ì²´ë¡??ì„±?˜ì—¬ ì°¸ì¡° ë³€ê²?ë³´ì¥
              const newSongs = currentState.songs.map((song, index) => {
                if (index === songIndex) {
                  // ?„ì „???ˆë¡œ??ê°ì²´ ?ì„±
                  return { ...updatedSong };
                }
                // ?¤ë¥¸ ?¸ë˜????ê°ì²´ë¡??ì„± (ì°¸ì¡° ë³€ê²?ë³´ì¥)
                return { ...song };
              });
              
              // ?ˆë¡œ??ë°°ì—´ ì°¸ì¡°ë¡??íƒœ ?…ë°?´íŠ¸
              set({ 
                songs: newSongs, 
                songsVersion: currentState.songsVersion + 1 
              });
            }
          }
        }
      }
      
      set({ generatingWaveformSongId: songId });
    } catch (error) {
      console.error('Failed to check generating waveform:', error);
    }
  },

  updateSong: (updatedSong: Song) => {
    set((state) => {
      const songIndex = state.songs.findIndex((song) => song.id === updatedSong.id);
      if (songIndex === -1) {
        return state;
      }
      
      const newSongs = state.songs.map((song, index) => {
        if (index === songIndex) {
          return { ...updatedSong };
        }
        return { ...song };
      });
      
      return { songs: newSongs, songsVersion: state.songsVersion + 1 };
    });
  },
}));



