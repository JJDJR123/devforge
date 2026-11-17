import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../utils';

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => remove(id), kind === 'error' ? 5200 : 3600);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div key={item.id} className={cn('toast', `is-${item.kind}`)} role="status">
              <Icon size={17} strokeWidth={2} />
              <span>{item.message}</span>
              <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="关闭提示">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
