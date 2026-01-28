import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';

// ?ъ슜 媛?ν븳 紐⑤뱺 而щ읆 ?꾨뱶 ?뺤쓽
export const AVAILABLE_COLUMNS = [
  { key: 'album_art', label: '앨범 아트', sortable: false },
  { key: 'file_name', label: '파일명' },
  { key: 'title', label: '제목' },
  { key: 'artist', label: '아티스트' },
  { key: 'album', label: '앨범' },
  { key: 'tags', label: '태그', sortable: false },
  { key: 'duration', label: '재생시간' },
  { key: 'year', label: '연도' },
  { key: 'genre', label: '장르' },
  { key: 'file_path', label: '파일 경로' },
  { key: 'created_at', label: '추가일' },
  { key: 'updated_at', label: '수정일' },
] as const;

export type ColumnKey = typeof AVAILABLE_COLUMNS[number]['key'];

export type SortOrder = 'asc' | 'desc' | null;

interface TableColumnsStore {
  visibleColumns: ColumnKey[];
  columnWidths: Record<ColumnKey, number>;
  sortColumn: ColumnKey | null;
  sortOrder: SortOrder;
  isLoading: boolean;
  loadColumns: () => Promise<void>;
  setColumns: (columns: ColumnKey[]) => Promise<void>;
  toggleColumn: (column: ColumnKey) => Promise<void>;
  loadColumnWidths: () => Promise<void>;
  setColumnWidth: (column: ColumnKey, width: number) => Promise<void>;
  setColumnWidths: (widths: Record<ColumnKey, number>) => Promise<void>;
  setSort: (column: ColumnKey, order: SortOrder) => void;
  toggleSort: (column: ColumnKey) => void;
  reorderColumns: (newOrder: ColumnKey[]) => Promise<void>;
}

// 湲곕낯 而щ읆 ?덈퉬 (?쎌?)
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  album_art: 60,
  file_name: 200,
  title: 200,
  artist: 150,
  album: 150,
  tags: 220,
  duration: 100,
  year: 100,
  genre: 120,
  file_path: 300,
  created_at: 120,
  updated_at: 120,
};

export const useTableColumnsStore = create<TableColumnsStore>((set, get) => ({
  visibleColumns: ['title', 'artist', 'album', 'duration'], // 湲곕낯媛?
  columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
  sortColumn: null,
  sortOrder: null,
  isLoading: false,

  loadColumns: async () => {
    set({ isLoading: true });
    try {
      let columns = await invoke<ColumnKey[]>('get_table_columns');
      
      // ?⑤쾾?꾪듃媛 ?덉쑝硫???긽 泥?踰덉㎏濡??대룞
      const albumArtIndex = columns.indexOf('album_art');
      if (albumArtIndex > 0) {
        columns = [...columns];
        columns.splice(albumArtIndex, 1);
        columns.unshift('album_art');
      }
      // ?⑤쾾?꾪듃媛 ?놁쑝硫?洹몃?濡??좎? (泥?踰덉㎏??媛뺤젣 異붽??섏? ?딆쓬)
      
      set({ visibleColumns: columns, isLoading: false });
    } catch (error) {
      console.error('Failed to load table columns:', error);
      // 湲곕낯媛??좎?
      set({ isLoading: false });
    }
  },

  setColumns: async (columns: ColumnKey[]) => {
    try {
      // ?⑤쾾?꾪듃媛 ?덉쑝硫???긽 泥?踰덉㎏濡??대룞
      let finalColumns = [...columns];
      const albumArtIndex = finalColumns.indexOf('album_art');
      if (albumArtIndex > 0) {
        finalColumns.splice(albumArtIndex, 1);
        finalColumns.unshift('album_art');
      }
      // ?⑤쾾?꾪듃媛 ?놁쑝硫?洹몃?濡??좎? (泥?踰덉㎏??媛뺤젣 異붽??섏? ?딆쓬)
      
      await invoke('set_table_columns', { columns: finalColumns });
      set({ visibleColumns: finalColumns });
    } catch (error) {
      console.error('Failed to save table columns:', error);
    }
  },

  toggleColumn: async (column: ColumnKey) => {
    const { visibleColumns, setColumns } = get();
    const newColumns = visibleColumns.includes(column)
      ? visibleColumns.filter(c => c !== column)
      : [...visibleColumns, column];
    
    // 理쒖냼 1媛?而щ읆? ?좎?
    if (newColumns.length > 0) {
      await setColumns(newColumns);
    }
  },

  loadColumnWidths: async () => {
    try {
      const widths = await invoke<Record<string, number>>('get_table_column_widths');
      // 湲곕낯媛믨낵 蹂묓빀
      set((_state) => ({
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

  setSort: (column: ColumnKey, order: SortOrder) => {
    set({ sortColumn: column, sortOrder: order });
  },

  toggleSort: (column: ColumnKey) => {
    const { sortColumn, sortOrder } = get();
    
    // ?⑤쾾?꾪듃???뺣젹 遺덇?
    if (column === 'album_art') return;
    
    if (sortColumn === column) {
      // 媛숈? 而щ읆 ?대┃: ?ㅻ쫫李⑥닚 -> ?대┝李⑥닚 -> 珥덇린??
      if (sortOrder === 'asc') {
        set({ sortOrder: 'desc' });
      } else if (sortOrder === 'desc') {
        set({ sortColumn: null, sortOrder: null });
      }
    } else {
      // ?ㅻⅨ 而щ읆 ?대┃: ?ㅻ쫫李⑥닚?쇰줈 ?쒖옉
      set({ sortColumn: column, sortOrder: 'asc' });
    }
  },

  reorderColumns: async (newOrder: ColumnKey[]) => {
    // ?⑤쾾?꾪듃媛 ?덉쑝硫???긽 泥?踰덉㎏濡??대룞
    const albumArtIndex = newOrder.indexOf('album_art');
    if (albumArtIndex > 0) {
      newOrder.splice(albumArtIndex, 1);
      newOrder.unshift('album_art');
    }
    // ?⑤쾾?꾪듃媛 ?놁쑝硫?洹몃?濡??좎?
    
    try {
      await invoke('set_table_columns', { columns: newOrder });
      set({ visibleColumns: newOrder });
    } catch (error) {
      console.error('Failed to save column order:', error);
    }
  },
}));



