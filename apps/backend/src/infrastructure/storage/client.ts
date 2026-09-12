import { Client } from 'minio';
import type { Env } from '../../config';

export function createObjectStorageClient(env: Env): Client {
  return new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: false,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
}
