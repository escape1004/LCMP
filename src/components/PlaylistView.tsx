import { useEffect, useMemo, useState } from 'react';
import { useFolderStore } from '../stores/folderStore';
import { usePlaylistStore } from '../stores/playlistStore';
import { useSongStore } from '../stores/songStore';
import { useQueueStore } from '../stores/queueStore';
import { Song } from '../types';
import { invoke } from '@tauri-apps/api/tauri';

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  if (seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const PlaylistView = () => {
  const { folders, selectedFolderId } = useFolderStore();
  const { playlists, selectedPlaylistId } = usePlaylistStore();
  const { songs, isLoading, loadSongsByFolder, loadSongsByPlaylist, clearSongs } = useSongStore();
  const { playSong } = useQueueStore();
  const [totalSize, setTotalSize] = useState<number>(0);
  const [isLoadingSize, setIsLoadingSize] = useState(false);

  const handleSongClick = async (song: Song) => {
    try {
      await playSong(song);
    } catch (error) {
      console.error('Failed to play song:', error);
    }
  };

  useEffect(() => {
    if (selectedFolderId !== null) {
      loadSongsByFolder(selectedFolderId);
    } else if (selectedPlaylistId !== null) {
      loadSongsByPlaylist(selectedPlaylistId);
    } else {
      clearSongs();
    }
  }, [selectedFolderId, selectedPlaylistId, loadSongsByFolder, loadSongsByPlaylist, clearSongs]);

  // 전체 재생 시간 계산
  const totalDuration = useMemo(() => {
    return songs.reduce((sum, song) => {
      const duration = song.duration ?? 0;
      return sum + duration;
    }, 0);
  }, [songs]);

  // 파일 크기 계산
  useEffect(() => {
    const calculateTotalSize = async () => {
      if (songs.length === 0) {
        setTotalSize(0);
        return;
      }

      setIsLoadingSize(true);
      try {
        const filePaths = songs.map(song => song.file_path);
        const results = await invoke<Array<[string, number]>>('get_file_sizes', {
          filePaths,
        });
        
        const total = results.reduce((sum, [, size]) => sum + size, 0);
        setTotalSize(total);
      } catch (error) {
        console.error('Failed to calculate total size:', error);
        setTotalSize(0);
      } finally {
        setIsLoadingSize(false);
      }
    };

    calculateTotalSize();
  }, [songs]);

  const getTitle = () => {
    if (selectedFolderId !== null) {
      const folder = folders.find((f) => f.id === selectedFolderId);
      return folder ? folder.name : '폴더 노래';
    }
    if (selectedPlaylistId !== null) {
      const playlist = playlists.find((p) => p.id === selectedPlaylistId);
      return playlist ? playlist.name : '플레이리스트 노래';
    }
    return '재생 목록';
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-text-primary">
          {getTitle()}
          {(selectedFolderId !== null || selectedPlaylistId !== null) && (
            <span className="text-xs text-text-muted font-normal ml-2">
              {' '}
              (
              {isLoadingSize ? (
                <span>계산 중...</span>
              ) : (
                <>
                  {formatFileSize(totalSize)} / {formatDuration(totalDuration)}
                </>
              )}
              )
            </span>
          )}
        </h2>
      </div>

      {/* Song List Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-text-muted text-sm">로딩 중...</div>
          </div>
        ) : songs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-text-muted text-sm">노래를 추가해주세요</div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-bg-primary border-b border-border z-10">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                  제목
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                  아티스트
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                  앨범
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                  재생 시간
                </th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => (
                <tr
                  key={song.id}
                  className="border-b border-border hover:bg-hover transition-colors cursor-pointer"
                  onClick={() => handleSongClick(song)}
                >
                  <td className="px-4 py-3 text-sm text-text-primary">
                    {song.title || '제목 없음'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {song.artist || '아티스트 없음'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {song.album || '앨범 없음'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {formatDuration(song.duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

