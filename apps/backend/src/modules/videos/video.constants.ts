export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export function extensionForContentType(contentType: string) {
  if (contentType === 'video/mp4') {
    return 'mp4';
  }

  if (contentType === 'video/quicktime') {
    return 'mov';
  }

  return 'webm';
}

export function sourceObjectKey(videoAssetId: string, objectId: string, contentType: string) {
  return `videos/source/${videoAssetId}/${objectId}.${extensionForContentType(contentType)}`;
}

export function processedPrefix(videoAssetId: string) {
  return `videos/processed/${videoAssetId}`;
}

export function masterPlaylistObjectKey(videoAssetId: string) {
  return `${processedPrefix(videoAssetId)}/master.m3u8`;
}

export function thumbnailObjectKey(videoAssetId: string) {
  return `${processedPrefix(videoAssetId)}/thumbnail.jpg`;
}
