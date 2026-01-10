import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Folder } from '../types';

interface FolderStore {
  folders: Folder[];
  selectedFolderId: number | null;
  isLoading: boolean;
  loadFolders: () => Promise<void>;
  addFolder: (path: string, name?: string) => Promise<void>;
  updateFolder: (folderId: number, name: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  selectFolder: (folderId: number | null) => void;
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  isLoading: false,

  loadFolders: async () => {
    set({ isLoading: true });
    try {
      const result = await invoke<{ folders: Folder[] }>('get_folders');
      set({ folders: result.folders, isLoading: false });
    } catch (error) {
      console.error('Failed to load folders:', error);
      set({ isLoading: false });
    }
  },

  addFolder: async (path: string, name?: string) => {
    try {
      const folder = await invoke<Folder>('add_folder', { path, name });
      set((state) => ({
        folders: [...state.folders, folder],
      }));
    } catch (error) {
      console.error('Failed to add folder:', error);
      throw error;
    }
  },

  updateFolder: async (folderId: number, name: string) => {
    try {
      const folder = await invoke<Folder>('update_folder', { folderId, name });
      set((state) => ({
        folders: state.folders.map((f) => (f.id === folderId ? folder : f)),
      }));
    } catch (error) {
      console.error('Failed to update folder:', error);
      throw error;
    }
  },

  removeFolder: async (folderId: number) => {
    try {
      await invoke('remove_folder', { folderId });
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== folderId),
        selectedFolderId:
          state.selectedFolderId === folderId ? null : state.selectedFolderId,
      }));
    } catch (error) {
      console.error('Failed to remove folder:', error);
      throw error;
    }
  },

  selectFolder: (folderId: number | null) => {
    set({ selectedFolderId: folderId });
  },
}));
