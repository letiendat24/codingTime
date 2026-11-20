import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './config';
import { storageBucket } from './storage';

describe('S3 worker configuration', () => {
  it('does not require MinIO settings when S3 is selected', () => {
    const env = loadWorkerEnv({
      RABBITMQ_URL: 'amqp://localhost:5672',
      STORAGE_PROVIDER: 's3',
      AWS_REGION: 'ap-southeast-2',
      AWS_S3_BUCKET: 'codingtime-video-storage-2026',
    });

    expect(storageBucket(env)).toBe('codingtime-video-storage-2026');
  });
});
