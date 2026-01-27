import { useEffect, useState } from "react";
import { LayoutDashboard, Plus } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useFolderStore } from "../stores/folderStore";
import { usePlaylistStore } from "../stores/playlistStore";
import { useQueueStore } from "../stores/queueStore";
import { FolderModal } from "./FolderModal";
import { PlaylistModal } from "./PlaylistModal";
import { Tooltip } from "./ui/tooltip";
import { SidebarContextMenu } from "./SidebarContextMenu";
import { Button } from "./ui/button";
import { X } from "lucide-react";

export const Sidebar = () => {
  const {
    folders,
    selectedFolderId,
    loadFolders,
    addFolder,
    updateFolder,
    updateFolderOrder,
    removeFolder,
    selectFolder,
  } = useFolderStore();

  const {
    playlists,
    selectedPlaylistId,
    loadPlaylists,
    createPlaylist,
    updatePlaylist,
    updatePlaylistOrder,
    removePlaylist,
    selectPlaylist,
  } = usePlaylistStore();

  const { setQueueOpen } = useQueueStore();

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<number | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: "folder" | "playlist";
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "folder" | "playlist";
    id: number;
  } | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);

  useEffect(() => {
    loadFolders();
    loadPlaylists();
  }, []);

  const handleDashboardClick = () => {
    selectFolder(null);
    selectPlaylist(null);
  };

  const handleAddFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsFolderModalOpen(true);
  };

  const handleCreatePlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsPlaylistModalOpen(true);
  };

  const handleFolderConfirm = async (path: string, name: string) => {
    if (editingFolder) {
      await updateFolder(editingFolder, name);
      setEditingFolder(null);
    } else {
      await addFolder(path, name);
    }
  };

  const handlePlaylistConfirm = async (
    name: string,
    description?: string,
    isDynamic?: boolean
  ) => {
    if (editingPlaylist) {
      await updatePlaylist(editingPlaylist, name, description, isDynamic);
      setEditingPlaylist(null);
    } else {
      await createPlaylist(name, description, isDynamic);
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: "folder" | "playlist",
    id: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      type,
      id,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleFolderDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    
    if (sourceIndex === destinationIndex) return;
    
    // 비동기 작업을 즉시 실행하되, 에러를 완전히 처리
    (async () => {
      try {
        const reorderedFolders = Array.from(folders);
        const [removed] = reorderedFolders.splice(sourceIndex, 1);
        reorderedFolders.splice(destinationIndex, 0, removed);
        
        const folderIds = reorderedFolders.map((f) => f.id);
        await updateFolderOrder(folderIds);
      } catch (error) {
        console.error("Failed to update folder order:", error);
        // 에러 발생 시 원래 상태로 복구
        try {
          await loadFolders();
        } catch (loadError) {
          console.error("Failed to reload folders:", loadError);
        }
      }
    })().catch((error) => {
      // 최종 에러 처리 - 앱이 재시작되지 않도록
      console.error("Unhandled error in handleFolderDragEnd:", error);
    });
  };

  const handlePlaylistDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    
    if (sourceIndex === destinationIndex) return;
    
    // 비동기 작업을 즉시 실행하되, 에러를 완전히 처리
    (async () => {
      try {
        const reorderedPlaylists = Array.from(playlists);
        const [removed] = reorderedPlaylists.splice(sourceIndex, 1);
        reorderedPlaylists.splice(destinationIndex, 0, removed);
        
        const playlistIds = reorderedPlaylists.map((p) => p.id);
        await updatePlaylistOrder(playlistIds);
      } catch (error) {
        console.error("Failed to update playlist order:", error);
        // 에러 발생 시 원래 상태로 복구
        try {
          await loadPlaylists();
        } catch (loadError) {
          console.error("Failed to reload playlists:", loadError);
        }
      }
    })().catch((error) => {
      // 최종 에러 처리 - 앱이 재시작되지 않도록
      console.error("Unhandled error in handlePlaylistDragEnd:", error);
    });
  };

  return (
    <div className="w-64 bg-bg-sidebar flex flex-col h-full">
      {/* Dashboard Menu */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={handleDashboardClick}
          className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-hover transition-colors text-text-primary"
        >
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">대시보드</span>
        </button>
      </div>

      {/* Folder Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
              폴더
            </h2>
          <Tooltip content="폴더 추가">
            <button
              onClick={handleAddFolder}
              className="p-1 hover:bg-hover rounded transition-colors"
            >
              <Plus size={14} className="text-text-muted" />
            </button>
          </Tooltip>
        </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pb-3 pt-1">
        <DragDropContext onDragEnd={handleFolderDragEnd}>
          <Droppable droppableId="folders">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-1"
              >
                {folders.map((folder, index) => (
                  <Draggable key={folder.id} draggableId={`folder-${folder.id}`} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => {
                          selectFolder(folder.id);
                          selectPlaylist(null);
                          setQueueOpen(false);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, "folder", folder.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors group ${
                          selectedFolderId === folder.id
                            ? "bg-accent text-white"
                            : "hover:bg-hover text-text-primary"
                        } ${snapshot.isDragging ? "opacity-50" : ""}`}
                      >
                        <span className="flex-1 text-sm font-medium truncate">
                          {folder.name || folder.path}
                        </span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border"></div>

      {/* Playlist Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
              플레이리스트
            </h2>
          <Tooltip content="플레이리스트 추가">
            <button
              onClick={handleCreatePlaylist}
              className="p-1 hover:bg-hover rounded transition-colors"
            >
              <Plus size={14} className="text-text-muted" />
            </button>
          </Tooltip>
        </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pb-3 pt-1">
        <DragDropContext onDragEnd={handlePlaylistDragEnd}>
          <Droppable droppableId="playlists">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-1"
              >
                {playlists.map((playlist, index) => (
                  <Draggable key={playlist.id} draggableId={`playlist-${playlist.id}`} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => {
                          selectPlaylist(playlist.id);
                          selectFolder(null);
                          setQueueOpen(false);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, "playlist", playlist.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors group ${
                          selectedPlaylistId === playlist.id
                            ? "bg-accent text-white"
                            : "hover:bg-hover text-text-primary"
                        } ${snapshot.isDragging ? "opacity-50" : ""}`}
                      >
                        <span className="flex-1 text-sm font-medium truncate">
                          {playlist.name}
                        </span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
          </div>
        </div>
      </div>

      {/* Modals */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        onConfirm={handleFolderConfirm}
        folder={editingFolder ? folders.find((f) => f.id === editingFolder) : null}
      />
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => {
          setIsPlaylistModalOpen(false);
          setEditingPlaylist(null);
        }}
        onConfirm={handlePlaylistConfirm}
        playlist={editingPlaylist ? playlists.find((p) => p.id === editingPlaylist) : null}
      />
      
      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemType={contextMenu.type}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            if (contextMenu.type === "folder") {
              setEditingFolder(contextMenu.id);
              setIsFolderModalOpen(true);
            } else {
              setEditingPlaylist(contextMenu.id);
              setIsPlaylistModalOpen(true);
            }
          }}
          onDelete={() => {
            setDeleteTarget({ type: contextMenu.type, id: contextMenu.id });
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-primary rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-text-primary">
                {deleteTarget.type === "folder" ? "폴더 삭제" : "플레이리스트 삭제"}
              </h2>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-5">
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger leading-relaxed">
                삭제 후에는 복구할 수 없습니다. 중요한 데이터가 포함되어 있다면 먼저 백업하세요.
              </div>
              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteChecked}
                  onChange={(e) => setDeleteChecked(e.target.checked)}
                  className="h-4 w-4 accent-danger"
                />
                <span className="text-sm text-text-primary leading-relaxed">
                  내용 이해하였고 삭제 진행합니다
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-end justify-end gap-3 p-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteChecked(false);
                }}
                className="text-text-primary hover:bg-hover"
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  if (!deleteTarget) return;
                  try {
                    if (deleteTarget.type === "folder") {
                      await removeFolder(deleteTarget.id);
                    } else {
                      await removePlaylist(deleteTarget.id);
                    }
                  } catch (error) {
                    console.error("Failed to delete item:", error);
                  } finally {
                    setDeleteTarget(null);
                    setDeleteChecked(false);
                  }
                }}
                className="bg-danger hover:bg-danger/90 text-white"
                disabled={!deleteChecked}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
