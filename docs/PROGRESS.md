# ApplyPilot AI — Implementation Progress

## M0 — Foundation (implemented 2026-07-16)

Implements docs/PLAN.md §18 M0 exactly: project scaffold, validated configuration, logging,
error taxonomy, database/queue/storage connectivity, liveness/readiness endpoints, worker
skeleton, local dev services, and push CI. No M1+ features (no auth flow, no uploads, no
parsing, no queues/outbox, no AI, no business models).

### Architectural choices made in M0

| Decision | Choice | Notes |
|---|---|---|
| Framework versions | Next.js 16.2.10 (App Router, Turbopack), React 19.2, TypeScript 5.9.3, Tailwind CSS 4, ESLint 9 (flat config), Vitest 4, Zod 4, Pino 10 | TypeScript 7 and ESLint 10 exist but are brand-new majors; pinned to the majors the Next 16 toolchain is verified against. |
| Prisma | **Prisma 7.8** with the `prisma-client` generator (output `src/generated/prisma`, git-ignored, regenerated on `postinstall`) and the `@prisma/adapter-pg` driver adapter; `prisma.config.ts` + `dotenv` per Prisma 7 convention | Rust-engine-free; client is constructed lazily (`getPrisma()`) so importing never requires a DB (build safety). |
| Env validation | Zod schema in `src/lib/env.ts`; `parseEnv()` pure (unit-testable), `getEnv()` cached; failures throw `EnvValidationError` listing each offending variable | Web validates at startup via `src/instrumentation.ts` (NEXT_RUNTIME-guarded dynamic import of `instrumentation.node.ts` so the Edge bundle has no `process.exit`); worker validates in `main()`. Kill switch: `NODE_ENV==="production" && E2E_TEST_MODE==="1"` fails startup. |
| Error envelope | `AppError` hierarchy (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CSRF_REJECTED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `NOT_READY`) + pure `errorToEnvelope()`; `apiHandler()` wrapper catches, logs, and maps. Unknown errors → generic 500, never leaked. | |
| CSRF | `assertTrustedOrigin()` (`src/server/csrf.ts`): state-changing methods require an Origin (or Referer-derived origin) matching the request Host or the configured `APP_URL` origin; violations → 403 `CSRF_REJECTED`. | Sample route `POST /api/sample` is the plan-mandated conventions reference (CSRF 403 / Zod 400 / envelope); it is not a product feature and is slated for removal when the first real mutation route lands (M2). |
| Health | `GET /api/live` (zero imports, process-only) and `GET /api/ready` (Postgres via `$queryRaw`, Redis via ephemeral short-timeout connection, object storage via `HeadBucket`; per-check `ok`/`error`, sanitized 503 envelope; raw errors go only to redacted server logs). | |
| Logging | Pino with a redaction list covering secrets (connection strings, keys, tokens, cookies) **and** the document-content field names reserved by the plan (`rawText`, `profile`, `suggestedText`, `evidence`, `prompt`, `email`, `phone`, …) so log hygiene exists before those features do. pino-pretty in development only; JSON in production. | |
| Object storage | AWS SDK v3 `S3Client` configured from env (endpoint/region/bucket/keys/path-style) — one driver for R2 / S3 / Supabase Storage / MinIO. `FileStore` interface deferred to M2 per plan. | |
| Worker | `worker/index.ts` run via tsx (`node --env-file-if-exists=.env --import tsx`): validates env, logs startup, waits for SIGINT/SIGTERM, logs drain + stop, exits 0. Explicit keep-alive interval holds the event loop (signal handlers don't); M2's queue connections will replace it. No processors, no outbox — M2. | |
| Local dev services | `docker-compose.yml`: postgres:17-alpine, redis:7-alpine, minio + one-shot `minio-init` bucket creation; named volumes (`pgdata`, `redisdata`, `miniodata`); healthchecks on all three. Local development only — production uses managed services (PLAN §17). | |
| CI | `.github/workflows/ci.yml` on push: npm ci → format:check → lint → typecheck → unit tests → build, plus a gitleaks secret-scan job. | |
| shadcn/ui | Foundation written manually (`components.json`, `cn()` utility, Tailwind v4 theme tokens in `globals.css`, canonical `Button`) because the shadcn registry (`ui.shadcn.com`) is unreachable from this sandbox's network policy. Structure matches the current CLI output; future `shadcn add` runs on a normal network will slot in unchanged. | |

### Files added/changed

Config/tooling: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
`postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.gitignore`, `.env.example`, `components.json`, `vitest.config.ts`,
`vitest.integration.config.ts`, `docker-compose.yml`, `.github/workflows/ci.yml`,
`prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/20260716070127_init/`.

Source: `src/lib/{env,logger,errors,prisma,redis,utils}.ts`,
`src/server/csrf.ts`, `src/server/http/api.ts`, `src/server/health/checks.ts`,
`src/server/storage/s3.ts`, `src/instrumentation.ts`, `src/instrumentation.node.ts`,
`src/app/{layout,page}.tsx`, `src/app/globals.css`,
`src/app/api/{live,ready,sample}/route.ts`, `src/components/ui/button.tsx`,
`worker/index.ts`.

Tests: `tests/helpers/env.ts`, `tests/unit/{env,errors,live,sample-route}.test.ts`,
`tests/integration/ready.test.ts`.

Docs: this file. (`readme.md` untouched — its rewrite is scheduled for M7; `docs/PLAN.md` unchanged.)

### Commands executed (verification)

| Command | Result |
|---|---|
| `npm run format:check` | pass |
| `npm run lint` | pass (0 errors, 0 warnings) |
| `npm run typecheck` | pass (strict + noUncheckedIndexedAccess, incl. generated Prisma client) |
| `npm run test:unit` | 34/34 passed (4 files) |
| `npm run build` | pass, no warnings; `/api/live`, `/api/ready`, `/api/sample` dynamic |
| `npx prisma migrate dev --name init` | migration `20260716070127_init` created + applied |
| `npm run test:integration` (Postgres/Redis/S3 endpoint live) | 3/3 passed |
| `next start` + curl | `/api/live` 200; `/api/ready` 200 all-ok; **503 with `checks.redis="error"` while Redis stopped, 200 after restart**; sample route 403/400/200 as specified |
| Boot without `DATABASE_URL` (no `.env`) | exit 1, message names `DATABASE_URL` |
| Boot with `NODE_ENV=production E2E_TEST_MODE=1` | exit 1, kill-switch message |
| `npm run worker` + SIGTERM | startup log → drain log → stop log, exit 0; missing env → exit 1 listing variables |
| Redaction spot check | document/secret fields → `[REDACTED]`, safe fields pass |
| `docker compose config` | valid |

### Sandbox caveats (not code defects)

- **Container images could not be pulled in this sandbox** — the network policy blocks
  Docker Hub/CloudFront, ECR Public, and quay.io blob endpoints. `docker-compose.yml` is
  syntax-validated and uses canonical images; on a normal network `docker compose up -d`
  is expected to work as written but **has not been end-to-end executed here**. Dependency
  verification was instead performed against native services (PostgreSQL 16 via apt,
  redis-server 7.0, and `s3rver` as the S3-compatible endpoint), which exercise the exact
  same client code paths.
- The shadcn CLI could not reach its registry (same policy); the foundation files were
  written manually (verified by lint/typecheck/build).
- `next start` prints "✓ Ready" before `register()` completes, so the refusal message
  appears just after the banner — the process still exits before serving traffic (verified
  by probe).

### Known issues / accepted for now

- `npm audit`: 5 moderate advisories, all transitive inside the **latest stable** `prisma`
  CLI (its bundled local dev server; not in the runtime client path) and `next` (bundled
  postcss). The suggested "fixes" are major downgrades (prisma 6 / next 9). Track upstream;
  re-check each dependency bump.
- Prettier ignores `*.md` (docs keep hand-authored table formatting).
- Worker runs via tsx in M0; a compiled-worker production image is part of M7 packaging.
- CI (including gitleaks) is defined but has not run on GitHub yet — it will run on the
  next push.

### Next milestone

M1 — Authentication (Auth.js + Google provider + Prisma adapter, sign-in page, protected
shell, `requireUser()`, test-only credentials provider gated by `E2E_TEST_MODE`).
