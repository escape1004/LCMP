import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Folder } from '../types';

interface FolderStore {
  folders: Folder[];
  selectedFolderId: number | null;
  isLoading: boolean;
  loadFolders: () => Promise<void>;
  addFolder: (path: string, name?: string) => Promise<Folder>;
  updateFolder: (folderId: number, name: string) => Promise<void>;
  updateFolderOrder: (folderIds: number[]) => Promise<void>;
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
        selectedFolderId: folder.id, // 새로 추가된 폴더를 자동으로 선택
      }));
      return folder; // 추가된 폴더 반환
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

  updateFolderOrder: async (folderIds: number[]) => {
    try {
      await invoke('update_folder_order', { folderIds });
      // 순서 업데이트 후 폴더 목록 다시 로드
      const result = await invoke<{ folders: Folder[] }>('get_folders');
      set({ folders: result.folders });
    } catch (error) {
      console.error('Failed to update folder order:', error);
      // 에러를 다시 throw하지 않고 로그만 남김
      // UI는 원래 상태를 유지
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

