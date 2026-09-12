import { describe, expect, it } from 'vitest';
import { buildRenditionArgs } from './ffmpeg';
import { selectRenditions } from './renditions';

describe('video rendition planning', () => {
  it('does not upscale beyond the source height', () => {
    expect(selectRenditions(360).map((rendition) => rendition.quality)).toEqual(['360P']);
    expect(selectRenditions(720).map((rendition) => rendition.quality)).toEqual(['360P', '480P', '720P']);
  });

  it('builds HLS output arguments for FFmpeg without shell interpolation', () => {
    const args = buildRenditionArgs({
      sourcePath: '/tmp/source.mp4',
      outputDirectory: '/tmp/output/720p',
      rendition: {
        quality: '720P',
        width: 1280,
        height: 720,
        bitrate: 2_800_000,
        audioBitrate: '128k',
      },
    });

    expect(args).toContain('-hls_playlist_type');
    expect(args).toContain('vod');
    expect(args).toContain('/tmp/output/720p/index.m3u8');
    expect(args.join(' ')).toContain('scale=w=1280:h=720');
  });
});
