import { useEffect, useRef } from "react";

interface SidebarContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  itemType: "folder" | "playlist";
}

export const SidebarContextMenu = ({
  x,
  y,
  onClose,
  onEdit,
  onDelete,
  itemType,
}: SidebarContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }
    if (adjustedX < 8) {
      adjustedX = 8;
    }
    if (adjustedY < 8) {
      adjustedY = 8;
    }

    menuRef.current.style.left = `${adjustedX}px`;
    menuRef.current.style.top = `${adjustedY}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-sidebar border border-border rounded-md shadow-lg py-1 w-fit"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-hover transition-colors whitespace-nowrap"
      >
        {itemType === "folder" ? "폴더 수정" : "플레이리스트 수정"}
      </button>
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-hover transition-colors whitespace-nowrap"
      >
        {itemType === "folder" ? "폴더 삭제" : "플레이리스트 삭제"}
      </button>
    </div>
  );
};
