import { transcriptFormatUnsupported, transcriptValidationFailed } from './video-transcript.errors';
import type { TranscriptSegmentInput } from './video-transcript.schemas';

const SRT_TIME = /^(?<start>\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(?<end>\d{2}:\d{2}:\d{2},\d{3})/;
const VTT_TIME = /^(?<start>(?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+(?<end>(?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

export function parseTimestampMs(value: string) {
  const normalized = value.replace(',', '.');
  const parts = normalized.split(':');
  const secondsPart = parts.at(-1);

  if (!secondsPart) {
    throw transcriptValidationFailed([`Invalid transcript timestamp: ${value}`]);
  }

  const [secondsText, millisText = '0'] = secondsPart.split('.');
  const seconds = Number(secondsText);
  const minutes = Number(parts.at(-2) ?? 0);
  const hours = Number(parts.length === 3 ? parts[0] : 0);
  const millis = Number(millisText.padEnd(3, '0').slice(0, 3));

  if ([hours, minutes, seconds, millis].some((part) => !Number.isFinite(part)) || minutes > 59 || seconds > 59) {
    throw transcriptValidationFailed([`Invalid transcript timestamp: ${value}`]);
  }

  return ((hours * 60 * 60) + (minutes * 60) + seconds) * 1000 + millis;
}

export function parseTranscriptFile(filename: string, content: string): TranscriptSegmentInput[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.srt')) {
    return parseSrt(content);
  }
  if (lower.endsWith('.vtt')) {
    return parseWebVtt(content);
  }
  throw transcriptFormatUnsupported();
}

export function parseSrt(content: string): TranscriptSegmentInput[] {
  return parseBlocks(content, SRT_TIME, true);
}

export function parseWebVtt(content: string): TranscriptSegmentInput[] {
  const withoutHeader = content.replace(/^\uFEFF?WEBVTT[^\n\r]*(?:\r?\n)+/i, '');
  return parseBlocks(withoutHeader, VTT_TIME, false);
}

function parseBlocks(content: string, timingRegex: RegExp, allowIndexLine: boolean) {
  const blocks = content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const segments: TranscriptSegmentInput[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const timingIndex = allowIndexLine && /^\d+$/.test(lines[0] ?? '') ? 1 : 0;
    const timingLine = lines[timingIndex] ?? '';
    const match = timingRegex.exec(timingLine);
    if (!match?.groups) {
      continue;
    }

    const text = lines.slice(timingIndex + 1)
      .filter((line) => !line.startsWith('NOTE') && !line.includes('-->'))
      .join('\n')
      .trim();

    if (!text) {
      continue;
    }

    const start = match.groups.start;
    const end = match.groups.end;
    if (!start || !end) {
      continue;
    }

    segments.push({
      startTimeMs: parseTimestampMs(start),
      endTimeMs: parseTimestampMs(end),
      text,
    });
  }

  if (segments.length === 0) {
    throw transcriptValidationFailed(['Transcript must contain at least one valid segment']);
  }

  return segments;
}
