import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
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
    await setColumns(tempColumns);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempColumns(visibleColumns);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>표시할 컬럼 선택</DialogTitle>
          <DialogDescription>
            테이블에 표시할 컬럼을 선택하세요. 최소 1개 이상의 컬럼을 선택해야 합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {AVAILABLE_COLUMNS.map((column) => {
            const isChecked = tempColumns.includes(column.key);
            const isDisabled = isChecked && tempColumns.length === 1;
            
            return (
              <label
                key={column.key}
                className={`flex items-center space-x-2 p-2 rounded hover:bg-hover cursor-pointer ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isDisabled}
                  onChange={() => handleToggle(column.key)}
                  className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
                />
                <span className="text-sm text-text-primary">{column.label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            저장
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
