import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Song } from "../types";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface TagModalProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  onSave?: (tags: string[]) => void | Promise<void>;
}

export const TagModal = ({ isOpen, song, onClose, onSave }: TagModalProps) => {
  useModalBodyClass(isOpen);
  useEscapeToClose(isOpen, onClose);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setInputValue("");
    setSelectedTags(song?.tags ?? []);
    invoke<string[]>("get_all_tags")
      .then((tags) => setAllTags(tags))
      .catch((error) => {
        console.error("Failed to load tags:", error);
        setAllTags([]);
      });
  }, [isOpen, song]);

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

  const handleSave = async () => {
    try {
      await onSave?.(selectedTags);
      onClose();
    } catch (error) {
      console.error("Failed to save tags:", error);
    }
  };

  if (!isOpen || !song) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg w-full max-w-lg max-h-[90vh] overflow-visible">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">태그 설정</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-visible space-y-4">
          <div className="text-sm text-text-muted">
            태그를 입력하고 스페이스를 누르면 등록됩니다.
          </div>

          <div className="relative">
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
                placeholder="태그 입력"
                className="tag-input flex-1 min-w-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-muted border-0 outline-none ring-0 shadow-none appearance-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-0 focus:shadow-none"
                style={{ outline: "none", boxShadow: "none" }}
              />
            </div>

            {isInputFocused && tagQuery.trim().length > 0 && filteredTags.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 rounded-md border border-border bg-bg-sidebar shadow-lg z-10 max-h-40 overflow-y-auto">
                <div className="py-1">
                  {filteredTags.map((tag, index) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => commitTag(tag)}
                      onMouseDown={(event) => event.preventDefault()}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        hasNavigated && index === activeIndex
                          ? "bg-hover text-text-primary"
                          : "text-text-primary hover:bg-hover"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-end gap-3 p-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-text-primary hover:bg-hover"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-accent hover:bg-accent/90"
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  );
};
