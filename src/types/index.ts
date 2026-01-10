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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}
