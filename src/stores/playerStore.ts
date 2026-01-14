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
  waveform: number[]; // 웨이폼 데이터 (0.0 ~ 1.0)
  isLoadingWaveform: boolean; // 웨이폼 로딩 중
  
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
  loadWaveform: (song: Song) => Promise<void>;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number | ((prev: number) => number)) => void;
  initializeAudio: (song: Song) => Promise<void>;
  cleanup: () => Promise<void>;
  loadSavedVolume: () => Promise<void>;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const initializeAudio = async (song: Song) => {
    try {
      // 기존 재생 중지
      await invoke('stop_audio').catch(() => {});
      
      // 상태 업데이트 (duration은 나중에 백그라운드에서 가져오기)
      set({ 
        currentSong: song,
        currentTime: 0,
        duration: song.duration || 0,
        isPlaying: false,
        waveform: [], // 웨이폼 초기화
        isLoadingWaveform: true
      });
      
      // 웨이폼 로드를 먼저 완료
      const { loadWaveform, volume } = get();
      
      try {
        // 웨이폼 로드 완료까지 대기
        await loadWaveform(song);
        
        // 웨이폼 로드 완료 후 재생 시작
        await invoke('play_audio', { 
          filePath: song.file_path,
          volume: volume / 100,
          seekTime: null // 새 재생이므로 seek 없음
        });
        set({ isPlaying: true });
      } catch (playErr) {
        console.error('Failed to play audio:', playErr);
        set({ isPlaying: false, isLoadingWaveform: false });
        throw playErr;
      }
      
      // duration 가져오기 (재생 제어와 완전히 분리, 백그라운드에서)
      if (!song.duration || song.duration === 0) {
        invoke<number>('get_audio_duration', { filePath: song.file_path })
          .then((duration) => {
            if (duration > 0) {
              set({ duration });
            }
          })
          .catch((err) => {
            console.error('Failed to get audio duration:', err);
          });
      }
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      set({ isPlaying: false, isLoadingWaveform: false });
      throw new Error(`Failed to initialize audio: ${error}`);
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
    waveform: [],
    isLoadingWaveform: false,
    
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
        // currentTime은 그대로 유지 (일시정지 시 시간은 멈춤)
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
            try {
              // 프론트엔드 시간을 먼저 업데이트 (즉시 반응)
              set({ currentTime: time });
              // Rust 백엔드에서 seek 실행 (비동기로 처리)
              invoke('seek_audio', { time }).catch((error) => {
                console.error('Seek error:', error);
              });
            } catch (error) {
              console.error('Seek error:', error);
            }
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

    loadWaveform: async (song: Song) => {
      set({ isLoadingWaveform: true, waveform: [] });
      try {
        const waveformSamples = 150; // 기본값 150
        const chunkSize = 30; // 청크 크기: 30개 바
        
        let fullWaveform: number[] = [];
        
        // DB에 저장된 웨이폼이 있으면 사용, 없으면 추출
        if (song.waveform_data && song.waveform_data.trim() !== '') {
          try {
            // JSON 파싱
            fullWaveform = JSON.parse(song.waveform_data);
          } catch (parseError) {
            console.error('Failed to parse waveform_data from DB, extracting...', parseError);
            // 파싱 실패 시 추출
            fullWaveform = await invoke<number[]>('extract_waveform', { 
              filePath: song.file_path,
              samples: waveformSamples
            });
          }
        } else {
          // DB에 웨이폼이 없으면 추출
          fullWaveform = await invoke<number[]>('extract_waveform', { 
            filePath: song.file_path,
            samples: waveformSamples
          });
        }
        
        // 웨이폼을 청크 단위로 나눠서 점진적으로 추가 (재생은 이미 시작됨)
        const waveform: number[] = [];
        
        for (let i = 0; i < fullWaveform.length; i += chunkSize) {
          const chunkData = fullWaveform.slice(i, i + chunkSize);
          waveform.push(...chunkData);
          
          // 각 청크가 추가될 때마다 상태 업데이트 (점진적 표시)
          set((_state) => ({
            waveform: [...waveform],
            isLoadingWaveform: waveform.length < waveformSamples
          }));
          
          // 다음 청크 표시를 위한 짧은 지연 (시각적 효과)
          if (i + chunkSize < fullWaveform.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        set({ waveform, isLoadingWaveform: false });
      } catch (error) {
        console.error('Failed to load waveform:', error);
        set({ waveform: [], isLoadingWaveform: false });
      }
    },

    setDuration: (duration) => {
      set({ duration });
    },

    setCurrentTime: (time) => {
      if (typeof time === 'function') {
        set((state) => ({ currentTime: time(state.currentTime) }));
      } else {
        set({ currentTime: time });
      }
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

    loadSavedVolume: async () => {
      try {
        const savedVolume = await invoke<number>('get_saved_volume');
        const volumePercent = Math.round(savedVolume * 100);
        set({ volume: volumePercent });
        // 백엔드에도 볼륨 설정
        await invoke('set_volume', { volume: savedVolume });
      } catch (error) {
        console.error('Failed to load saved volume:', error);
        // 에러 발생 시 기본값 유지
      }
    },
  };
});

