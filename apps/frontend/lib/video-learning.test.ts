import { describe, expect, it } from 'vitest';
import {
  compareCodeFiles,
  findBlockedSeekCheckpoint,
  findTriggeredCheckpoint,
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
});
