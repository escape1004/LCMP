import { useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { X } from 'lucide-react';

export const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-10 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: { id: string; message: string; duration?: number };
  onClose: () => void;
}

const ToastItem = ({ toast, onClose }: ToastItemProps) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (toast.duration) {
      const timer = setTimeout(() => {
        handleClose();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleClose = () => {
    setIsExiting(true);
    // 애니메이션이 끝난 후 실제로 제거
    setTimeout(() => {
      onClose();
    }, 300); // 애니메이션 duration과 동일하게
  };

  return (
    <div 
      className={`bg-[#18191c] text-text-primary px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[200px] max-w-[400px] pointer-events-auto ${
        isExiting ? 'toast-item-exit' : 'toast-item-enter'
      }`}
    >
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={handleClose}
        className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors duration-150"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
