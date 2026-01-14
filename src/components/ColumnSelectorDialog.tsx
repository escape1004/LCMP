import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { AVAILABLE_COLUMNS, useTableColumnsStore, ColumnKey } from '../stores/tableColumnsStore';

interface ColumnSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ColumnSelectorDialog = ({ open, onOpenChange }: ColumnSelectorDialogProps) => {
  const { visibleColumns, setColumns } = useTableColumnsStore();
  const [tempColumns, setTempColumns] = useState<ColumnKey[]>(visibleColumns);

  useEffect(() => {
    if (open) {
      setTempColumns(visibleColumns);
    }
  }, [open, visibleColumns]);

  const handleToggle = (column: ColumnKey) => {
    const newColumns = tempColumns.includes(column)
      ? tempColumns.filter(c => c !== column)
      : [...tempColumns, column];
    
    // 최소 1개 컬럼은 유지
    if (newColumns.length > 0) {
      setTempColumns(newColumns);
    }
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
            표시할 컬럼 선택
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
          <div className="space-y-2">
            {AVAILABLE_COLUMNS.map((column) => {
              const isChecked = tempColumns.includes(column.key);
              const isDisabled = isChecked && tempColumns.length === 1;
              
              return (
                <label
                  key={column.key}
                  className={`flex items-center space-x-2 p-2 rounded hover:bg-hover ${
                    isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleToggle(column.key)}
                  />
                  <span className="text-sm text-text-primary">
                    {column.label}
                  </span>
                </label>
              );
            })}
          </div>
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
