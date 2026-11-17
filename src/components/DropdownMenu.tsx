import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../utils';

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
};

export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  className,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: Math.max(8, Math.min(window.innerHeight - 80, rect.bottom + 6)),
      ...(align === 'end'
        ? { right: Math.max(8, window.innerWidth - rect.right) }
        : { left: Math.max(8, rect.left) }),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const close = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const style: CSSProperties | undefined = position
    ? { top: position.top, left: position.left, right: position.right }
    : undefined;

  return (
    <div className={cn('dropdown', className)} ref={triggerRef}>
      <div
        className="dropdown-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        {trigger}
      </div>
      {open && position ? createPortal(
        <div
          ref={menuRef}
          className={cn('dropdown-menu', `align-${align}`)}
          style={style}
          role="menu"
        >
          {items.map((item, index) => {
            if (item.separator) return <div key={`sep-${index}`} className="dropdown-separator" />;
            const Icon = item.icon;
            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                className={cn('dropdown-item', item.danger && 'is-danger')}
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon ? <Icon size={15} /> : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
