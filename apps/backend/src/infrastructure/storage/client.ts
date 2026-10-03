import { Client } from 'minio';
import type { Env } from '../../config';

function createPublicPresignClient(env: Env): Client {
  const publicEndpoint = new URL(env.MINIO_PUBLIC_ENDPOINT);
  const defaultPort = publicEndpoint.protocol === 'https:' ? 443 : 80;
  const port = publicEndpoint.port ? Number.parseInt(publicEndpoint.port, 10) : defaultPort;

  return new Client({
    endPoint: publicEndpoint.hostname,
    port,
    useSSL: publicEndpoint.protocol === 'https:',
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    region: 'us-east-1',
  });
}

export function createObjectStorageClient(env: Env): Client {
  const internalClient = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: false,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
  const publicPresignClient = createPublicPresignClient(env);

  internalClient.presignedPutObject = publicPresignClient.presignedPutObject.bind(publicPresignClient);
  internalClient.presignedGetObject = publicPresignClient.presignedGetObject.bind(publicPresignClient);

  return internalClient;
}
