import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../utils';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
};

export function Modal({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  closeOnBackdrop = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add('has-modal');
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) document.documentElement.classList.remove('has-modal');
  }, [open]);

  useEffect(() => () => {
    document.documentElement.classList.remove('has-modal');
  }, []);

  return (
    <dialog
      ref={ref}
      className={cn('df-modal', className)}
      aria-label={ariaLabel}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
