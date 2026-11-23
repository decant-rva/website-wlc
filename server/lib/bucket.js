// The photo bucket (Tigris on fly.io, which speaks the S3 protocol).
// `fly storage create` sets these on the app:
//   BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const VARIANTS = 'variants/';
export const ORIGINALS = 'originals/';
export const TYPES = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' };

export const bucketConfigured = () => Boolean(process.env.BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

export function bucket() {
  const Bucket = process.env.BUCKET_NAME;
  const client = new S3Client({
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
  });
  return {
    /** Resolves to { body, type, length, etag } or null when the object does not exist. */
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return { body: r.Body, type: r.ContentType, length: r.ContentLength, etag: r.ETag };
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async put(key, body, type) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: type, CacheControl: 'public, max-age=31536000, immutable' }));
    },
    /** Every key under a prefix. */
    async list(prefix) {
      const keys = new Set();
      let token;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents || []) keys.add(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
}
