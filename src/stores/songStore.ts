import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Song } from '../types';

interface SongStore {
  songs: Song[];
  isLoading: boolean;
  generatingWaveformSongId: number | null;
  currentFolderId: number | null;
  currentPlaylistId: number | null;
  songsVersion: number; // songs 배열 변경 시 강제 리렌더를 위한 버전 번호
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
      // isLoading을 true로 바꾸지 않고 목록만 갱신
      try {
        const result = await invoke<{ songs: Song[] }>('get_songs_by_folder', {
          folderId: state.currentFolderId,
        });
        set({ songs: result.songs, songsVersion: get().songsVersion + 1 });
      } catch (error) {
        console.error('Failed to refresh songs by folder:', error);
      }
    } else if (state.currentPlaylistId !== null) {
      // isLoading을 true로 바꾸지 않고 목록만 갱신
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

      // previousId가 바뀌면 (다른 곡으로 변경되었거나 null이 된 경우)
      // 이전 곡의 웨이브폼 생성 완료 여부를 확인
      if (previousId !== null && previousId !== songId) {
        // 완료된 곡 정보를 다시 가져와 확인 (재시도 로직 포함)
        let retries = 3;
        let updatedSong: Song | null = null;

        while (retries > 0 && !updatedSong) {
          try {
            const song = await invoke<Song>('get_song_by_id', { songId: previousId });
            // 웨이브폼 데이터가 실제로 들어왔는지 확인
            if (song.waveform_data && song.waveform_data.trim() !== '') {
              updatedSong = song;
            } else {
              // 아직 생성되지 않았으면 잠시 대기 후 재시도
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

        // 웨이브폼이 생성되면 해당 곡만 업데이트 (성능 최적화)
        if (updatedSong) {
          const currentState = get();
          const songIndex = currentState.songs.findIndex((song) => song.id === previousId);

          if (songIndex !== -1) {
            const existingSong = currentState.songs[songIndex];
            // 실제로 변경되었는지 확인
            if (existingSong.waveform_data !== updatedSong.waveform_data) {
              // 해당 곡만 업데이트한 새 배열 생성
              // 모든 곡을 새 객체로 만들어 참조 변경 보장
              const newSongs = currentState.songs.map((song, index) => {
                if (index === songIndex) {
                  // 최신 데이터로 새 객체 생성
                  return { ...updatedSong };
                }
                // 다른 곡도 새 객체로 만들어 참조 변경 보장
                return { ...song };
              });

              // 새 배열 참조로 상태 업데이트
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
