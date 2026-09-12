import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly total?: number | undefined;
  readonly onPageChange: (page: number) => void;
  readonly className?: string | undefined;
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      {total !== undefined ? (
        <span className="text-xs text-muted-foreground">
          Total: <strong className="text-foreground">{total}</strong> items
        </span>
      ) : <div />}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:inline-block sm:ml-1">Previous</span>
        </Button>
        <span className="text-xs font-medium text-foreground px-2">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="sr-only sm:not-sr-only sm:inline-block sm:mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
