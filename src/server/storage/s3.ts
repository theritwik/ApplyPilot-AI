import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";

/**
 * S3-compatible object-storage client (§8 of docs/PLAN.md). One driver serves
 * Cloudflare R2, AWS S3, Supabase Storage, and MinIO (local dev) — endpoint
 * and credentials come from the environment. The FileStore interface with
 * put/getStream/signedUrl/delete arrives in M2; M0 only needs connectivity
 * for the readiness check.
 */

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export function getS3(): S3Client {
  if (!globalForS3.s3) {
    const env = getEnv();
    globalForS3.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "1",
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return globalForS3.s3;
}

/** Resolves when the configured bucket is reachable; rejects otherwise. */
export async function checkObjectStorage(): Promise<void> {
  await getS3().send(new HeadBucketCommand({ Bucket: getEnv().S3_BUCKET }));
}
