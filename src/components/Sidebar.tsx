import { useEffect, useState } from "react";
import { LayoutDashboard, Plus, Settings, ChevronUp } from "lucide-react";
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
    removeFolder,
    selectFolder,
  } = useFolderStore();

  const {
    playlists,
    selectedPlaylistId,
    loadPlaylists,
    createPlaylist,
    updatePlaylist,
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

  return (
    <div className="w-64 bg-bg-sidebar flex flex-col h-full">
      {/* Dashboard Menu */}
      <div className="px-3 py-2">
        <button
          onClick={handleDashboardClick}
          className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-hover transition-colors text-text-primary"
        >
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">대시보드</span>
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-2"></div>

      {/* Folder Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2 group">
        <div className="mb-2 flex items-center justify-between px-3 py-1">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
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
        <div className="space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => {
                selectFolder(folder.id);
                selectPlaylist(null);
              }}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors group ${
                selectedFolderId === folder.id
                  ? "bg-accent text-white"
                  : "hover:bg-hover text-text-primary"
              }`}
            >
              <span className="flex-1 text-sm font-medium truncate">
                {folder.name || folder.path}
              </span>
              <button
                onClick={(e) => handleEditFolder(e, folder.id)}
                className={`ml-2 p-1 rounded transition-opacity ${
                  selectedFolderId === folder.id
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-70 hover:opacity-100"
                }`}
              >
                <Settings size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Playlist Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2 group">
        <div className="mb-2 flex items-center justify-between px-3 py-1">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
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
        <div className="space-y-1">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => {
                selectPlaylist(playlist.id);
                selectFolder(null);
              }}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors group ${
                selectedPlaylistId === playlist.id
                  ? "bg-accent text-white"
                  : "hover:bg-hover text-text-primary"
              }`}
            >
              <span className="flex-1 text-sm font-medium truncate">
                {playlist.name}
              </span>
              <button
                onClick={(e) => handleEditPlaylist(e, playlist.id)}
                className={`ml-2 p-1 rounded transition-opacity ${
                  selectedPlaylistId === playlist.id
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-70 hover:opacity-100"
                }`}
              >
                <Settings size={14} />
              </button>
            </div>
          ))}
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
