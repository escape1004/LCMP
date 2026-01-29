import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { usePlaylistStore } from "../stores/playlistStore";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface PlaylistSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (playlistId: number) => Promise<void>;
  songTitle?: string;
}

export const PlaylistSelectModal = ({
  isOpen,
  onClose,
  onSelect,
  songTitle,
}: PlaylistSelectModalProps) => {
  const { playlists, loadPlaylists } = usePlaylistStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  useModalBodyClass(isOpen);
  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      loadPlaylists();
      setError("");
    }
  }, [isOpen, loadPlaylists]);

  const handleSelect = async (playlistId: number) => {
    setIsLoading(true);
    setError("");

    try {
      await onSelect(playlistId);
      onClose();
    } catch (error) {
      console.error("Failed to add song to playlist:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            플레이리스트 선택
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
            disabled={isLoading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {songTitle && (
            <div className="mb-4 text-sm text-text-muted">
              "{songTitle}" 노래를 추가할 플레이리스트를 선택하세요.
            </div>
          )}

          {error && (
            <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md p-2">
              {error}
            </div>
          )}

          {playlists.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              플레이리스트가 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleSelect(playlist.id)}
                  disabled={isLoading}
                  className="w-full text-left px-4 py-3 bg-bg-sidebar hover:bg-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-medium text-text-primary">
                    {playlist.name}
                  </div>
                  {playlist.description && (
                    <div className="text-xs text-text-muted mt-1">
                      {playlist.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-end justify-end gap-2 p-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="text-text-primary hover:bg-hover"
          >
            취소
          </Button>
        </div>
      </div>
    </div>
  );
};

