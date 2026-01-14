import { useState, useEffect } from 'react';
import { X, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult, DragStart } from '@hello-pangea/dnd';
import { Button } from './ui/button';
import { AVAILABLE_COLUMNS, useTableColumnsStore, ColumnKey } from '../stores/tableColumnsStore';
import { useToastStore } from '../stores/toastStore';

interface ColumnSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ColumnSelectorDialog = ({ open, onOpenChange }: ColumnSelectorDialogProps) => {
  const { visibleColumns, setColumns } = useTableColumnsStore();
  const { showToast } = useToastStore();
  const [tempColumns, setTempColumns] = useState<ColumnKey[]>(visibleColumns);

  useEffect(() => {
    if (open) {
      setTempColumns(visibleColumns);
    }
  }, [open, visibleColumns]);

  const handleToggle = (column: ColumnKey) => {
    let newColumns: ColumnKey[];
    
    if (tempColumns.includes(column)) {
      // 체크 해제
      newColumns = tempColumns.filter(c => c !== column);
    } else {
      // 체크 추가
      newColumns = [...tempColumns, column];
      
      // 앨범아트를 체크하면 항상 최상단으로 이동
      if (column === 'album_art') {
        const albumArtIndex = newColumns.indexOf('album_art');
        if (albumArtIndex > 0) {
          newColumns.splice(albumArtIndex, 1);
          newColumns.unshift('album_art');
        }
      }
    }
    
    // 최소 1개 컬럼은 유지
    if (newColumns.length > 0) {
      setTempColumns(newColumns);
    }
  };

  const handleDragStart = (start: DragStart) => {
    // 앨범 아트 드래그 시도 시 토스트 메시지 표시
    if (start.draggableId === 'album_art') {
      showToast('앨범 아트의 순서는 변경할 수 없습니다.');
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    
    if (sourceIndex === destinationIndex) return;
    
    // 앨범 아트는 드래그 불가
    if (result.draggableId === 'album_art') return;
    
    // tempColumns에서 선택된 컬럼들만 순서 변경
    const selectedColumns = tempColumns;
    const newOrder = Array.from(selectedColumns);
    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(destinationIndex, 0, removed);
    
    setTempColumns(newOrder);
  };

  const handleSave = async () => {
    // 앨범아트가 있으면 항상 첫 번째로 이동
    let finalColumns = [...tempColumns];
    const albumArtIndex = finalColumns.indexOf('album_art');
    if (albumArtIndex > 0) {
      finalColumns.splice(albumArtIndex, 1);
      finalColumns.unshift('album_art');
    }
    // 앨범아트가 없으면 그대로 유지 (첫 번째에 강제 추가하지 않음)
    
    await setColumns(finalColumns);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempColumns(visibleColumns);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">
            표시할 컬럼
          </h2>
          <button
            onClick={handleCancel}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <Droppable droppableId="column-selector">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {tempColumns.map((columnKey, index) => {
                    const column = AVAILABLE_COLUMNS.find(c => c.key === columnKey);
                    if (!column) return null;
                    
                    const isAlbumArt = columnKey === 'album_art';
                    
                    return (
                      <Draggable 
                        key={columnKey} 
                        draggableId={columnKey} 
                        index={index}
                        isDragDisabled={isAlbumArt}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center space-x-2 p-2 rounded hover:bg-hover ${
                              snapshot.isDragging ? 'bg-hover' : ''
                            } ${
                              tempColumns.length === 1 ? 'opacity-50' : 'cursor-pointer'
                            }`}
                          >
                            <div 
                              {...(!isAlbumArt ? provided.dragHandleProps : {})} 
                              className="text-text-muted hover:text-text-primary"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (isAlbumArt) {
                                  e.preventDefault();
                                  showToast('앨범 아트의 순서는 변경할 수 없습니다.');
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <label className="flex items-center space-x-2 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={true}
                                disabled={tempColumns.length === 1}
                                onChange={() => handleToggle(column.key)}
                              />
                              <span className="text-sm text-text-primary">
                                {column.label}
                              </span>
                            </label>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  
                  {/* 선택되지 않은 컬럼들 */}
                  {AVAILABLE_COLUMNS.filter(col => !tempColumns.includes(col.key)).map((column) => (
                    <label
                      key={column.key}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-hover cursor-pointer"
                    >
                      <div className="w-4 h-4" /> {/* 드래그 핸들 공간 */}
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => handleToggle(column.key)}
                      />
                      <span className="text-sm text-text-primary flex-1">
                        {column.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-end gap-3 p-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
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
