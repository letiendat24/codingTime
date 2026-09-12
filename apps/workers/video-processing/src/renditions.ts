export interface RenditionConfig {
  readonly quality: '360P' | '480P' | '720P' | '1080P';
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
  readonly audioBitrate: string;
}

export const RENDITIONS: readonly RenditionConfig[] = [
  { quality: '360P', width: 640, height: 360, bitrate: 800_000, audioBitrate: '96k' },
  { quality: '480P', width: 854, height: 480, bitrate: 1_400_000, audioBitrate: '128k' },
  { quality: '720P', width: 1280, height: 720, bitrate: 2_800_000, audioBitrate: '128k' },
  { quality: '1080P', width: 1920, height: 1080, bitrate: 5_000_000, audioBitrate: '160k' },
];

export function selectRenditions(sourceHeight: number) {
  return RENDITIONS.filter((rendition) => rendition.height <= sourceHeight);
}
