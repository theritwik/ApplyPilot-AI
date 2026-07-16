# ApplyPilot AI — Progress

Tracks delivery against [docs/PLAN.md](./PLAN.md) (Revision 2). Updated at the end of each milestone.

## Milestone status

| Milestone                                          | Status         | Notes                                   |
| -------------------------------------------------- | -------------- | --------------------------------------- |
| M0 — Foundation                                    | ✅ Implemented | This document's detail section below    |
| M1 — Authentication                                | ⬜ Not started | Auth.js + Google OAuth + Prisma adapter |
| M2 — Resume upload, storage, parsing, worker infra | ⬜ Not started | Heaviest milestone; outbox + processors |
| M3 — Versioned job-description analysis            | ⬜ Not started |                                         |
| M4 — Applications and deterministic matching       | ⬜ Not started |                                         |
| M5 — AI suggestions, verification, human approval  | ⬜ Not started |                                         |
| M6 — Simple application tracker                    | ⬜ Not started |                                         |
| M7 — Hardening, AI evaluation, deployment, docs    | ⬜ Not started | readme.md rewrite happens here          |

## M0 — Foundation (implemented)

### Delivered

- **Next.js 16 App Router** scaffold with TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind CSS v4, and a shadcn/ui foundation (`components.json`, `cn()` utility, theme tokens in `globals.css`, `Button` primitive).
- **Tooling:** ESLint (flat config, `eslint-config-next` + `eslint-config-prettier`), Prettier, Vitest (separate unit and integration configs).
- **Environment validation** (`src/lib/env.ts`): Zod schema over `process.env`, fails startup naming every missing/invalid variable; validated at web boot via `src/instrumentation.ts` and at worker boot. Includes the **production kill switch**: startup throws when `NODE_ENV=production` and `E2E_TEST_MODE=1`.
- **Structured logging** (`src/lib/logger.ts`): pino with a recursive scrubber that replaces document-text, PII, and credential fields with `[REDACTED]` on every log line.
- **Error taxonomy** (`src/lib/errors.ts`): `AppError` hierarchy (400/401/403/404/409/429/500) mapped to the standard envelope `{ error: { code, message, details? } }`, including ZodError → 400 and unknown → generic 500. `apiHandler` (`src/lib/api-handler.ts`) applies the mapping to every route.
- **CSRF skeleton** (`src/server/csrf.ts`): Origin (Referer fallback) allowlist derived from `APP_URL`, compared against the arrival `Host`; cross-origin/origin-less mutations → 403 `CSRF_REJECTED` with a `csrf.rejected` log line.
- **Prisma foundation**: schema with `User` + Auth.js adapter models (`Account`, `Session`, `VerificationToken`) and the initial migration. Business models arrive with M2+.
- **Clients**: lazy singletons for PostgreSQL (Prisma), Redis (ioredis, fail-fast options), and S3-compatible object storage (AWS SDK v3; MinIO/R2/S3/Supabase via env).
- **Health endpoints**: `GET /api/live` (process only) and `GET /api/ready` (PostgreSQL, applied migrations, Redis, object storage reported individually; 503 when any check fails; 2 s per-check timeout; sanitized errors).
- **Sample route** (`POST /api/sample`): demonstrates CSRF 403, Zod 400 with issue details, and `AppError` → envelope mapping.
- **Worker skeleton** (`worker/index.ts`): validates env, verifies PostgreSQL/Redis connectivity, idles on a heartbeat, and shuts down gracefully on SIGTERM/SIGINT (drain, close connections, bounded by a 10 s force-exit). Outbox dispatcher and BullMQ processors arrive with M2.
- **Local dev**: `docker-compose.yml` with PostgreSQL 16, Redis 7, MinIO (+ one-shot bucket creation); `.env.example` documents every variable.
- **CI** (`.github/workflows/ci.yml`, on push): gitleaks secret scan; format check, lint, typecheck, unit tests, build.

### Tests

- **Unit** (`npm run test:unit`): env validation + kill switch, error taxonomy/envelope, logger redaction, CSRF checks, readiness composition (per-dependency failure, sanitization, timeouts), `/api/live`, and the sample route pipeline (200/400/403/404).
- **Integration** (`npm run test:integration`, requires `docker compose up -d` + `npx prisma migrate deploy`): readiness against real Postgres/Redis/MinIO, and the §16 #11 kill-switch test in a fresh spawned process.

### How to run locally

```bash
cp .env.example .env
docker compose up -d
npx prisma migrate deploy
npm run dev        # web on :3000  → /api/live, /api/ready
npm run worker     # worker skeleton
npm run test:unit
npm run test:integration
```

### Deviations / notes

- `next-env.d.ts` is gitignored by the Next 16 scaffold; `npm run typecheck` runs `next typegen` first so type checking works on a fresh clone.
- The `server-only` import-boundary convention (§4) is noted but not yet enforced in code; it becomes meaningful in M1 when the first client components that could import server code appear.
- The readiness "migrations applied" check asserts no unfinished rows and at least one applied migration in `_prisma_migrations` — a schema-drift comparison is deliberately out of scope for M0.
- CI as a **required check** is a repository branch-protection setting and cannot be set from the codebase.

## Next up: M1 — Authentication

Auth.js (NextAuth v5) with Google provider + Prisma adapter, database sessions, sign-in page, authenticated `(app)` layout, `requireUser()`, and the `E2E_TEST_MODE`-gated test credentials provider (kill switch already enforced by M0).
