import { Client } from 'minio';
import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { Env } from '../../config';

export type ObjectStorageClient = Pick<Client, 'bucketExists' | 'makeBucket' | 'presignedPutObject' | 'presignedGetObject' | 'statObject' | 'getObject' | 'getPartialObject'>;

export function storageBucket(env: Env): string {
  return (env.STORAGE_PROVIDER === 's3' ? env.AWS_S3_BUCKET : env.MINIO_BUCKET)!;
}

function createPublicPresignClient(env: Env): Client {
  const publicEndpoint = new URL(env.MINIO_PUBLIC_ENDPOINT);
  const defaultPort = publicEndpoint.protocol === 'https:' ? 443 : 80;
  const port = publicEndpoint.port ? Number.parseInt(publicEndpoint.port, 10) : defaultPort;

  return new Client({
    endPoint: publicEndpoint.hostname,
    port,
    useSSL: publicEndpoint.protocol === 'https:',
    accessKey: env.MINIO_ACCESS_KEY!,
    secretKey: env.MINIO_SECRET_KEY!,
    region: 'us-east-1',
  });
}

export function createObjectStorageClient(env: Env): ObjectStorageClient {
  if (env.STORAGE_PROVIDER === 's3') {
    const client = new S3Client({ region: env.AWS_REGION! });
    return {
      bucketExists: async (bucket) => { await client.send(new HeadBucketCommand({ Bucket: bucket })); return true; },
      makeBucket: async () => { throw new Error('S3 buckets must be provisioned separately'); },
      presignedPutObject: (bucket, key, expiry) => getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiry ?? 3600 }),
      presignedGetObject: (bucket, key, expiry) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiry ?? 3600 }),
      statObject: async (bucket, key) => {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: result.ContentLength ?? 0, etag: result.ETag ?? '', metaData: { 'content-type': result.ContentType ?? '' }, lastModified: result.LastModified ?? new Date() };
      },
      getObject: async (bucket, key) => {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return result.Body as Readable;
      },
      getPartialObject: async (bucket, key, offset, length) => {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${offset}-${offset + length! - 1}` }));
        return result.Body as Readable;
      },
    } as ObjectStorageClient;
  }
  const internalClient = new Client({
    endPoint: env.MINIO_ENDPOINT!,
    port: env.MINIO_PORT!,
    useSSL: false,
    accessKey: env.MINIO_ACCESS_KEY!,
    secretKey: env.MINIO_SECRET_KEY!,
  });
  const publicPresignClient = createPublicPresignClient(env);

  internalClient.presignedPutObject = publicPresignClient.presignedPutObject.bind(publicPresignClient);
  internalClient.presignedGetObject = publicPresignClient.presignedGetObject.bind(publicPresignClient);

  return internalClient;
}
