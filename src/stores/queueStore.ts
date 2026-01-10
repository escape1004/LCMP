import { create } from 'zustand';
import { Song } from '../types';
import { usePlayerStore } from './playerStore';
import { invoke } from '@tauri-apps/api/tauri';

interface QueueStore {
  queue: Song[];
  currentIndex: number | null;
  isOpen: boolean;
  originalQueue: Song[]; // 셔플 전 원본 대기열
  addToQueue: (song: Song, position?: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  toggleQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  shuffleQueue: () => void;
  unshuffleQueue: () => void;
  playSong: (song: Song) => Promise<void>;
  playSongAtIndex: (index: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  preloadWaveforms: (queue: Song[]) => Promise<void>; // 백그라운드 웨이폼 추출
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  queue: [],
  currentIndex: null,
  isOpen: false,
  originalQueue: [],

  addToQueue: (song: Song, position?: number) => {
    const state = get();
    const newQueue = [...state.queue];
    if (position !== undefined) {
      newQueue.splice(position, 0, song);
    } else {
      newQueue.push(song);
    }
    
    set({ queue: newQueue });
    
    // 백그라운드에서 웨이폼 미리 추출 (순차적으로)
    // 새로 추가된 곡부터 시작하여 대기열의 곡들을 순차적으로 처리
    get().preloadWaveforms(newQueue).catch(err => {
      console.error('Failed to preload waveforms:', err);
    });
  },
  
  // 대기열의 곡들을 백그라운드에서 순차적으로 웨이폼 추출
  preloadWaveforms: async (queue: Song[]) => {
    // 현재 재생 중인 곡의 다음 곡부터 시작
    const { currentIndex } = get();
    const startIndex = currentIndex !== null ? currentIndex + 1 : 0;
    
    // 순차적으로 웨이폼 추출 (한 번에 하나씩)
    for (let i = startIndex; i < queue.length; i++) {
      const song = queue[i];
      if (!song) continue;
      
      try {
        // 웨이폼 추출 (캐시에 저장됨)
        await invoke<number[]>('extract_waveform', {
          filePath: song.file_path,
          samples: 150
        });
      } catch (error) {
        // 오류는 무시하고 계속 (백그라운드 작업이므로)
        console.error(`Failed to preload waveform for ${song.file_path}:`, error);
      }
    }
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      const newQueue = state.queue.filter((_, i) => i !== index);
      let newCurrentIndex = state.currentIndex;
      if (state.currentIndex !== null) {
        if (index < state.currentIndex) {
          newCurrentIndex = state.currentIndex - 1;
        } else if (index === state.currentIndex) {
          newCurrentIndex = null;
        }
      }
      return { queue: newQueue, currentIndex: newCurrentIndex };
    });
  },

  reorderQueue: (from: number, to: number) => {
    set((state) => {
      const newQueue = [...state.queue];
      const [removed] = newQueue.splice(from, 1);
      newQueue.splice(to, 0, removed);
      
      let newCurrentIndex = state.currentIndex;
      if (state.currentIndex !== null) {
        if (from === state.currentIndex) {
          newCurrentIndex = to;
        } else if (from < state.currentIndex && to >= state.currentIndex) {
          newCurrentIndex = state.currentIndex - 1;
        } else if (from > state.currentIndex && to <= state.currentIndex) {
          newCurrentIndex = state.currentIndex + 1;
        }
      }
      return { queue: newQueue, currentIndex: newCurrentIndex };
    });
  },

  clearQueue: () => {
    set({ queue: [], currentIndex: null });
  },

  setCurrentIndex: (index: number | null) => {
    set({ currentIndex: index });
  },

  toggleQueue: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  setQueueOpen: (open: boolean) => {
    set({ isOpen: open });
  },

  shuffleQueue: () => {
    const state = get();
    if (state.queue.length === 0) return;
    
    // 원본 대기열 저장 (처음 셔플할 때만)
    if (state.originalQueue.length === 0) {
      set({ originalQueue: [...state.queue] });
    }
    
    // 현재 재생 중인 곡을 제외한 나머지를 섞기
    const currentSong = state.currentIndex !== null ? state.queue[state.currentIndex] : null;
    const otherSongs = state.queue.filter((_, i) => i !== state.currentIndex);
    
    // Fisher-Yates 셔플 알고리즘
    for (let i = otherSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherSongs[i], otherSongs[j]] = [otherSongs[j], otherSongs[i]];
    }
    
    // 현재 곡을 맨 앞에 두고 나머지를 뒤에 배치
    const shuffledQueue = currentSong ? [currentSong, ...otherSongs] : otherSongs;
    const newCurrentIndex = currentSong ? 0 : null;
    
    set({ queue: shuffledQueue, currentIndex: newCurrentIndex });
  },

  unshuffleQueue: () => {
    const state = get();
    if (state.originalQueue.length === 0) return;
    
    // 원본 대기열로 복원
    const originalIndex = state.currentIndex !== null && state.currentIndex < state.originalQueue.length
      ? state.queue[state.currentIndex]
        ? state.originalQueue.findIndex(s => s.id === state.queue[state.currentIndex].id)
        : null
      : null;
    
    set({ 
      queue: [...state.originalQueue], 
      currentIndex: originalIndex,
      originalQueue: [] 
    });
  },

  playSong: async (song: Song) => {
    try {
      const state = get();
      let songIndex = state.queue.findIndex(s => s.id === song.id);
      
      // 대기열에 없으면 추가
      if (songIndex === -1) {
        set((state) => {
          const newQueue = [...state.queue, song];
          return { queue: newQueue, currentIndex: newQueue.length - 1 };
        });
        songIndex = get().queue.length - 1;
      } else {
        set({ currentIndex: songIndex });
      }

      // 오디오 초기화 및 재생
      const { initializeAudio, play } = usePlayerStore.getState();
      await initializeAudio(song);
      await play();
    } catch (error) {
      console.error('Error in playSong:', error);
      throw error;
    }
  },

  playSongAtIndex: async (index: number) => {
    const state = get();
    if (index >= 0 && index < state.queue.length) {
      const song = state.queue[index];
      set({ currentIndex: index });
      
      // 다음 곡들의 웨이폼 미리 추출 (백그라운드)
      const { preloadWaveforms } = get();
      preloadWaveforms(state.queue).catch(err => {
        console.error('Failed to preload waveforms:', err);
      });
      
      const { initializeAudio, play } = usePlayerStore.getState();
      await initializeAudio(song);
      await play();
    }
  },

  playNext: async () => {
    const state = get();
    const { repeat } = usePlayerStore.getState();
    
    if (state.currentIndex === null) return;
    
    // 1곡 반복 모드에서도 버튼을 누르면 다음 곡으로 이동
    if (state.currentIndex < state.queue.length - 1) {
      // 다음 곡 재생
      const nextIndex = state.currentIndex + 1;
      await get().playSongAtIndex(nextIndex);
    } else if (repeat === 'all') {
      // 전체 반복: 처음부터 다시
      await get().playSongAtIndex(0);
    }
    // 1곡 반복 모드이고 마지막 곡이면 아무것도 하지 않음 (버튼이 비활성화됨)
  },

  playPrevious: async () => {
    const state = get();
    const { repeat } = usePlayerStore.getState();
    
    if (state.currentIndex === null) return;
    
    if (state.currentIndex > 0) {
      // 이전 곡 재생
      const prevIndex = state.currentIndex - 1;
      await get().playSongAtIndex(prevIndex);
    } else if (repeat === 'all') {
      // 전체 반복 모드: 마지막 곡으로 이동
      await get().playSongAtIndex(state.queue.length - 1);
    }
  },
}));
