'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface DropdownItem {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly onClick?: () => void;
  readonly variant?: 'default' | 'danger';
  readonly disabled?: boolean;
}

export interface DropdownProps {
  readonly trigger: ReactNode;
  readonly items: readonly DropdownItem[];
  readonly align?: 'left' | 'right';
  readonly className?: string;
}

export function Dropdown({ trigger, items, align = 'right', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <div onClick={() => setOpen((prev) => !prev)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-[10rem] rounded-md border border-border bg-card p-1 text-card-foreground shadow-md animate-in fade-in-0 zoom-in-95',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors text-left focus:outline-none disabled:pointer-events-none disabled:opacity-50',
                item.variant === 'danger'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
