import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Playlist } from "../types";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description?: string, isDynamic?: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
  playlist?: Playlist | null;
}

export const PlaylistModal = ({
  isOpen,
  onClose,
  onConfirm,
  onDelete,
  playlist,
}: PlaylistModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDynamic, setIsDynamic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
      setShowDeleteConfirm(false);
      setDeleteInput("");
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
          {playlist && onDelete && (
            <>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger text-xs px-2 py-1 mr-auto hover:underline hover:text-danger/80"
                disabled={isLoading}
              >
                플레이리스트 삭제
              </button>
              {showDeleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
                  <div className="bg-bg-primary rounded-lg p-6 w-full max-w-md border border-border flex flex-col items-center">
                    <div className="mb-6 text-center text-text-primary">
                      <div className="text-base font-medium mb-2">
                        정말로 이 플레이리스트를 삭제하시겠습니까?
                      </div>
                      <div className="text-danger font-semibold mb-2">
                        이 작업은 되돌릴 수 없습니다.
                      </div>
                      <div className="text-text-muted text-sm">
                        아래에 <span className="font-semibold">플레이리스트를 삭제하겠습니다</span>를 입력하세요.
                      </div>
                    </div>
                    
                    {isDeleting && (
                      <div className="mb-4 p-4 bg-bg-sidebar rounded-lg border border-border">
                        <div className="flex items-center justify-center gap-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent"></div>
                          <div className="text-text-primary text-sm">
                            플레이리스트 삭제 중...
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Input
                      type="text"
                      value={deleteInput}
                      onChange={(e) => setDeleteInput(e.target.value)}
                      className="w-full mb-3"
                      placeholder="플레이리스트를 삭제하겠습니다"
                      disabled={isDeleting}
                    />
                    <div className="flex w-full gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1 text-text-primary hover:bg-hover"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteInput("");
                        }}
                        disabled={isDeleting}
                      >
                        취소
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1 bg-danger hover:bg-danger/90 text-white disabled:bg-danger/50 disabled:text-white/50"
                        disabled={deleteInput !== "플레이리스트를 삭제하겠습니다" || isDeleting}
                        onClick={async () => {
                          try {
                            setIsDeleting(true);
                            if (onDelete) {
                              await onDelete();
                            }
                            setShowDeleteConfirm(false);
                            setDeleteInput("");
                            onClose();
                          } catch (error) {
                            console.error("Failed to delete playlist:", error);
                            setError("플레이리스트 삭제에 실패했습니다.");
                          } finally {
                            setIsDeleting(false);
                          }
                        }}
                      >
                        {isDeleting ? "삭제 중..." : "삭제"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
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

