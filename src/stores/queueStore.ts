import { create } from 'zustand';
import { Song } from '../types';

interface QueueStore {
  queue: Song[];
  currentIndex: number | null;
  isOpen: boolean;
  addToQueue: (song: Song, position?: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number | null) => void;
  toggleQueue: () => void;
  setQueueOpen: (open: boolean) => void;
}

export const useQueueStore = create<QueueStore>((set) => ({
  queue: [],
  currentIndex: null,
  isOpen: false,

  addToQueue: (song: Song, position?: number) => {
    set((state) => {
      const newQueue = [...state.queue];
      if (position !== undefined) {
        newQueue.splice(position, 0, song);
      } else {
        newQueue.push(song);
      }
      return { queue: newQueue };
    });
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
}));
