import { useEffect, useState } from "react";
import { LayoutDashboard, Plus, Folder, ListMusic, X } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useFolderStore } from "../stores/folderStore";
import { usePlaylistStore } from "../stores/playlistStore";
import { useQueueStore } from "../stores/queueStore";
import { FolderModal } from "./FolderModal";
import { PlaylistModal } from "./PlaylistModal";
import { SidebarContextMenu } from "./SidebarContextMenu";
import { Button } from "./ui/button";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

type PrimaryMenu = "dashboard" | "folders" | "playlists";

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

  const [activePrimary, setActivePrimary] = useState<PrimaryMenu>("dashboard");
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

  useModalBodyClass(!!deleteTarget);
  useEscapeToClose(!!deleteTarget, () => {
    setDeleteTarget(null);
    setDeleteChecked(false);
  });

  useEffect(() => {
    loadFolders();
    loadPlaylists();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFolderId !== null) {
      setActivePrimary("folders");
    } else if (selectedPlaylistId !== null) {
      setActivePrimary("playlists");
    } else {
      setActivePrimary("dashboard");
    }
  }, [selectedFolderId, selectedPlaylistId]);

  const handleDashboardClick = () => {
    selectFolder(null);
    selectPlaylist(null);
    setQueueOpen(false);
    setActivePrimary("dashboard");
  };

  const handleFoldersClick = () => {
    selectPlaylist(null);
    setQueueOpen(false);
    setActivePrimary("folders");
    if (folders.length > 0) {
      selectFolder(folders[0].id);
    } else {
      selectFolder(null);
    }
  };

  const handlePlaylistsClick = () => {
    selectFolder(null);
    setQueueOpen(false);
    setActivePrimary("playlists");
    if (playlists.length > 0) {
      selectPlaylist(playlists[0].id);
    } else {
      selectPlaylist(null);
    }
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

    (async () => {
      try {
        const reorderedFolders = Array.from(folders);
        const [removed] = reorderedFolders.splice(sourceIndex, 1);
        reorderedFolders.splice(destinationIndex, 0, removed);

        const folderIds = reorderedFolders.map((f) => f.id);
        await updateFolderOrder(folderIds);
      } catch (error) {
        console.error("Failed to update folder order:", error);
        try {
          await loadFolders();
        } catch (loadError) {
          console.error("Failed to reload folders:", loadError);
        }
      }
    })().catch((error) => {
      console.error("Unhandled error in handleFolderDragEnd:", error);
    });
  };

  const handlePlaylistDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    (async () => {
      try {
        const reorderedPlaylists = Array.from(playlists);
        const [removed] = reorderedPlaylists.splice(sourceIndex, 1);
        reorderedPlaylists.splice(destinationIndex, 0, removed);

        const playlistIds = reorderedPlaylists.map((p) => p.id);
        await updatePlaylistOrder(playlistIds);
      } catch (error) {
        console.error("Failed to update playlist order:", error);
        try {
          await loadPlaylists();
        } catch (loadError) {
          console.error("Failed to reload playlists:", loadError);
        }
      }
    })().catch((error) => {
      console.error("Unhandled error in handlePlaylistDragEnd:", error);
    });
  };

  return (
    <div
      className={`flex h-full bg-bg-sidebar overflow-visible ${
        activePrimary === "dashboard" ? "w-14" : "w-[280px]"
      }`}
    >
      <div className="w-14 bg-[#2B2D31] flex flex-col items-center pt-0 pb-3 gap-2 relative overflow-visible border-r border-border">
        <div className="relative group">
          <button
            type="button"
            onClick={handleDashboardClick}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${
              activePrimary === "dashboard"
                ? "bg-accent text-white"
                : "text-text-muted hover:bg-hover"
            }`}
          >
            <LayoutDashboard size={20} />
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 rounded bg-[#18191c] text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-50">
            대시보드
          </span>
        </div>
        <div className="relative group">
          <button
            type="button"
            onClick={handleFoldersClick}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${
              activePrimary === "folders"
                ? "bg-accent text-white"
                : "text-text-muted hover:bg-hover"
            }`}
          >
            <Folder size={20} />
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 rounded bg-[#18191c] text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-50">
            폴더
          </span>
        </div>
        <div className="relative group">
          <button
            type="button"
            onClick={handlePlaylistsClick}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${
              activePrimary === "playlists"
                ? "bg-accent text-white"
                : "text-text-muted hover:bg-hover"
            }`}
          >
            <ListMusic size={20} />
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 rounded bg-[#18191c] text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-50">
            플레이리스트
          </span>
        </div>
      </div>

      {activePrimary !== "dashboard" && (
        <div className="w-56 bg-bg-sidebar flex flex-col h-full border-r border-border">
          {activePrimary === "folders" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 pt-3 pb-3 flex-shrink-0 border-b border-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                    폴더
                  </h2>
                  <button
                    onClick={handleAddFolder}
                    className="p-1 hover:bg-hover rounded transition-colors"
                  >
                    <Plus size={14} className="text-text-muted" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-1 py-1">
                  <DragDropContext onDragEnd={handleFolderDragEnd}>
                    <Droppable droppableId="folders">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-1"
                        >
                          {folders.map((folder, index) => (
                            <Draggable
                              key={folder.id}
                              draggableId={`folder-${folder.id}`}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => {
                                    setActivePrimary("folders");
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
          )}

          {activePrimary === "playlists" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 pt-3 pb-3 flex-shrink-0 border-b border-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                    플레이리스트
                  </h2>
                  <button
                    onClick={handleCreatePlaylist}
                    className="p-1 hover:bg-hover rounded transition-colors"
                  >
                    <Plus size={14} className="text-text-muted" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-1 py-1">
                  <DragDropContext onDragEnd={handlePlaylistDragEnd}>
                    <Droppable droppableId="playlists">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-1"
                        >
                          {playlists.map((playlist, index) => (
                            <Draggable
                              key={playlist.id}
                              draggableId={`playlist-${playlist.id}`}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => {
                                    setActivePrimary("playlists");
                                    selectPlaylist(playlist.id);
                                    selectFolder(null);
                                    setQueueOpen(false);
                                  }}
                                  onContextMenu={(e) =>
                                    handleContextMenu(e, "playlist", playlist.id)
                                  }
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
          )}
        </div>
      )}

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
        <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-primary rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
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

            <div className="px-5 py-5">
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger leading-relaxed">
                삭제 후에는 복구할 수 없습니다. 중요한 데이터가 포함되어 있다면
                먼저 백업해 주세요.
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
