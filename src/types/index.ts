// Song types
export interface Song {
  id: number;
  file_path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  year: number | null;
  genre: string | null;
  album_art_path: string | null;
  waveform_data: string | null; // JSON 배열로 저장된 웨이폼 데이터
  created_at: string;
  updated_at: string;
  tags: string[];
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
}

// Folder types
export interface Folder {
  id: number;
  path: string;
  name: string | null;
  order: number;
  added_at: string;
}

// Playlist types
export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  is_dynamic: number; // 0: static, 1: dynamic
  filter_tags: string | null; // JSON array
  filter_mode: string | null; // "AND" or "OR"
  order: number;
  created_at: string;
  updated_at: string;
}
