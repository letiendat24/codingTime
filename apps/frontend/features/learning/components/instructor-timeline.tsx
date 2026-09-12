'use client';

import { Camera, Clock } from 'lucide-react';
import { Badge } from '../../../design-system';
import { formatTime } from '../../../lib/video-learning';

export interface SnapshotItem {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly title: string | null;
  readonly language: string;
}

export interface InstructorTimelineProps {
  readonly currentSecond: number;
  readonly snapshots: readonly SnapshotItem[];
  readonly activeSnapshotId?: string | undefined;
  readonly onSelectSnapshot: (snapshot: SnapshotItem) => void;
}

export function InstructorTimeline({
  currentSecond,
  snapshots,
  activeSnapshotId,
  onSelectSnapshot,
}: InstructorTimelineProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="mb-2.5 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Camera className="h-3.5 w-3.5 text-primary" />
          <span>Instructor Code Timeline</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground font-mono">
          <Clock className="h-3 w-3" />
          <span>{formatTime(currentSecond)}</span>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
        {snapshots.length > 0 ? (
          snapshots.map((snapshot) => {
            const isActive = snapshot.id === activeSnapshotId;
            return (
              <button
                key={snapshot.id}
                type="button"
                onClick={() => onSelectSnapshot(snapshot)}
                className={`min-w-36 shrink-0 rounded-md border p-2.5 text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary'
                    : 'border-border bg-muted/40 hover:bg-muted hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {formatTime(snapshot.timestampSeconds)}
                  </span>
                  {isActive ? (
                    <Badge tone="info" className="text-[9px] px-1 py-0">
                      Active
                    </Badge>
                  ) : null}
                </div>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {snapshot.title ?? `${snapshot.language} snapshot`}
                </span>
              </button>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground py-2">No instructor snapshots available for this lesson.</p>
        )}
      </div>
    </div>
  );
}
