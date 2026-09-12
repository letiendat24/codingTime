import { describe, expect, it } from 'vitest';
import {
  compareCodeFiles,
  findBlockedSeekCheckpoint,
  findPreviousSnapshot,
  findTriggeredCheckpoint,
  formatTime,
  parseTimeString,
  resolvePlaybackUrl,
  selectNextSnapshot,
  selectSnapshotAtOrBefore,
  shouldSaveVideoProgress,
  type VideoLearningCheckpoint,
} from './video-learning';

const checkpoints: readonly VideoLearningCheckpoint[] = [
  {
    id: 'intro',
    timestampSeconds: 30,
    required: false,
    pauseVideo: true,
    completed: false,
  },
  {
    id: 'required',
    timestampSeconds: 60,
    required: true,
    pauseVideo: true,
    completed: false,
  },
  {
    id: 'done',
    timestampSeconds: 90,
    required: true,
    pauseVideo: true,
    completed: true,
  },
];

describe('video learning helpers', () => {
  it('finds the first pause checkpoint crossed during playback', () => {
    expect(findTriggeredCheckpoint(20, 65, checkpoints, new Set())?.id).toBe('intro');
    expect(findTriggeredCheckpoint(30, 65, checkpoints, new Set(['required']))).toBeUndefined();
    expect(findTriggeredCheckpoint(65, 40, checkpoints, new Set())).toBeUndefined();
  });

  it('blocks seeking past a required incomplete checkpoint', () => {
    expect(findBlockedSeekCheckpoint(20, 80, checkpoints)?.id).toBe('required');
    expect(findBlockedSeekCheckpoint(80, 20, checkpoints)).toBeUndefined();
    expect(findBlockedSeekCheckpoint(70, 95, checkpoints)).toBeUndefined();
  });

  it('selects the latest code snapshot at or before current playback time', () => {
    const snapshots = [
      { id: 'first', timestampSeconds: 10 },
      { id: 'second', timestampSeconds: 50 },
      { id: 'third', timestampSeconds: 100 },
    ];

    expect(selectSnapshotAtOrBefore(9, snapshots)).toBeUndefined();
    expect(selectSnapshotAtOrBefore(50, snapshots)?.id).toBe('second');
    expect(selectSnapshotAtOrBefore(75, snapshots)?.id).toBe('second');
    expect(selectSnapshotAtOrBefore(200, snapshots)?.id).toBe('third');
  });

  it('resolves active and next snapshots when seeking backward or forward', () => {
    const snapshots = [
      { id: 'first', timestampSeconds: 10 },
      { id: 'second', timestampSeconds: 50 },
      { id: 'third', timestampSeconds: 100 },
    ];

    expect(selectSnapshotAtOrBefore(90, snapshots)?.id).toBe('second');
    expect(selectSnapshotAtOrBefore(20, snapshots)?.id).toBe('first');
    expect(selectNextSnapshot(20, snapshots)?.id).toBe('second');
    expect(selectNextSnapshot(100, snapshots)).toBeUndefined();
  });

  it('compares multi-file student and instructor code by exact normalized path', () => {
    const result = compareCodeFiles(
      [
        { path: 'src/index.ts', content: 'changed' },
        { path: 'src/same.ts', content: 'same' },
        { path: 'src/student.ts', content: 'student' },
      ],
      [
        { path: 'src/index.ts', content: 'original' },
        { path: 'src/same.ts', content: 'same' },
        { path: 'src/instructor.ts', content: 'instructor' },
      ],
    );

    expect(result.summary).toEqual({
      total: 4,
      unchanged: 1,
      modified: 1,
      studentOnly: 1,
      instructorOnly: 1,
    });
    expect(result.files.map((file) => [file.path, file.status])).toEqual([
      ['src/index.ts', 'MODIFIED'],
      ['src/instructor.ts', 'INSTRUCTOR_ONLY'],
      ['src/same.ts', 'SAME'],
      ['src/student.ts', 'STUDENT_ONLY'],
    ]);
  });

  it('throttles progress saves by configured interval', () => {
    expect(shouldSaveVideoProgress(1000, 10_999, 10)).toBe(false);
    expect(shouldSaveVideoProgress(1000, 11_000, 10)).toBe(true);
  });

  it('formats time to mm:ss or hh:mm:ss accurately', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(45)).toBe('00:45');
    expect(formatTime(125)).toBe('02:05');
    expect(formatTime(3600)).toBe('01:00:00');
    expect(formatTime(3665)).toBe('01:01:05');
  });

  it('parses time strings from mm:ss, hh:mm:ss, or raw seconds', () => {
    expect(parseTimeString('')).toBe(0);
    expect(parseTimeString('45')).toBe(45);
    expect(parseTimeString('02:05')).toBe(125);
    expect(parseTimeString('2:5')).toBe(125);
    expect(parseTimeString('01:01:05')).toBe(3665);
    expect(parseTimeString('invalid')).toBe(0);
    expect(parseTimeString('-10')).toBe(0);
  });

  it('finds the previous snapshot immediately at or before target time', () => {
    const snapshots = [
      { id: 's1', timestampSeconds: 30 },
      { id: 's2', timestampSeconds: 90 },
      { id: 's3', timestampSeconds: 180 },
    ];

    expect(findPreviousSnapshot(20, snapshots)).toBeUndefined();
    expect(findPreviousSnapshot(30, snapshots)?.id).toBe('s1');
    expect(findPreviousSnapshot(100, snapshots)?.id).toBe('s2');
    expect(findPreviousSnapshot(180, snapshots)?.id).toBe('s3');
    expect(findPreviousSnapshot(300, snapshots)?.id).toBe('s3');
  });

  it('resolves playback URLs correctly for absolute, relative, and tokenized formats', () => {
    expect(resolvePlaybackUrl('')).toBe('');
    expect(resolvePlaybackUrl('https://example.com/stream.m3u8')).toBe('https://example.com/stream.m3u8');
    expect(resolvePlaybackUrl('https://example.com/stream.m3u8', 'tok123')).toBe('https://example.com/stream.m3u8?token=tok123');
    expect(resolvePlaybackUrl('/api/v1/learning/lessons/123/hls/master.m3u8')).toContain('/api/v1/learning/lessons/123/hls/master.m3u8');
  });
});
