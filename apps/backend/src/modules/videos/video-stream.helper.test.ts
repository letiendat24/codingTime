import { describe, expect, it } from 'vitest';
import {
  getHlsCacheControl,
  getHlsContentType,
  parseByteRange,
  sanitizeHlsPath,
} from './video-stream.helper';

describe('video stream helper', () => {
  it('sanitizes valid HLS resource paths', () => {
    expect(sanitizeHlsPath('master.m3u8')).toBe('master.m3u8');
    expect(sanitizeHlsPath('720p/index.m3u8')).toBe('720p/index.m3u8');
    expect(sanitizeHlsPath('720p/segment_00000.ts')).toBe('720p/segment_00000.ts');
    expect(sanitizeHlsPath('/1080p/index.m3u8')).toBe('1080p/index.m3u8');
  });

  it('rejects path traversal attempts and invalid characters', () => {
    expect(() => sanitizeHlsPath('../secret')).toThrow();
    expect(() => sanitizeHlsPath('720p/../../secret')).toThrow();
    expect(() => sanitizeHlsPath('720p/..')).toThrow();
    expect(() => sanitizeHlsPath('')).toThrow();
    expect(() => sanitizeHlsPath('\0evil')).toThrow();
  });

  it('resolves correct content types for HLS artifacts', () => {
    expect(getHlsContentType('master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(getHlsContentType('index.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(getHlsContentType('segment_000.ts')).toBe('video/mp2t');
    expect(getHlsContentType('chunk.m4s')).toBe('video/iso.segment');
    expect(getHlsContentType('video.mp4')).toBe('video/mp4');
    expect(getHlsContentType('thumb.jpg')).toBe('image/jpeg');
  });

  it('assigns appropriate Cache-Control headers', () => {
    expect(getHlsCacheControl('master.m3u8')).toContain('no-cache');
    expect(getHlsCacheControl('720p/index.m3u8')).toContain('no-cache');
    expect(getHlsCacheControl('segment_000.ts')).toContain('max-age');
  });

  it('parses HTTP byte range headers accurately', () => {
    expect(parseByteRange('bytes=0-100', 1000)).toEqual({ start: 0, end: 100, length: 101 });
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999, length: 500 });
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999, length: 200 });
    expect(parseByteRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999, length: 1000 });
    expect(parseByteRange('bytes=1500-2000', 1000)).toBeNull();
    expect(parseByteRange('bytes=500-200', 1000)).toBeNull();
    expect(parseByteRange('invalid', 1000)).toBeNull();
  });
});
