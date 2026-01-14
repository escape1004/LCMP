import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { open } from "@tauri-apps/api/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Folder } from "../types";

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (path: string, name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  folder?: Folder | null;
}

export const FolderModal = ({ isOpen, onClose, onConfirm, onDelete, folder }: FolderModalProps) => {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (folder) {
        // 수정 모드
        setPath(folder.path);
        setName(folder.name || "");
      } else {
        // 추가 모드
        setPath("");
        setName("");
      }
      setError("");
      setShowDeleteConfirm(false);
      setDeleteChecked(false);
    }
  }, [isOpen, folder]);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "폴더 선택",
      });

      if (selected && typeof selected === "string") {
        setPath(selected);
        // 경로의 마지막 부분을 기본 이름으로 설정
        if (!name) {
          const defaultName = selected.split(/[/\\]/).pop() || "";
          setName(defaultName);
        }
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
      setError("폴더 선택에 실패했습니다.");
    }
  };

  const handleSubmit = async () => {
    if (!path.trim()) {
      setError("폴더를 선택해주세요.");
      return;
    }
    if (!name.trim()) {
      setError("표시 이름을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onConfirm(path, name.trim());
      onClose();
    } catch (error) {
      console.error("Failed to add folder:", error);
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
            {folder ? "폴더 수정" : "폴더 추가"}
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
            {/* 폴더 경로 선택 */}
            <div className="space-y-2">
              <Label htmlFor="folder-path" className="text-text-primary font-medium">
                폴더 경로 <span className="text-danger">*</span>
              </Label>
              <div className="flex gap-2">
              <Input
                id="folder-path"
                value={path}
                placeholder="폴더를 선택해주세요"
                readOnly
                className="flex-1"
                disabled={!!folder}
              />
              {!folder && (
                <Button
                  type="button"
                  onClick={handleSelectFolder}
                  disabled={isLoading}
                  className="bg-accent hover:bg-accent/90"
                >
                  선택
                </Button>
              )}
              </div>
            </div>

            {/* 표시 이름 */}
            <div className="space-y-2">
              <Label htmlFor="folder-name" className="text-text-primary font-medium">
                표시 이름 <span className="text-danger">*</span>
              </Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="사이드 메뉴에 표시될 이름"
                disabled={isLoading}
              />
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
          {folder && onDelete && (
            <>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger text-xs px-2 py-1 mr-auto hover:underline hover:text-danger/80"
                disabled={isLoading}
              >
                폴더 삭제
              </button>
              {showDeleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
                  <div className="bg-bg-primary rounded-lg p-6 w-full max-w-md border border-border flex flex-col items-center">
                    <div className="mb-6 text-center text-text-primary">
                      <div className="text-base font-medium mb-2">
                        정말로 이 폴더를 삭제하시겠습니까?
                      </div>
                      <div className="text-danger font-semibold mb-2">
                        이 작업은 되돌릴 수 없습니다.
                      </div>
                    </div>
                    
                    {isDeleting && (
                      <div className="mb-4 p-4 bg-bg-sidebar rounded-lg border border-border">
                        <div className="flex items-center justify-center gap-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent"></div>
                          <div className="text-text-primary text-sm">
                            폴더 삭제 중...
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <label className="flex items-center space-x-2 w-full mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteChecked}
                        onChange={(e) => setDeleteChecked(e.target.checked)}
                        disabled={isDeleting}
                      />
                      <span className="text-sm text-text-primary">
                        폴더를 삭제하겠습니다
                      </span>
                    </label>
                    <div className="flex w-full gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1 text-text-primary hover:bg-hover"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteChecked(false);
                        }}
                        disabled={isDeleting}
                      >
                        취소
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1 bg-danger hover:bg-danger/90 text-white disabled:bg-danger/50 disabled:text-white/50"
                        disabled={!deleteChecked || isDeleting}
                        onClick={async () => {
                          try {
                            setIsDeleting(true);
                            if (onDelete) {
                              await onDelete();
                            }
                            setShowDeleteConfirm(false);
                            setDeleteChecked(false);
                            onClose();
                          } catch (error) {
                            console.error("Failed to delete folder:", error);
                            setError("폴더 삭제에 실패했습니다.");
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
            disabled={isLoading || !path.trim() || !name.trim()}
            className="bg-accent hover:bg-accent/90"
          >
            {isLoading ? (folder ? "수정 중..." : "추가 중...") : (folder ? "수정" : "추가")}
          </Button>
        </div>
      </div>
    </div>
  );
};

