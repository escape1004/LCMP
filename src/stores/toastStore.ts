import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  showToast: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message: string, duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = { id, message, duration };
    
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));
  },
  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
