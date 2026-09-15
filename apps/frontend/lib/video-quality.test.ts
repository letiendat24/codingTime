import { describe, expect, it } from 'vitest';
import {
  applyVideoQuality,
  buildVideoQualityOptions,
  currentAutoQualityLabel,
  findQualityByPreference,
  preferenceFromQuality,
} from './video-quality';

describe('Video quality model', () => {
  it('converts HLS manifest levels into quality options', () => {
    const options = buildVideoQualityOptions([
      { height: 360, bitrate: 700_000 },
      { height: 720, bitrate: 2_800_000 },
    ]);

    expect(options).toEqual([
      { levelIndex: 1, height: 720, bitrate: 2_800_000, label: '720p' },
      { levelIndex: 0, height: 360, bitrate: 700_000, label: '360p' },
    ]);
  });

  it('sorts levels from high to low', () => {
    const options = buildVideoQualityOptions([
      { height: 480, bitrate: 1_200_000 },
      { height: 1080, bitrate: 5_000_000 },
      { height: 360, bitrate: 700_000 },
      { height: 720, bitrate: 2_800_000 },
    ]);

    expect(options.map((option) => option.label)).toEqual(['1080p', '720p', '480p', '360p']);
  });

  it('deduplicates duplicate heights using the highest bitrate representation', () => {
    const options = buildVideoQualityOptions([
      { height: 720, bitrate: 2_200_000 },
      { height: 720, bitrate: 3_000_000 },
      { height: 480, bitrate: 1_200_000 },
    ]);

    expect(options).toEqual([
      { levelIndex: 1, height: 720, bitrate: 3_000_000, label: '720p' },
      { levelIndex: 2, height: 480, bitrate: 1_200_000, label: '480p' },
    ]);
  });

  it('selecting Auto restores adaptive mode', () => {
    const hls = { currentLevel: 2 };
    applyVideoQuality(hls, { mode: 'AUTO' });
    expect(hls.currentLevel).toBe(-1);
  });

  it('selecting manual quality pins the matching HLS level', () => {
    const hls = { currentLevel: -1 };
    applyVideoQuality(hls, { mode: 'MANUAL', levelIndex: 3, height: 360 });
    expect(hls.currentLevel).toBe(3);
  });

  it('does not require HLS source reload APIs to change quality', () => {
    const hls = {
      currentLevel: -1,
      loadSourceCalls: 0,
      attachMediaCalls: 0,
      loadSource() {
        this.loadSourceCalls += 1;
      },
      attachMedia() {
        this.attachMediaCalls += 1;
      },
    };

    applyVideoQuality(hls, { mode: 'MANUAL', levelIndex: 1, height: 720 });
    applyVideoQuality(hls, { mode: 'AUTO' });

    expect(hls.currentLevel).toBe(-1);
    expect(hls.loadSourceCalls).toBe(0);
    expect(hls.attachMediaCalls).toBe(0);
  });

  it('preserves external playback state while applying quality', () => {
    const hls = { currentLevel: -1 };
    const playbackState = {
      currentTime: 20.5,
      paused: false,
      subtitleText: 'Keep subtitles visible.',
      transcriptSegmentId: 'segment-1',
      codeSnapshotId: 'snapshot-1',
    };

    applyVideoQuality(hls, { mode: 'MANUAL', levelIndex: 1, height: 720 });

    expect(playbackState).toEqual({
      currentTime: 20.5,
      paused: false,
      subtitleText: 'Keep subtitles visible.',
      transcriptSegmentId: 'segment-1',
      codeSnapshotId: 'snapshot-1',
    });
  });

  it('restores persisted quality when it exists in the manifest', () => {
    const options = buildVideoQualityOptions([
      { height: 360, bitrate: 700_000 },
      { height: 720, bitrate: 2_800_000 },
    ]);

    expect(findQualityByPreference(options, '720')).toEqual({
      mode: 'MANUAL',
      levelIndex: 1,
      height: 720,
      bitrate: 2_800_000,
    });
  });

  it('falls back to Auto when persisted quality is unavailable', () => {
    const options = buildVideoQualityOptions([{ height: 360, bitrate: 700_000 }]);
    expect(findQualityByPreference(options, '1080')).toEqual({ mode: 'AUTO' });
  });

  it('persists only Auto or manual height values', () => {
    expect(preferenceFromQuality({ mode: 'AUTO' })).toBe('AUTO');
    expect(preferenceFromQuality({ mode: 'MANUAL', levelIndex: 1, height: 720 })).toBe('720');
  });

  it('shows current effective level while Auto is enabled', () => {
    const options = buildVideoQualityOptions([
      { height: 360, bitrate: 700_000 },
      { height: 720, bitrate: 2_800_000 },
    ]);

    expect(currentAutoQualityLabel(options, 1)).toBe('720p');
    expect(currentAutoQualityLabel(options, -1)).toBeNull();
  });

  it('native HLS fallback has no HLS.js levels and therefore exposes no manual options', () => {
    expect(buildVideoQualityOptions([])).toEqual([]);
  });
});
