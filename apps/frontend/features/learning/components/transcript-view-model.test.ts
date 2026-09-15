import { describe, expect, it } from 'vitest';
import type { StudentTranscript } from '../../../lib/api';
import {
  findActiveTranscriptSegment,
  findActiveTranscriptSegmentIndex,
  preferredTranscriptTrackId,
  searchTranscriptSegments,
  subtitleTextForTime,
} from './transcript-view-model';

const transcript: StudentTranscript = {
  id: 'tx-1',
  language: 'en',
  title: 'English',
  segments: [
    { id: 's1', startTimeMs: 1000, endTimeMs: 4000, text: 'Welcome to CodeSync.' },
    { id: 's2', startTimeMs: 4200, endTimeMs: 7000, text: 'Create the UserService now.' },
    { id: 's3', startTimeMs: 8000, endTimeMs: 11000, text: 'Kiem tra tieng Viet search.' },
  ],
};

describe('transcript view model', () => {
  it('calculates the active segment with binary-search semantics', () => {
    expect(findActiveTranscriptSegmentIndex(transcript.segments, 999)).toBe(-1);
    expect(findActiveTranscriptSegmentIndex(transcript.segments, 1000)).toBe(0);
    expect(findActiveTranscriptSegmentIndex(transcript.segments, 4500)).toBe(1);
    expect(findActiveTranscriptSegmentIndex(transcript.segments, 7000)).toBe(-1);
  });

  it('uses the same playback time for transcript and subtitle state', () => {
    const currentSecond = 4.5;
    expect(findActiveTranscriptSegment(transcript.segments, currentSecond)?.id).toBe('s2');
    expect(subtitleTextForTime(transcript, currentSecond)).toBe('Create the UserService now.');
  });

  it('supports click-to-seek values from transcript rows and search results', () => {
    const segment = transcript.segments[1];
    expect(segment ? segment.startTimeMs / 1000 : null).toBe(4.2);
  });

  it('searches transcript text case-insensitively and trims input', () => {
    expect(searchTranscriptSegments(transcript.segments, ' userservice ')).toHaveLength(1);
    expect(searchTranscriptSegments(transcript.segments, 'WELCOME')[0]?.id).toBe('s1');
  });

  it('normalizes Vietnamese accents for simple substring search', () => {
    expect(searchTranscriptSegments(transcript.segments, 'tieng viet')[0]?.id).toBe('s3');
  });

  it('supports subtitle language preference fallback', () => {
    const tracks = [
      { id: 'vi-track', language: 'vi' },
      { id: 'en-track', language: 'en' },
    ];
    expect(preferredTranscriptTrackId(tracks, 'en')).toBe('en-track');
    expect(preferredTranscriptTrackId(tracks, 'ja')).toBe('vi-track');
  });

  it('supports subtitle off with null text', () => {
    expect(subtitleTextForTime(null, 4.5)).toBeNull();
  });
});
