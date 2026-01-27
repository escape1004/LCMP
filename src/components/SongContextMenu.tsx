import { useEffect, useRef } from 'react';
import { Song } from '../types';

interface SongContextMenuProps {
  song: Song;
  x: number;
  y: number;
  onClose: () => void;
  onAddToQueue: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onRemoveFromPlaylist?: (song: Song) => void;
  onEditMetadata: (song: Song) => void;
}

export const SongContextMenu = ({
  song,
  x,
  y,
  onClose,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onEditMetadata,
}: SongContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

    // 우측 경계 체크
    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // 하단 경계 체크
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    // 좌측 경계 체크
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-sidebar border border-border rounded-md shadow-lg w-fit"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <button
        onClick={() => {
          onAddToQueue(song);
          onClose();
        }}
        className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
      >
        대기열 추가
      </button>
      {onRemoveFromPlaylist ? (
        <button
          onClick={() => {
            onRemoveFromPlaylist(song);
            onClose();
          }}
          className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
        >
          플레이리스트에서 삭제
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
          // 추후 개발 예정
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-muted hover:bg-hover transition-colors whitespace-nowrap"
        disabled
      >
        태그 추가
      </button>
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
};
