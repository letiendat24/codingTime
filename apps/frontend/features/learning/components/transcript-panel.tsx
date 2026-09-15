'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Search } from 'lucide-react';
import type { StudentTranscript, TranscriptSegment } from '../../../lib/api';
import { Button, EmptyState, Input, Select } from '../../../design-system';
import { formatTime } from '../../../lib/video-learning';
import { useI18n } from '../../../providers/i18n-provider';
import {
  findActiveTranscriptSegmentIndex,
  searchTranscriptSegments,
} from './transcript-view-model';

export interface TranscriptPanelProps {
  readonly transcript: StudentTranscript | null;
  readonly tracks: readonly { readonly id: string; readonly language: string; readonly title: string | null; readonly segmentCount: number }[];
  readonly currentSecond: number;
  readonly selectedTrackId: string | null;
  readonly onSelectTrack: (trackId: string) => void;
  readonly onSeek: (seconds: number) => void;
}

export function TranscriptPanel({
  transcript,
  tracks,
  currentSecond,
  selectedTrackId,
  onSelectTrack,
  onSeek,
}: TranscriptPanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [followPlayback, setFollowPlayback] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastManualScrollAtRef = useRef(0);

  const segments = transcript?.segments ?? [];
  const activeIndex = useMemo(
    () => findActiveTranscriptSegmentIndex(segments, Math.floor(currentSecond * 1000)),
    [currentSecond, segments],
  );
  const results = useMemo(() => searchTranscriptSegments(segments, query), [query, segments]);
  const visibleSegments = query.trim() ? results : segments;

  useEffect(() => {
    if (!followPlayback || query.trim() || activeIndex < 0) {
      return;
    }

    if (Date.now() - lastManualScrollAtRef.current < 5000) {
      return;
    }

    activeButtonRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, followPlayback, query]);

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <EmptyState
          icon={<Captions className="h-8 w-8" />}
          title={t('learning.noTranscriptAvailable')}
          description={t('learning.noTranscriptAvailable')}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('learning.transcript')}</h3>
          <p className="text-xs text-muted-foreground">
            {transcript ? `${transcript.language} · ${segments.length} ${t('learning.segments').toLowerCase()}` : t('learning.noTranscriptAvailable')}
          </p>
        </div>
        <Select
          aria-label={t('learning.language')}
          className="h-9 sm:w-36"
          value={selectedTrackId ?? ''}
          onChange={(event) => onSelectTrack(event.target.value)}
          options={tracks.map((track) => ({
            value: track.id,
            label: track.title ?? track.language.toUpperCase(),
          }))}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={t('learning.searchTranscript')}
            className="pl-8"
            value={query}
            placeholder={t('learning.searchTranscript')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button size="sm" variant={followPlayback ? 'secondary' : 'ghost'} onClick={() => setFollowPlayback(true)}>
          {t('learning.followPlayback')}
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="mt-3 max-h-[420px] space-y-0.5 overflow-y-auto pr-1"
        onScroll={() => {
          lastManualScrollAtRef.current = Date.now();
          setFollowPlayback(false);
        }}
      >
        {visibleSegments.length > 0 ? (
          visibleSegments.map((segment) => {
            const isActive = segments[activeIndex]?.id === segment.id;
            return (
              <TranscriptRow
                key={segment.id}
                segment={segment}
                isActive={isActive}
                refCallback={(element) => {
                  if (isActive) {
                    activeButtonRef.current = element;
                  }
                }}
                onSeek={() => onSeek(segment.startTimeMs / 1000)}
              />
            );
          })
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('learning.noResults')}</p>
        )}
      </div>
    </div>
  );
}

function TranscriptRow({
  segment,
  isActive,
  onSeek,
  refCallback,
}: {
  readonly segment: TranscriptSegment;
  readonly isActive: boolean;
  readonly onSeek: () => void;
  readonly refCallback: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      aria-current={isActive ? 'true' : undefined}
      onClick={onSeek}
      className={`grid w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
        isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <span className={`font-mono text-xs ${isActive ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
        {formatTime(Math.floor(segment.startTimeMs / 1000))}
      </span>
      <span className={isActive ? 'font-medium leading-6' : 'leading-6'}>{segment.text}</span>
    </button>
  );
}
