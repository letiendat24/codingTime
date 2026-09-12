import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type VideoProcessingRenditionPayload } from '@codesync/shared';
import { runProcess } from './process';
import { type RenditionConfig, selectRenditions } from './renditions';

function masterPlaylistObjectKey(videoAssetId: string) {
  return `videos/processed/${videoAssetId}/master.m3u8`;
}

function thumbnailObjectKey(videoAssetId: string) {
  return `videos/processed/${videoAssetId}/thumbnail.jpg`;
}

interface Metadata {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
}

export interface ProcessingOutput extends Metadata {
  readonly masterPlaylistPath: string;
  readonly thumbnailPath: string;
  readonly outputDirectory: string;
  readonly renditions: readonly (VideoProcessingRenditionPayload & { readonly localDirectory: string })[];
  readonly masterPlaylistObjectKey: string;
  readonly thumbnailObjectKey: string;
}

interface FfprobeStream {
  readonly width?: number;
  readonly height?: number;
  readonly codec_type?: string;
}

interface FfprobeOutput {
  readonly format?: {
    readonly duration?: string;
  };
  readonly streams?: readonly FfprobeStream[];
}

export async function inspectVideo(sourcePath: string, timeoutSeconds: number): Promise<Metadata> {
  const result = await runProcess(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', sourcePath],
    timeoutSeconds,
  );
  const parsed = JSON.parse(result.stdout) as FfprobeOutput;
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');

  if (!videoStream?.width || !videoStream.height || !parsed.format?.duration) {
    throw new Error('Unable to inspect video metadata');
  }

  return {
    durationSeconds: Math.round(Number.parseFloat(parsed.format.duration)),
    width: videoStream.width,
    height: videoStream.height,
  };
}

export function buildRenditionArgs(input: {
  readonly sourcePath: string;
  readonly outputDirectory: string;
  readonly rendition: RenditionConfig;
}) {
  return [
    '-y',
    '-i',
    input.sourcePath,
    '-vf',
    `scale=w=${input.rendition.width}:h=${input.rendition.height}:force_original_aspect_ratio=decrease,pad=${input.rendition.width}:${input.rendition.height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    String(input.rendition.bitrate),
    '-maxrate',
    String(Math.round(input.rendition.bitrate * 1.2)),
    '-bufsize',
    String(input.rendition.bitrate * 2),
    '-c:a',
    'aac',
    '-b:a',
    input.rendition.audioBitrate,
    '-hls_time',
    '6',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    join(input.outputDirectory, 'segment_%05d.ts'),
    join(input.outputDirectory, 'index.m3u8'),
  ];
}

export async function processVideo(input: {
  readonly videoAssetId: string;
  readonly sourcePath: string;
  readonly outputDirectory: string;
  readonly timeoutSeconds: number;
  readonly onProgress: (progressPercent: number) => Promise<void>;
}): Promise<ProcessingOutput> {
  const metadata = await inspectVideo(input.sourcePath, input.timeoutSeconds);
  const renditions = selectRenditions(metadata.height);
  const renditionOutputs: (VideoProcessingRenditionPayload & { readonly localDirectory: string })[] = [];

  if (renditions.length === 0) {
    throw new Error('Video source is too small for configured renditions');
  }

  for (const [index, rendition] of renditions.entries()) {
    const localDirectory = join(input.outputDirectory, rendition.quality.toLowerCase());
    await mkdir(localDirectory, { recursive: true });
    await input.onProgress(Math.max(10, Math.round((index / renditions.length) * 80)));
    await runProcess('ffmpeg', buildRenditionArgs({
      sourcePath: input.sourcePath,
      outputDirectory: localDirectory,
      rendition,
    }), input.timeoutSeconds);
    renditionOutputs.push({
      quality: rendition.quality,
      width: rendition.width,
      height: rendition.height,
      bitrate: rendition.bitrate,
      playlistObjectKey: `${masterPlaylistObjectKey(input.videoAssetId).replace('/master.m3u8', '')}/${rendition.quality.toLowerCase()}/index.m3u8`,
      localDirectory,
    });
  }

  const thumbnailPath = join(input.outputDirectory, 'thumbnail.jpg');
  await input.onProgress(90);
  await runProcess('ffmpeg', ['-y', '-i', input.sourcePath, '-ss', '00:00:01', '-vframes', '1', thumbnailPath], input.timeoutSeconds);

  const masterPlaylistPath = join(input.outputDirectory, 'master.m3u8');
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...renditionOutputs.flatMap((rendition) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bitrate},RESOLUTION=${rendition.width}x${rendition.height}`,
      `${rendition.quality.toLowerCase()}/index.m3u8`,
    ]),
  ].join('\n');

  await import('node:fs/promises').then((fs) => fs.writeFile(masterPlaylistPath, `${playlist}\n`, 'utf8'));

  return {
    ...metadata,
    masterPlaylistPath,
    thumbnailPath,
    outputDirectory: input.outputDirectory,
    renditions: renditionOutputs,
    masterPlaylistObjectKey: masterPlaylistObjectKey(input.videoAssetId),
    thumbnailObjectKey: thumbnailObjectKey(input.videoAssetId),
  };
}
