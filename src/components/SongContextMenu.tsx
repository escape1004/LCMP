import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { useToastStore } from '../stores/toastStore';
import { Song } from '../types';

interface SongContextMenuProps {
  song: Song;
  x: number;
  y: number;
  onClose: () => void;
  onAddToQueue?: (song: Song) => void;
  onRemoveFromQueue?: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onRemoveFromPlaylist?: (song: Song) => void;
  onEditMetadata: (song: Song) => void;
  onEditTags: (song: Song) => void;
}

type VideoSync = {
  songId: number;
  videoPath: string;
  delayMs: number;
};

export const SongContextMenu = ({
  song,
  x,
  y,
  onClose,
  onAddToQueue,
  onRemoveFromQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onEditMetadata,
  onEditTags,
}: SongContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToastStore();
  const [videoSync, setVideoSync] = useState<{ videoPath: string; delayMs: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 화면 경계 체크 및 위치 조정
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // 오른쪽 경계 체크
    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // 하단 경계 체크
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    // 왼쪽 경계 체크
    if (adjustedX < 8) {
      adjustedX = 8;
    }

    // 상단 경계 체크
    if (adjustedY < 8) {
      adjustedY = 8;
    }

    menuRef.current.style.left = `${adjustedX}px`;
    menuRef.current.style.top = `${adjustedY}px`;
  }, [x, y]);

  useEffect(() => {
    let mounted = true;
    invoke<VideoSync | null>('get_video_sync', {
      songId: song.id,
    })
      .then((data) => {
        if (!mounted) return;
        if (data?.videoPath) {
          setVideoSync({ videoPath: data.videoPath, delayMs: data.delayMs ?? 0 });
        } else {
          setVideoSync(null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setVideoSync(null);
      });
    return () => {
      mounted = false;
    };
  }, [song.id]);

  const handleConnectVideo = async () => {
    const songDir = song.file_path.split(/[/\\]/).slice(0, -1).join('\\');
    const defaultPath = videoSync?.videoPath || songDir;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi'] }],
        defaultPath,
      });
      if (!selected || Array.isArray(selected)) return;
      const pickedPath = selected.toString();
      await invoke('set_video_sync', {
        songId: song.id,
        videoPath: pickedPath,
        delayMs: videoSync?.delayMs ?? 0,
      });
      setVideoSync({ videoPath: pickedPath, delayMs: videoSync?.delayMs ?? 0 });
      window.dispatchEvent(new CustomEvent('video-sync-updated', { detail: { songId: song.id } }));
      showToast('동영상이 연결되었습니다.');
    } catch (error) {
      console.error('Failed to connect video:', error);
      showToast('동영상 연결에 실패했습니다.');
    }
  };

  const handleClearVideo = async () => {
    try {
      await invoke('clear_video_sync', { songId: song.id });
      setVideoSync(null);
      window.dispatchEvent(new CustomEvent('video-sync-updated', { detail: { songId: song.id } }));
      showToast('동영상 연결이 해제되었습니다.');
    } catch (error) {
      console.error('Failed to clear video:', error);
      showToast('동영상 연결 해제에 실패했습니다.');
    }
  };

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-sidebar border border-border rounded-md shadow-lg w-fit"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {onRemoveFromQueue ? (
        <button
          onClick={() => {
            onRemoveFromQueue(song);
            onClose();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
        >
          대기열에서 제거
        </button>
      ) : (
        onAddToQueue && (
          <button
            onClick={() => {
              onAddToQueue(song);
              onClose();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
          >
            대기열 추가
          </button>
        )
      )}
      {onRemoveFromPlaylist ? (
        <button
          onClick={() => {
            onRemoveFromPlaylist(song);
            onClose();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
        >
          플레이리스트에서 제거
        </button>
      ) : onAddToPlaylist ? (
        <button
          onClick={() => {
            onAddToPlaylist(song);
            onClose();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
        >
          플레이리스트 추가
        </button>
      ) : null}
      <button
        onClick={() => {
          onEditTags(song);
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
      >
        태그 추가
      </button>
      <button
        onClick={async () => {
          await handleConnectVideo();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
      >
        동영상 연결
      </button>
      {videoSync && (
        <button
          onClick={async () => {
            await handleClearVideo();
            onClose();
          }}
          className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
        >
          동영상 연결 해제
        </button>
      )}
      <div className="h-px bg-border my-0" />
      <button
        onClick={() => {
          onEditMetadata(song);
          onClose();
        }}
        className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
      >
        메타데이터 수정
      </button>
    </div>
  );

  if (typeof document === 'undefined') {
    return menu;
  }

  return createPortal(menu, document.body);
};
