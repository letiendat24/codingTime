import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label?: string;
}

export function Switch({ checked, onCheckedChange, label, disabled, className, ...props }: SwitchProps) {
  return (
    <label className={cn('inline-flex items-center gap-2 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          checked ? 'bg-primary' : 'bg-muted',
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform dark:bg-slate-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
      {label ? <span className="text-sm text-foreground">{label}</span> : null}
    </label>
  );
}
