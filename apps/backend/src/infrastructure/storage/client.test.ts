import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config';
import { createObjectStorageClient, storageBucket } from './client';

afterEach(() => vi.unstubAllEnvs());

describe('S3 storage configuration', () => {
  it('uses the AWS credential chain and generates a scoped presigned upload URL', async () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');
    const env = {
      STORAGE_PROVIDER: 's3',
      AWS_REGION: 'ap-southeast-2',
      AWS_S3_BUCKET: 'codingtime-video-storage-2026',
    } as Env;
    const key = 'videos/source/asset-1/upload.mp4';
    const client = createObjectStorageClient(env);
    const url = new URL(await client.presignedPutObject(storageBucket(env), key, 900));

    expect(url.hostname).toContain('codingtime-video-storage-2026');
    expect(url.pathname).toBe(`/${key}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});
