import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Playlist } from "../types";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description?: string, isDynamic?: boolean) => Promise<void>;
  playlist?: Playlist | null;
}

export const PlaylistModal = ({
  isOpen,
  onClose,
  onConfirm,
  playlist,
}: PlaylistModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDynamic, setIsDynamic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  useModalBodyClass(isOpen);
  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      if (playlist) {
        // 수정 모드
        setName(playlist.name);
        setDescription(playlist.description || "");
        setIsDynamic(playlist.is_dynamic === 1);
      } else {
        // 추가 모드
        setName("");
        setDescription("");
        setIsDynamic(false);
      }
      setError("");
    }
  }, [isOpen, playlist]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("플레이리스트 이름을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onConfirm(name.trim(), description.trim() || undefined, isDynamic);
      onClose();
    } catch (error) {
      console.error("Failed to create playlist:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">
            {playlist ? "플레이리스트 수정" : "플레이리스트 생성"}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            {/* 플레이리스트 이름 */}
            <div className="space-y-2">
              <Label htmlFor="playlist-name" className="text-text-primary font-medium">
                플레이리스트 이름 <span className="text-danger">*</span>
              </Label>
              <Input
                id="playlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="플레이리스트 이름"
                disabled={isLoading}
              />
            </div>

            {/* 설명 */}
            <div className="space-y-2">
              <Label htmlFor="playlist-description" className="text-text-primary font-medium">
                설명
              </Label>
              <Input
                id="playlist-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="플레이리스트 설명"
                disabled={isLoading}
              />
            </div>

            {/* 동적 플레이리스트 옵션 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is-dynamic"
                  checked={isDynamic}
                  onChange={(e) => setIsDynamic(e.target.checked)}
                  disabled={isLoading}
                />
                <Label htmlFor="is-dynamic" className="cursor-pointer text-text-primary font-medium">
                  동적 플레이리스트 (태그 및 메타데이터 필터 사용)
                </Label>
              </div>
              {isDynamic && (
                <p className="text-xs text-text-muted pl-6">
                  나중에 태그 및 메타데이터 필터를 설정할 수 있습니다.
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md p-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-end gap-3 p-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            className="text-text-primary hover:bg-hover"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
            className="bg-accent hover:bg-accent/90"
          >
            {isLoading ? (playlist ? "수정 중..." : "생성 중...") : (playlist ? "수정" : "생성")}
          </Button>
        </div>
      </div>
    </div>
  );
};

