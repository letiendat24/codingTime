import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label?: string;
}

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const input = (
    <input
      id={id}
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border-border text-primary focus:ring-primary/20 accent-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );

  if (!label) {
    return input;
  }

  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
      {input}
      <span>{label}</span>
    </label>
  );
}
