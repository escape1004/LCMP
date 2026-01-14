import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useFolderStore } from '../stores/folderStore';
import { usePlaylistStore } from '../stores/playlistStore';
import { useSongStore } from '../stores/songStore';
import { useQueueStore } from '../stores/queueStore';
import { useTableColumnsStore, AVAILABLE_COLUMNS, ColumnKey } from '../stores/tableColumnsStore';
import { Song } from '../types';
import { invoke } from '@tauri-apps/api/tauri';
import { ColumnSelectorDialog } from './ColumnSelectorDialog';
import { ArrowUp, ArrowDown } from 'lucide-react';

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  if (seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const PlaylistView = () => {
  const { folders, selectedFolderId } = useFolderStore();
  const { playlists, selectedPlaylistId } = usePlaylistStore();
  // songs와 songsVersion을 함께 구독하여 변경사항을 확실히 감지
  const storeSongs = useSongStore((state) => state.songs);
  const songsVersion = useSongStore((state) => state.songsVersion);
  const isLoading = useSongStore((state) => state.isLoading);
  const generatingWaveformSongId = useSongStore((state) => state.generatingWaveformSongId);
  const loadSongsByFolder = useSongStore((state) => state.loadSongsByFolder);
  const loadSongsByPlaylist = useSongStore((state) => state.loadSongsByPlaylist);
  const clearSongs = useSongStore((state) => state.clearSongs);
  const checkGeneratingWaveform = useSongStore((state) => state.checkGeneratingWaveform);
  
  // songsVersion이 변경되면 강제로 리렌더링
  const [songs, setSongs] = useState<Song[]>(storeSongs);
  
  useEffect(() => {
    // songsVersion이 변경되면 무조건 업데이트 (강제 리렌더링)
    setSongs([...storeSongs]);
  }, [songsVersion]);
  
  // storeSongs 참조가 변경될 때도 업데이트
  useEffect(() => {
    setSongs([...storeSongs]);
  }, [storeSongs]);
  
  const { playSong } = useQueueStore();
  const [totalSize, setTotalSize] = useState<number>(0);
  const [isLoadingSize, setIsLoadingSize] = useState(false);
  
  // 컬럼 설정
  const { visibleColumns, columnWidths, sortColumn, sortOrder, loadColumns, loadColumnWidths, setColumnWidth, toggleSort, reorderColumns, isLoading: isLoadingColumns } = useTableColumnsStore();
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  
  // 컬럼 설정 로드 (앱 시작 시 한 번만)
  useEffect(() => {
    loadColumns();
    loadColumnWidths();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 임시 컬럼 너비 상태 (드래그 중에만 사용)
  const [tempColumnWidths, setTempColumnWidths] = useState<Record<ColumnKey, number>>(columnWidths);

  // 컬럼 너비가 변경되면 임시 상태도 업데이트
  useEffect(() => {
    setTempColumnWidths(columnWidths);
  }, [columnWidths]);

  // 컬럼 너비 리사이즈 핸들러
  const handleResizeStart = (e: React.MouseEvent, columnKey: ColumnKey) => {
    // 앨범아트는 리사이즈 불가
    if (columnKey === 'album_art') {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[columnKey] || 150);
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(80, resizeStartWidth + diff); // 최소 너비 80px
      // 임시 상태만 업데이트 (드래그 중에는 저장하지 않음)
      setTempColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = async () => {
      // 드래그가 끝나면 실제로 저장
      if (resizingColumn) {
        const finalWidth = tempColumnWidths[resizingColumn];
        await setColumnWidth(resizingColumn, finalWidth);
      }
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth, tempColumnWidths, setColumnWidth]);

  const handleSongDoubleClick = async (song: Song) => {
    // 웨이폼이 없는 노래는 더블클릭 비활성화
    if (!song.waveform_data) {
      return;
    }
    
    try {
      // 대기열에 추가하고 재생
      await playSong(song);
    } catch (error) {
      console.error('Failed to play song:', error);
    }
  };

  useEffect(() => {
    if (selectedFolderId !== null) {
      loadSongsByFolder(selectedFolderId);
    } else if (selectedPlaylistId !== null) {
      loadSongsByPlaylist(selectedPlaylistId);
    } else {
      clearSongs();
    }
  }, [selectedFolderId, selectedPlaylistId, loadSongsByFolder, loadSongsByPlaylist, clearSongs]);

  // 웨이폼 생성 상태 주기적으로 확인
  useEffect(() => {
    const interval = setInterval(() => {
      checkGeneratingWaveform();
    }, 500); // 0.5초마다 확인

    // 초기 확인
    checkGeneratingWaveform();

    return () => clearInterval(interval);
  }, [checkGeneratingWaveform]);


  // 정렬된 노래 목록
  const sortedSongs = useMemo(() => {
    if (!sortColumn || !sortOrder) {
      return songs;
    }

    const sorted = [...songs];
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'title':
          aValue = a.title || '';
          bValue = b.title || '';
          break;
        case 'artist':
          aValue = a.artist || '';
          bValue = b.artist || '';
          break;
        case 'album':
          aValue = a.album || '';
          bValue = b.album || '';
          break;
        case 'duration':
          aValue = a.duration ?? 0;
          bValue = b.duration ?? 0;
          break;
        case 'year':
          aValue = a.year ?? 0;
          bValue = b.year ?? 0;
          break;
        case 'genre':
          aValue = a.genre || '';
          bValue = b.genre || '';
          break;
        case 'file_name':
          aValue = a.file_path.split(/[/\\]/).pop() || '';
          bValue = b.file_path.split(/[/\\]/).pop() || '';
          break;
        case 'file_path':
          aValue = a.file_path || '';
          bValue = b.file_path || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          aValue = new Date(a.updated_at).getTime();
          bValue = new Date(b.updated_at).getTime();
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue, 'ko', { numeric: true })
          : bValue.localeCompare(aValue, 'ko', { numeric: true });
      } else {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    return sorted;
  }, [songs, sortColumn, sortOrder]);

  // 전체 재생 시간 계산
  const totalDuration = useMemo(() => {
    return songs.reduce((sum, song) => {
      const duration = song.duration ?? 0;
      return sum + duration;
    }, 0);
  }, [songs]);

  // 파일 크기 계산
  useEffect(() => {
    const calculateTotalSize = async () => {
      if (songs.length === 0) {
        setTotalSize(0);
        return;
      }

      setIsLoadingSize(true);
      try {
        const filePaths = songs.map(song => song.file_path);
        const results = await invoke<Array<[string, number]>>('get_file_sizes', {
          filePaths,
        });
        
        const total = results.reduce((sum, [, size]) => sum + size, 0);
        setTotalSize(total);
      } catch (error) {
        console.error('Failed to calculate total size:', error);
        setTotalSize(0);
      } finally {
        setIsLoadingSize(false);
      }
    };

    calculateTotalSize();
  }, [songs]);

  const getTitle = () => {
    if (selectedFolderId !== null) {
      const folder = folders.find((f) => f.id === selectedFolderId);
      return folder ? folder.name : '폴더 노래';
    }
    if (selectedPlaylistId !== null) {
      const playlist = playlists.find((p) => p.id === selectedPlaylistId);
      return playlist ? playlist.name : '플레이리스트 노래';
    }
    return '재생 목록';
  };

  // 컬럼 드래그 핸들러
  const handleColumnDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    
    if (sourceIndex === destinationIndex) return;
    
    const newOrder = Array.from(visibleColumns);
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(destinationIndex, 0, removed);
    
    reorderColumns(newOrder);
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-text-primary">
          {getTitle()}
          {(selectedFolderId !== null || selectedPlaylistId !== null) && (
            <span className="text-xs text-text-muted font-normal ml-2">
              {' '}
              (
              {isLoadingSize ? (
                <span>계산 중...</span>
              ) : (
                <>
                  {formatFileSize(totalSize)} / {formatDuration(totalDuration)}
                </>
              )}
              )
            </span>
          )}
        </h2>
      </div>

      {/* Song List Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-text-muted text-sm">로딩 중...</div>
          </div>
        ) : songs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-text-muted text-sm">노래를 추가해주세요</div>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleColumnDragEnd}>
            <div className="overflow-x-auto bg-bg-primary">
              <table style={{ 
                tableLayout: 'fixed', 
                width: visibleColumns.reduce((sum, key) => sum + (tempColumnWidths[key] || 150), 0) + 'px',
                borderCollapse: 'collapse'
              }} className="bg-bg-primary">
              <thead className="sticky top-0 bg-bg-primary border-b border-border z-10">
                <tr className="bg-bg-primary relative" style={{ position: 'relative' }}>
                  <Droppable droppableId="columns" direction="horizontal">
                    {(provided) => (
                      <>
                        {visibleColumns.map((columnKey, index) => {
                          const column = AVAILABLE_COLUMNS.find(c => c.key === columnKey);
                          if (!column) return null;
                          
                          const width = tempColumnWidths[columnKey] || 150;
                          const isSortable = column.sortable !== false;
                          const isSorted = sortColumn === columnKey;
                          const isAlbumArt = columnKey === 'album_art';
                          const isLastColumn = index === visibleColumns.length - 1;
                          const sortIcon = isSorted && sortOrder === 'asc' 
                            ? <ArrowUp className="w-3 h-3 ml-1 text-white" />
                            : isSorted && sortOrder === 'desc'
                            ? <ArrowDown className="w-3 h-3 ml-1 text-white" />
                            : null;
                          
                          return (
                            <Draggable
                              key={columnKey}
                              draggableId={columnKey}
                              index={index}
                              isDragDisabled={columnKey === 'album_art'} // 앨범아트는 드래그 불가
                            >
                              {(provided, snapshot) => (
                                <th
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    width: `${width}px`,
                                    minWidth: `${width}px`,
                                    maxWidth: `${width}px`,
                                    ...(isAlbumArt ? {
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 20,
                                    } : {}),
                                  }}
                                  className={`text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide select-none relative overflow-hidden text-ellipsis whitespace-nowrap transition-colors ${
                                    isAlbumArt ? 'bg-bg-primary group-hover:bg-hover' : ''
                                  } ${
                                    snapshot.isDragging ? 'bg-hover' : ''
                                  } ${
                                    isSortable ? 'cursor-pointer hover:bg-hover' : 'cursor-default'
                                  }`}
                                  onClick={() => {
                                    if (isSortable) {
                                      toggleSort(columnKey);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setIsColumnDialogOpen(true);
                                  }}
                                >
                                  <div
                                    {...provided.dragHandleProps}
                                    className="flex items-center justify-between min-w-0"
                                  >
                                    <div className="flex items-center min-w-0">
                                      <span className="truncate">{column.label}</span>
                                      {sortIcon}
                                    </div>
                                  </div>
                                  {/* 리사이즈 핸들 (앨범아트 제외) */}
                                  {!isAlbumArt && (
                                    <div
                                      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors group"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleResizeStart(e, columnKey);
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      style={{ zIndex: 10 }}
                                    >
                                      <div className="absolute top-0 right-0 w-0.5 h-full bg-transparent group-hover:bg-accent" />
                                    </div>
                                  )}
                                </th>
                              )}
                            </Draggable>
                          );
                        })}
                        {/* 헤더 빈 공간을 채우는 실제 셀 */}
                        <th 
                          className="bg-bg-primary border-b border-border"
                          style={{
                            position: 'absolute',
                            left: '100%',
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: '100vw',
                            padding: 0,
                            margin: 0,
                            height: '100%'
                          }}
                        />
                        {provided.placeholder}
                      </>
                    )}
                  </Droppable>
                </tr>
              </thead>
            <tbody className="bg-bg-primary">
              {sortedSongs.map((song) => {
                const hasWaveform = song.waveform_data !== null && song.waveform_data !== '';
                const isGenerating = generatingWaveformSongId === song.id;
                // songsVersion과 waveform_data를 key에 포함하여 변경 시 리렌더링 보장
                const rowKey = `${song.id}-${songsVersion}-${song.waveform_data ? '1' : '0'}`;
                
                const renderCell = (columnKey: ColumnKey) => {
                  switch (columnKey) {
                    case 'album_art':
                      return (
                        <div className="flex items-center justify-center w-full h-12">
                          {song.album_art_path ? (
                            <img
                              src={song.album_art_path}
                              alt={song.album || 'Album'}
                              className="w-12 h-12 object-cover rounded transition-colors duration-150 group-hover:ring-1 group-hover:ring-border"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-hover rounded flex items-center justify-center transition-colors duration-150 group-hover:ring-1 group-hover:ring-border">
                              <span className="text-text-muted text-xs">앨범</span>
                            </div>
                          )}
                        </div>
                      );
                    case 'file_name':
                      const fileName = song.file_path.split(/[/\\]/).pop() || '파일명 없음';
                      return <span className="block truncate">{fileName}</span>;
                    case 'title':
                      return (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{song.title || '제목 없음'}</span>
                          {!hasWaveform && isGenerating && (
                            <span className="text-xs text-text-muted italic flex-shrink-0">
                              (웨이브폼 생성중...)
                            </span>
                          )}
                        </div>
                      );
                    case 'artist':
                      return <span className="block truncate">{song.artist || '아티스트 없음'}</span>;
                    case 'album':
                      return <span className="block truncate">{song.album || '앨범 없음'}</span>;
                    case 'duration':
                      return <span className="block truncate">{formatDuration(song.duration)}</span>;
                    case 'year':
                      return <span className="block truncate">{song.year ? song.year.toString() : '--'}</span>;
                    case 'genre':
                      return <span className="block truncate">{song.genre || '장르 없음'}</span>;
                    case 'file_path':
                      return <span className="block truncate text-xs font-mono">{song.file_path}</span>;
                    case 'created_at':
                      return <span className="block truncate">{new Date(song.created_at).toLocaleDateString('ko-KR')}</span>;
                    case 'updated_at':
                      return <span className="block truncate">{new Date(song.updated_at).toLocaleDateString('ko-KR')}</span>;
                    default:
                      return <span className="block truncate">--</span>;
                  }
                };
                
                return (
                  <tr
                    key={rowKey}
                    className={`border-b border-border transition-colors duration-150 group bg-bg-primary relative ${
                      hasWaveform
                        ? 'hover:bg-hover'
                        : 'opacity-50 cursor-not-allowed bg-bg-secondary'
                    }`}
                    style={{
                      position: 'relative'
                    }}
                    onDoubleClick={() => handleSongDoubleClick(song)}
                  >
                    {visibleColumns.map((columnKey, colIndex) => {
                      const width = tempColumnWidths[columnKey] || 150;
                      const isAlbumArt = columnKey === 'album_art';
                      const isLastColumn = colIndex === visibleColumns.length - 1;
                      
                      // 메타데이터가 있는지 확인
                      const hasValue = (() => {
                        switch (columnKey) {
                          case 'album_art':
                            return !!song.album_art_path;
                          case 'file_name':
                            return !!song.file_path;
                          case 'title':
                            return !!song.title;
                          case 'artist':
                            return !!song.artist;
                          case 'album':
                            return !!song.album;
                          case 'duration':
                            return song.duration !== null && song.duration !== undefined;
                          case 'year':
                            return song.year !== null && song.year !== undefined;
                          case 'genre':
                            return !!song.genre;
                          case 'file_path':
                            return !!song.file_path;
                          case 'created_at':
                            return !!song.created_at;
                          case 'updated_at':
                            return !!song.updated_at;
                          default:
                            return false;
                        }
                      })();
                      
                      return (
                        <td
                          key={columnKey}
                          style={{
                            width: `${width}px`,
                            minWidth: `${width}px`,
                            maxWidth: `${width}px`,
                            ...(isAlbumArt ? {
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                            } : {}),
                          }}
                          className={`px-4 py-3 text-sm overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-150 ${
                            columnKey === 'album_art' 
                              ? `px-2 ${hasWaveform ? 'bg-bg-primary group-hover:bg-hover' : 'bg-bg-primary'}` 
                              : ''
                          } ${
                            hasValue ? 'text-text-primary' : 'text-text-muted'
                          }`}
                        >
                          {renderCell(columnKey)}
                        </td>
                      );
                    })}
                    {/* 빈 공간을 채우는 실제 셀 - 호버 효과와 클릭 이벤트 지원 */}
                    <td 
                      className={`transition-colors duration-150 border-b border-border ${
                        hasWaveform
                          ? 'group-hover:bg-hover bg-bg-primary'
                          : 'bg-bg-secondary opacity-50'
                      }`}
                      style={{
                        position: 'absolute',
                        left: '100%',
                        top: 0,
                        bottom: '-1px',
                        right: 0,
                        width: '100vw',
                        padding: 0,
                        margin: 0,
                        height: 'calc(100% + 1px)'
                      }}
                      onDoubleClick={hasWaveform ? () => handleSongDoubleClick(song) : undefined}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
          </DragDropContext>
        )}
      </div>
      
      {/* 컬럼 선택 다이얼로그 */}
      <ColumnSelectorDialog
        open={isColumnDialogOpen}
        onOpenChange={setIsColumnDialogOpen}
      />
    </div>
  );
};

