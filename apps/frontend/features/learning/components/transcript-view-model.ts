import type { StudentTranscript, TranscriptSegment } from '../../../lib/api';

export function findActiveTranscriptSegmentIndex(
  segments: readonly TranscriptSegment[],
  currentTimeMs: number,
) {
  let low = 0;
  let high = segments.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (!segment) {
      return -1;
    }

    if (segment.startTimeMs <= currentTimeMs) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const active = segments[candidate];
  return active && currentTimeMs < active.endTimeMs ? candidate : -1;
}

export function findActiveTranscriptSegment(
  segments: readonly TranscriptSegment[],
  currentTimeSeconds: number,
) {
  const index = findActiveTranscriptSegmentIndex(segments, Math.floor(currentTimeSeconds * 1000));
  return index >= 0 ? segments[index] ?? null : null;
}

export function searchTranscriptSegments(
  segments: readonly TranscriptSegment[],
  query: string,
) {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return [];
  }

  return segments.filter((segment) => normalizeSearch(segment.text).includes(normalized));
}

export function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function preferredTranscriptTrackId(
  transcripts: readonly { readonly id: string; readonly language: string }[],
  preferredLanguage: string | null,
) {
  if (preferredLanguage) {
    const match = transcripts.find((track) => track.language === preferredLanguage);
    if (match) {
      return match.id;
    }
  }

  return transcripts[0]?.id ?? null;
}

export function subtitleTextForTime(
  transcript: StudentTranscript | null | undefined,
  currentTimeSeconds: number,
) {
  return findActiveTranscriptSegment(transcript?.segments ?? [], currentTimeSeconds)?.text ?? null;
}
