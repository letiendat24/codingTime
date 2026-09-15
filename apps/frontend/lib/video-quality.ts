export type VideoQualityPreference = 'AUTO' | `${number}`;

export type VideoQuality =
  | { readonly mode: 'AUTO' }
  | {
      readonly mode: 'MANUAL';
      readonly levelIndex: number;
      readonly height: number;
      readonly bitrate?: number;
    };

export interface HlsManifestLevel {
  readonly height?: number;
  readonly bitrate?: number;
}

export interface VideoQualityOption {
  readonly levelIndex: number;
  readonly height: number;
  readonly bitrate?: number;
  readonly label: string;
}

export interface HlsQualityController {
  currentLevel: number;
}

export const VIDEO_QUALITY_PREFERENCE_KEY = 'codesync.video.quality';

export function buildVideoQualityOptions(levels: readonly HlsManifestLevel[]): readonly VideoQualityOption[] {
  const bestByHeight = new Map<number, VideoQualityOption>();

  levels.forEach((level, levelIndex) => {
    const height = Number(level.height);
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }

    const option: VideoQualityOption = {
      levelIndex,
      height,
      label: `${height}p`,
      ...(level.bitrate === undefined ? {} : { bitrate: level.bitrate }),
    };
    const existing = bestByHeight.get(height);

    if (!existing || (option.bitrate ?? 0) > (existing.bitrate ?? 0)) {
      bestByHeight.set(height, option);
    }
  });

  return [...bestByHeight.values()].sort((a, b) => b.height - a.height);
}

export function findQualityByPreference(
  options: readonly VideoQualityOption[],
  preference: VideoQualityPreference | null,
): VideoQuality {
  if (!preference || preference === 'AUTO') {
    return { mode: 'AUTO' };
  }

  const preferredHeight = Number.parseInt(preference, 10);
  const option = options.find((item) => item.height === preferredHeight);

  if (!option) {
    return { mode: 'AUTO' };
  }

  return {
    mode: 'MANUAL',
    levelIndex: option.levelIndex,
    height: option.height,
    ...(option.bitrate === undefined ? {} : { bitrate: option.bitrate }),
  };
}

export function preferenceFromQuality(quality: VideoQuality): VideoQualityPreference {
  return quality.mode === 'AUTO' ? 'AUTO' : `${quality.height}`;
}

export function applyVideoQuality(controller: HlsQualityController, quality: VideoQuality): void {
  controller.currentLevel = quality.mode === 'AUTO' ? -1 : quality.levelIndex;
}

export function currentAutoQualityLabel(
  options: readonly VideoQualityOption[],
  currentLevelIndex: number | null,
): string | null {
  if (currentLevelIndex === null || currentLevelIndex < 0) {
    return null;
  }

  return options.find((option) => option.levelIndex === currentLevelIndex)?.label ?? null;
}
