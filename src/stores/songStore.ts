import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Song } from '../types';

interface SongStore {
  songs: Song[];
  isLoading: boolean;
  generatingWaveformSongId: number | null;
  currentFolderId: number | null;
  currentPlaylistId: number | null;
  songsVersion: number; // songs 배열이 변경될 때마다 증가하는 버전 번호
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
      // isLoading을 true로 설정하지 않고 목록만 업데이트
      try {
        const result = await invoke<{ songs: Song[] }>('get_songs_by_folder', {
          folderId: state.currentFolderId,
        });
        set({ songs: result.songs, songsVersion: get().songsVersion + 1 });
      } catch (error) {
        console.error('Failed to refresh songs by folder:', error);
      }
    } else if (state.currentPlaylistId !== null) {
      // isLoading을 true로 설정하지 않고 목록만 업데이트
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
      
      // previousId가 변경되었을 때 (다른 노래로 변경되거나 null이 되었을 때)
      // 이전 노래의 웨이폼이 완료되었을 수 있으므로 확인
      if (previousId !== null && previousId !== songId) {
        // 완료된 노래 정보를 다시 가져와서 확인 (재시도 로직 포함)
        let retries = 3;
        let updatedSong: Song | null = null;
        
        while (retries > 0 && !updatedSong) {
          try {
            const song = await invoke<Song>('get_song_by_id', { songId: previousId });
            // 웨이폼 데이터가 실제로 있는지 확인
            if (song.waveform_data && song.waveform_data.trim() !== '') {
              updatedSong = song;
            } else {
              // 아직 저장되지 않았으면 잠시 대기 후 재시도
              await new Promise(resolve => setTimeout(resolve, 200));
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
        
        // 웨이폼이 생성되었으면 해당 노래만 업데이트 (성능 최적화)
        if (updatedSong) {
          const currentState = get();
          const songIndex = currentState.songs.findIndex((song) => song.id === previousId);
          
          if (songIndex !== -1) {
            const existingSong = currentState.songs[songIndex];
            // 실제로 변경되었는지 확인
            if (existingSong.waveform_data !== updatedSong.waveform_data) {
              // 해당 노래만 업데이트된 새로운 배열 생성
              // 모든 노래를 새 객체로 생성하여 참조 변경 보장
              const newSongs = currentState.songs.map((song, index) => {
                if (index === songIndex) {
                  // 완전히 새로운 객체 생성
                  return { ...updatedSong };
                }
                // 다른 노래도 새 객체로 생성 (참조 변경 보장)
                return { ...song };
              });
              
              // 새로운 배열 참조로 상태 업데이트
              set({ 
                songs: newSongs, 
                songsVersion: currentState.songsVersion + 1 
              });
            }
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
      // 해당 노래가 현재 목록에 있는지 확인
      const songIndex = state.songs.findIndex((song) => song.id === updatedSong.id);
      if (songIndex === -1) {
        // 목록에 없으면 업데이트하지 않음
        return state;
      }
      
      // 기존 노래와 비교하여 실제로 변경되었는지 확인
      const existingSong = state.songs[songIndex];
      const hasWaveformChanged = existingSong.waveform_data !== updatedSong.waveform_data;
      
      if (!hasWaveformChanged) {
        // 변경사항이 없으면 업데이트하지 않음
        return state;
      }
      
      // 새로운 배열을 생성하여 업데이트 (Zustand가 변경을 감지하도록)
      // 모든 요소를 새로 생성하여 참조 동일성을 깨뜨림
      const newSongs = state.songs.map((song, index) => {
        if (index === songIndex) {
          // 완전히 새로운 객체를 생성
          return { ...updatedSong };
        }
        // 다른 노래도 새 객체로 생성 (참조 변경)
        return { ...song };
      });
      
      // 새로운 배열과 함께 상태 업데이트
      return { songs: newSongs, songsVersion: state.songsVersion + 1 };
    });
  },
}));

