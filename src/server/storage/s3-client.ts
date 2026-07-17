import { S3Client } from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

/**
 * Foundation-only S3-compatible client (works against MinIO, R2, S3, or
 * Supabase Storage via env config). Used by the readiness check in M0. The
 * full FileStore interface (put/getStream/getSignedUrl/delete) is built in
 * M2 alongside resume upload (docs/PLAN.md §8).
 */
export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const s3Bucket = env.S3_BUCKET;
