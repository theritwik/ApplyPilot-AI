import { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "../../lib/env";

/**
 * S3-compatible object-storage client (docs/PLAN.md §8).
 * One driver serves Cloudflare R2, AWS S3, Supabase Storage, and MinIO —
 * only the endpoint/credentials/path-style env vars differ.
 *
 * The FileStore interface (put/getStream/signedUrl/delete) arrives in M2;
 * M0 provides the configured client and connectivity verification only.
 */

const globalCache = globalThis as unknown as { __applypilotS3?: S3Client };

export function getS3(): S3Client {
  if (!globalCache.__applypilotS3) {
    const env = getEnv();
    globalCache.__applypilotS3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return globalCache.__applypilotS3;
}
