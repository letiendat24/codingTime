import type { Request, Response } from 'express';
import type { Client as MinioClient } from 'minio';
import { extname } from 'node:path';
import { HttpError } from '../../shared/http-error';

export function sanitizeHlsPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new HttpError(400, 'INVALID_PATH', 'Invalid HLS resource path');
  }

  return normalized;
}

export function getHlsContentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case '.m3u8':
      return 'application/vnd.apple.mpegurl';
    case '.ts':
      return 'video/mp2t';
    case '.m4s':
      return 'video/iso.segment';
    case '.mp4':
      return 'video/mp4';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.vtt':
      return 'text/vtt';
    default:
      return 'application/octet-stream';
  }
}

export function getHlsCacheControl(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  if (extension === '.m3u8') {
    return 'private, no-cache, no-store, must-revalidate';
  }

  // Media segments are immutable
  return 'private, max-age=86400';
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
  readonly length: number;
}

export function parseByteRange(rangeHeader: string, totalSize: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && !rawEnd) {
    return null;
  }

  let start: number;
  let end: number;

  if (rawStart && rawEnd) {
    start = Number.parseInt(rawStart, 10);
    end = Math.min(Number.parseInt(rawEnd, 10), totalSize - 1);
  } else if (rawStart) {
    start = Number.parseInt(rawStart, 10);
    end = totalSize - 1;
  } else if (rawEnd) {
    // Suffix range: bytes=-500
    const suffix = Number.parseInt(rawEnd, 10);
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    return null;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize || start < 0) {
    return null;
  }

  return {
    start,
    end,
    length: end - start + 1,
  };
}

export async function streamHlsObject(
  storage: MinioClient,
  bucket: string,
  objectKey: string,
  filePath: string,
  request: Request,
  response: Response,
): Promise<void> {
  let stat: { size: number };

  try {
    stat = await storage.statObject(bucket, objectKey);
  } catch (error: unknown) {
    const errorWithCode = error as { code?: string; message?: string };
    if (
      errorWithCode.code === 'NotFound' ||
      errorWithCode.code === 'NoSuchKey' ||
      errorWithCode.message?.includes('Not Found') ||
      errorWithCode.message?.includes('does not exist')
    ) {
      throw new HttpError(404, 'HLS_OBJECT_NOT_FOUND', 'HLS resource not found');
    }
    throw error;
  }

  const totalSize = stat.size;
  const contentType = getHlsContentType(filePath);
  const cacheControl = getHlsCacheControl(filePath);
  const rangeHeader = request.headers.range;

  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('Accept-Ranges', 'bytes');

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, totalSize);

    if (!range) {
      response.setHeader('Content-Range', `bytes */${totalSize}`);
      response.status(416).send('Requested Range Not Satisfiable');
      return;
    }

    response.status(206);
    response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${totalSize}`);
    response.setHeader('Content-Length', range.length);

    let stream: NodeJS.ReadableStream;
    if (typeof storage.getPartialObject === 'function') {
      stream = await storage.getPartialObject(bucket, objectKey, range.start, range.length);
    } else {
      stream = await storage.getObject(bucket, objectKey);
    }

    request.on('close', () => {
      if (!response.writableEnded && 'destroy' in stream && typeof (stream as { destroy?: () => void }).destroy === 'function') {
        (stream as { destroy?: () => void }).destroy?.();
      }
    });

    stream.pipe(response);
    return;
  }

  response.status(200);
  if (totalSize > 0) {
    response.setHeader('Content-Length', totalSize);
  }

  const stream = await storage.getObject(bucket, objectKey);

  request.on('close', () => {
    if (!response.writableEnded && 'destroy' in stream && typeof (stream as { destroy?: () => void }).destroy === 'function') {
      (stream as { destroy?: () => void }).destroy?.();
    }
  });

  stream.pipe(response);
}
