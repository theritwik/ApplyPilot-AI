// Defaults for the integration environment. Values match docker-compose.yml;
// anything already present in process.env (CI service containers, a local
// override) wins.

export {};

const env = process.env as Record<string, string | undefined>;

function setDefault(key: string, value: string): void {
  env[key] ??= value;
}

setDefault("NODE_ENV", "test");
setDefault("E2E_TEST_MODE", "0");
setDefault("APP_URL", "http://localhost:3000");
setDefault("DATABASE_URL", "postgresql://applypilot:applypilot@localhost:5432/applypilot");
setDefault("REDIS_URL", "redis://localhost:6379");
setDefault("S3_ENDPOINT", "http://localhost:9000");
setDefault("S3_REGION", "us-east-1");
setDefault("S3_BUCKET", "applypilot-dev");
setDefault("S3_ACCESS_KEY_ID", "applypilot");
setDefault("S3_SECRET_ACCESS_KEY", "applypilot-secret");
setDefault("S3_FORCE_PATH_STYLE", "true");
setDefault("LOG_LEVEL", "silent");
