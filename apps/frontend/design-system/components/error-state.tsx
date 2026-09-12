import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { Card, CardContent } from './card';

export interface ErrorStateProps {
  readonly title: string;
  readonly description?: string;
  readonly message?: string;
  readonly onRetry?: () => void;
  readonly action?: ReactNode;
}

export function ErrorState({ title, description, message, onRetry, action }: ErrorStateProps) {
  const desc = description ?? message;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-destructive">{title}</h3>
          {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
          <div className="mt-3 flex gap-2">
            {onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
