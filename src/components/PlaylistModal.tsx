import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Playlist } from "../types";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    name: string,
    description?: string,
    isDynamic?: boolean,
    filterTags?: string[],
    filterMode?: "OR" | "AND"
  ) => Promise<void>;
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
  const [allTags, setAllTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<"OR" | "AND">("OR");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasNavigated, setHasNavigated] = useState(false);
  const dropdownAnchorRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
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
        try {
          const parsed = playlist.filter_tags ? JSON.parse(playlist.filter_tags) : [];
          setSelectedTags(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSelectedTags([]);
        }
        setFilterMode((playlist.filter_mode as "OR" | "AND") || "OR");
      } else {
        // 추가 모드
        setName("");
        setDescription("");
        setIsDynamic(false);
        setSelectedTags([]);
        setFilterMode("OR");
      }
      setError("");
    }
  }, [isOpen, playlist]);

  useEffect(() => {
    if (!isOpen) return;
    invoke<string[]>("get_all_tags")
      .then((tags) => setAllTags(tags))
      .catch((error) => {
        console.error("Failed to load tags:", error);
        setAllTags([]);
      });
  }, [isOpen]);

  const { tagQuery } = useMemo(() => {
    const segments = inputValue.split(",");
    const last = segments[segments.length - 1] ?? "";
    return { tagQuery: last.trim() };
  }, [inputValue]);

  const filteredTags = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    const base = allTags.filter(
      (tag) => !selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase())
    );
    if (!query) return base;
    return base.filter((tag) => tag.toLowerCase().includes(query));
  }, [allTags, selectedTags, tagQuery]);

  useEffect(() => {
    if (tagQuery.trim().length === 0) {
      setActiveIndex(null);
      setHasNavigated(false);
      return;
    }
    setActiveIndex(null);
    setHasNavigated(false);
  }, [tagQuery]);

  useEffect(() => {
    if (!isInputFocused || tagQuery.trim().length === 0 || filteredTags.length === 0) {
      setDropdownStyle(null);
      return;
    }

    const updatePosition = () => {
      const anchor = dropdownAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setDropdownStyle({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isInputFocused, tagQuery, filteredTags.length]);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSelectedTags((prev) => {
      if (prev.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return [...prev, trimmed];
    });
  };

  const removeTag = (value: string) => {
    setSelectedTags((prev) => prev.filter((tag) => tag.toLowerCase() !== value.toLowerCase()));
  };

  const commitTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const exists = allTags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase());
    if (!exists) return;
    addTag(trimmed);
    const segments = inputValue.split(",");
    const prefix = segments.slice(0, -1).map((seg) => seg.trim()).filter(Boolean);
    const next = [...prefix, ""].join(", ");
    setInputValue(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !inputValue) {
      if (selectedTags.length > 0) {
        event.preventDefault();
        setSelectedTags((prev) => {
          const next = prev.slice(0, -1);
          const last = prev[prev.length - 1];
          setInputValue(last ?? "");
          return next;
        });
      }
      return;
    }
    if (isInputFocused && filteredTags.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHasNavigated(true);
        setActiveIndex((prev) => {
          if (prev === null) return 0;
          return (prev + 1) % filteredTags.length;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHasNavigated(true);
        setActiveIndex((prev) => {
          if (prev === null) return filteredTags.length - 1;
          return (prev - 1 + filteredTags.length) % filteredTags.length;
        });
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (hasNavigated && activeIndex !== null) {
          const selected = filteredTags[activeIndex];
          if (selected) {
            commitTag(selected);
          }
        } else if (tagQuery.trim()) {
          commitTag(tagQuery.trim());
        }
        return;
      }
    }

    if ((event.key === "Enter" || event.key === " ") && tagQuery.trim()) {
      event.preventDefault();
      commitTag(tagQuery.trim());
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("플레이리스트 이름을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onConfirm(
        name.trim(),
        description.trim() || undefined,
        isDynamic,
        isDynamic ? selectedTags : undefined,
        isDynamic ? filterMode : undefined
      );
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
      <div className="bg-bg-primary rounded-lg w-full max-w-lg max-h-[90vh] overflow-visible">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {playlist ? "플레이리스트 수정" : "플레이리스트 생성"}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)] overflow-visible">
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
                <div className="space-y-3">
                  <div className="text-xs text-text-muted">
                    선택한 태그가 포함된 노래만 자동으로 포함됩니다.
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">포함 방식</span>
                    <button
                      type="button"
                      onClick={() => setFilterMode("OR")}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        filterMode === "OR"
                          ? "bg-accent text-white border-transparent"
                          : "bg-bg-sidebar text-text-muted border-border hover:text-text-primary"
                      }`}
                    >
                      하나라도 포함
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("AND")}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        filterMode === "AND"
                          ? "bg-accent text-white border-transparent"
                          : "bg-bg-sidebar text-text-muted border-border hover:text-text-primary"
                      }`}
                    >
                      모두 포함
                    </button>
                  </div>
                  <div className="relative" ref={dropdownAnchorRef}>
                    <div className="tag-input-wrapper rounded-md border border-border bg-bg-sidebar px-3 py-2 flex flex-wrap gap-2 items-center min-h-[44px]">
                      {selectedTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-1 text-xs text-text-primary hover:bg-hover/80 transition-colors"
                        >
                          <span>{tag}</span>
                          <X size={12} />
                        </button>
                      ))}
                      <input
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        placeholder="태그 선택"
                        className="tag-input flex-1 min-w-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-muted border-0 outline-none ring-0 shadow-none appearance-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-0 focus:shadow-none"
                        style={{ outline: "none", boxShadow: "none" }}
                      />
                    </div>

                    {dropdownStyle &&
                      typeof document !== "undefined" &&
                      createPortal(
                        <div
                          className="fixed rounded-md border border-border bg-bg-sidebar shadow-lg z-50 max-h-40 overflow-y-auto"
                          style={{
                            left: dropdownStyle.left,
                            top: dropdownStyle.top,
                            width: dropdownStyle.width,
                          }}
                        >
                          <div className="py-1">
                            {filteredTags.map((tag, index) => (
                              <button
                                key={tag}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => commitTag(tag)}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  activeIndex === index
                                    ? "bg-accent text-white"
                                    : "text-text-primary hover:bg-hover"
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>,
                        document.body
                      )}
                  </div>
                </div>
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
          <Button
            type="button"
            size="sm"
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


