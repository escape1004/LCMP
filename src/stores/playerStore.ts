import { create } from 'zustand';
import { Song } from '../types';
import { invoke } from '@tauri-apps/api/tauri';

interface PlayerStore {
  // 재생 상태
  isPlaying: boolean;
  currentSong: Song | null;
  currentTime: number; // 초 단위
  duration: number; // 초 단위
  volume: number; // 0-100
  isMuted: boolean;
  previousVolume: number; // 음소거 해제 시 복원할 볼륨
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one'; // off: 반복 없음, all: 전체 반복, one: 1곡 반복
  
  // Actions
  setCurrentSong: (song: Song | null) => void;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (time: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  initializeAudio: (song: Song) => Promise<void>;
  cleanup: () => Promise<void>;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const initializeAudio = async (song: Song) => {
    // Rust 백엔드에서 오디오 재생 (파일을 메모리에 읽지 않고 스트리밍)
    console.log('Initializing audio via Rust backend:', song.file_path);
    
    try {
      // 기존 재생 중지
      await invoke('stop_audio').catch(() => {});
      
      // Rust 백엔드에서 오디오 재생 시작 (볼륨 포함)
      const { volume } = get();
      await invoke('play_audio', { 
        filePath: song.file_path,
        volume: volume / 100 
      });
      
      // 상태 업데이트
      set({ 
        currentSong: song,
        currentTime: 0,
        duration: song.duration || 0,
        isPlaying: true
      });
      
      console.log('Audio playback started via Rust backend');
    } catch (error) {
      console.error('Failed to play audio:', error);
      set({ isPlaying: false });
      throw new Error(`Failed to play audio: ${error}`);
    }
  };

  return {
    isPlaying: false,
    currentSong: null,
    currentTime: 0,
    duration: 0,
    volume: 50,
    isMuted: false,
    previousVolume: 50,
    shuffle: false,
    repeat: 'off',
    
    setCurrentSong: (song) => {
      set({ currentSong: song });
    },

    play: async () => {
      try {
        await invoke('resume_audio');
        set({ isPlaying: true });
      } catch (error) {
        console.error('Play error:', error);
        set({ isPlaying: false });
      }
    },

    pause: async () => {
      try {
        await invoke('pause_audio');
        set({ isPlaying: false });
      } catch (error) {
        console.error('Pause error:', error);
      }
    },

    togglePlayPause: async () => {
      const { isPlaying, play, pause } = get();
      if (isPlaying) {
        await pause();
      } else {
        await play();
      }
    },

    seek: async (time: number) => {
      // rodio는 seek를 직접 지원하지 않으므로 나중에 구현
      // 현재는 시간만 업데이트
      set({ currentTime: time });
    },

    setVolume: async (volume: number) => {
      const clampedVolume = Math.max(0, Math.min(100, volume));
      try {
        await invoke('set_volume', { volume: clampedVolume / 100 });
        set((state) => ({
          volume: clampedVolume,
          // 볼륨이 0이 아닌 값으로 설정되면 음소거 해제
          isMuted: clampedVolume === 0 ? state.isMuted : false,
          previousVolume: clampedVolume > 0 ? clampedVolume : state.previousVolume,
        }));
      } catch (error) {
        console.error('Set volume error:', error);
      }
    },

    toggleMute: async () => {
      const { isMuted, volume, previousVolume } = get();
      if (isMuted) {
        // 음소거 해제: 이전 볼륨으로 복원
        const restoreVolume = previousVolume > 0 ? previousVolume : 50;
        try {
          await invoke('set_volume', { volume: restoreVolume / 100 });
          set({ isMuted: false, volume: restoreVolume });
        } catch (error) {
          console.error('Unmute error:', error);
        }
      } else {
        // 음소거: 현재 볼륨 저장 후 0으로 설정
        try {
          await invoke('set_volume', { volume: 0 });
          set({ isMuted: true, previousVolume: volume > 0 ? volume : 50 });
        } catch (error) {
          console.error('Mute error:', error);
        }
      }
    },

    toggleShuffle: () => {
      set((state) => ({ shuffle: !state.shuffle }));
    },

    toggleRepeat: () => {
      set((state) => {
        // off -> all -> one -> off 순환
        if (state.repeat === 'off') {
          return { repeat: 'all' };
        } else if (state.repeat === 'all') {
          return { repeat: 'one' };
        } else {
          return { repeat: 'off' };
        }
      });
    },

    setDuration: (duration) => {
      set({ duration });
    },

    setCurrentTime: (time) => {
      set({ currentTime: time });
    },

    initializeAudio: async (song: Song) => {
      await initializeAudio(song);
    },

    cleanup: async () => {
      try {
        await invoke('stop_audio');
      } catch (error) {
        console.error('Cleanup error:', error);
      }
      set({ currentSong: null, isPlaying: false });
    },
  };
});
