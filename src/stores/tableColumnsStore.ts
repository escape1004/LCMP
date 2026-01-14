import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';

// 사용 가능한 모든 컬럼 필드 정의
export const AVAILABLE_COLUMNS = [
  { key: 'title', label: '제목' },
  { key: 'artist', label: '아티스트' },
  { key: 'album', label: '앨범' },
  { key: 'duration', label: '재생시간' },
  { key: 'year', label: '연도' },
  { key: 'genre', label: '장르' },
  { key: 'file_path', label: '파일 경로' },
  { key: 'created_at', label: '추가일' },
  { key: 'updated_at', label: '수정일' },
] as const;

export type ColumnKey = typeof AVAILABLE_COLUMNS[number]['key'];

interface TableColumnsStore {
  visibleColumns: ColumnKey[];
  columnWidths: Record<ColumnKey, number>;
  isLoading: boolean;
  loadColumns: () => Promise<void>;
  setColumns: (columns: ColumnKey[]) => Promise<void>;
  toggleColumn: (column: ColumnKey) => Promise<void>;
  loadColumnWidths: () => Promise<void>;
  setColumnWidth: (column: ColumnKey, width: number) => Promise<void>;
  setColumnWidths: (widths: Record<ColumnKey, number>) => Promise<void>;
}

// 기본 컬럼 너비 (픽셀)
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  title: 200,
  artist: 150,
  album: 150,
  duration: 100,
  year: 100,
  genre: 120,
  file_path: 300,
  created_at: 120,
  updated_at: 120,
};

export const useTableColumnsStore = create<TableColumnsStore>((set, get) => ({
  visibleColumns: ['title', 'artist', 'album', 'duration'], // 기본값
  columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
  isLoading: false,

  loadColumns: async () => {
    set({ isLoading: true });
    try {
      const columns = await invoke<ColumnKey[]>('get_table_columns');
      set({ visibleColumns: columns, isLoading: false });
    } catch (error) {
      console.error('Failed to load table columns:', error);
      // 기본값 유지
      set({ isLoading: false });
    }
  },

  setColumns: async (columns: ColumnKey[]) => {
    try {
      await invoke('set_table_columns', { columns });
      set({ visibleColumns: columns });
    } catch (error) {
      console.error('Failed to save table columns:', error);
    }
  },

  toggleColumn: async (column: ColumnKey) => {
    const { visibleColumns, setColumns } = get();
    const newColumns = visibleColumns.includes(column)
      ? visibleColumns.filter(c => c !== column)
      : [...visibleColumns, column];
    
    // 최소 1개 컬럼은 유지
    if (newColumns.length > 0) {
      await setColumns(newColumns);
    }
  },

  loadColumnWidths: async () => {
    try {
      const widths = await invoke<Record<string, number>>('get_table_column_widths');
      // 기본값과 병합
      set((state) => ({
        columnWidths: { ...DEFAULT_COLUMN_WIDTHS, ...widths },
      }));
    } catch (error) {
      console.error('Failed to load column widths:', error);
    }
  },

  setColumnWidth: async (column: ColumnKey, width: number) => {
    const { columnWidths, setColumnWidths } = get();
    const newWidths = { ...columnWidths, [column]: width };
    await setColumnWidths(newWidths);
  },

  setColumnWidths: async (widths: Record<ColumnKey, number>) => {
    try {
      await invoke('set_table_column_widths', { widths });
      set({ columnWidths: widths });
    } catch (error) {
      console.error('Failed to save column widths:', error);
    }
  },
}));
