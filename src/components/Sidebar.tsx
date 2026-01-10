import { useEffect, useState } from "react";
import { LayoutDashboard, Plus, Settings } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useFolderStore } from "../stores/folderStore";
import { usePlaylistStore } from "../stores/playlistStore";
import { FolderModal } from "./FolderModal";
import { PlaylistModal } from "./PlaylistModal";

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

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<number | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<number | null>(null);

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

  const handleEditFolder = (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingFolder(folderId);
    setIsFolderModalOpen(true);
  };

  const handleEditPlaylist = (e: React.MouseEvent, playlistId: number) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingPlaylist(playlistId);
    setIsPlaylistModalOpen(true);
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
          <button
            onClick={handleAddFolder}
            className="p-1 hover:bg-hover rounded transition-colors"
            title="폴더 추가"
          >
            <Plus size={14} className="text-text-muted" />
          </button>
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
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-grab active:cursor-grabbing transition-colors group ${
                          selectedFolderId === folder.id
                            ? "bg-accent text-white"
                            : "hover:bg-hover text-text-primary"
                        } ${snapshot.isDragging ? "opacity-50" : ""}`}
                      >
                        <span className="flex-1 text-sm font-medium truncate">
                          {folder.name || folder.path}
                        </span>
                        <button
                          onClick={(e) => handleEditFolder(e, folder.id)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`ml-2 p-1 rounded transition-all cursor-pointer ${
                            selectedFolderId === folder.id
                              ? "opacity-100"
                              : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                          }`}
                        >
                          <Settings size={14} />
                        </button>
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
          <button
            onClick={handleCreatePlaylist}
            className="p-1 hover:bg-hover rounded transition-colors"
            title="플레이리스트 추가"
          >
            <Plus size={14} className="text-text-muted" />
          </button>
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
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-grab active:cursor-grabbing transition-colors group ${
                          selectedPlaylistId === playlist.id
                            ? "bg-accent text-white"
                            : "hover:bg-hover text-text-primary"
                        } ${snapshot.isDragging ? "opacity-50" : ""}`}
                      >
                        <span className="flex-1 text-sm font-medium truncate">
                          {playlist.name}
                        </span>
                        <button
                          onClick={(e) => handleEditPlaylist(e, playlist.id)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`ml-2 p-1 rounded transition-all cursor-pointer ${
                            selectedPlaylistId === playlist.id
                              ? "opacity-100"
                              : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                          }`}
                        >
                          <Settings size={14} />
                        </button>
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
        onDelete={
          editingFolder
            ? async () => {
                await removeFolder(editingFolder);
                setEditingFolder(null);
              }
            : undefined
        }
        folder={editingFolder ? folders.find((f) => f.id === editingFolder) : null}
      />
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => {
          setIsPlaylistModalOpen(false);
          setEditingPlaylist(null);
        }}
        onConfirm={handlePlaylistConfirm}
        onDelete={
          editingPlaylist
            ? async () => {
                await removePlaylist(editingPlaylist);
                setEditingPlaylist(null);
              }
            : undefined
        }
        playlist={editingPlaylist ? playlists.find((p) => p.id === editingPlaylist) : null}
      />
    </div>
  );
};
