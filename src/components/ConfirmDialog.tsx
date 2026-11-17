import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '../utils';

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => setState({ options, resolve }))
  ), []);

  const close = useCallback((value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const options = state?.options;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        className="confirm-modal"
        ariaLabel={options?.title || '确认操作'}
      >
        <div className="confirm-card">
          <button type="button" className="icon-btn modal-close" onClick={() => close(false)} aria-label="关闭">
            <X size={17} />
          </button>
          <div className={cn('confirm-icon', options?.danger && 'is-danger')}>
            <AlertTriangle size={22} />
          </div>
          <h2 className="confirm-title">{options?.title}</h2>
          {options?.message ? <div className="confirm-message">{options.message}</div> : null}
          <div className="confirm-actions">
            <button type="button" className="btn btn-ghost" onClick={() => close(false)} autoFocus>
              {options?.cancelText || '取消'}
            </button>
            <button
              type="button"
              className={cn('btn', options?.danger ? 'btn-danger' : 'btn-primary')}
              onClick={() => close(true)}
            >
              {options?.confirmText || '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context;
}
