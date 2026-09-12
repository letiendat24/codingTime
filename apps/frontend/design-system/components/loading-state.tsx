import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LoadingStateProps {
  readonly title?: string | undefined;
  readonly message?: string | undefined;
  readonly className?: string | undefined;
}

export function LoadingState({ title, message = 'Loading...', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center text-muted-foreground', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {title ? <p className="mt-3 text-base font-semibold text-foreground">{title}</p> : null}
      <p className={cn('text-sm font-medium', title ? 'mt-1 text-muted-foreground' : 'mt-3')}>{message}</p>
    </div>
  );
}
