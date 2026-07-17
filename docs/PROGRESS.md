# ApplyPilot AI — Implementation Progress

## M0 — Foundation

**Status: complete** (2026-07-17, branch `m0-foundation-web`)

Implements docs/PLAN.md §18 M0 exactly. **No M1+ functionality was implemented**: no Google
authentication or Auth.js wiring (only the adapter *models* in the Prisma schema, per plan),
no resume upload, no document parsing, no AI integration, no BullMQ processors, no
transactional outbox, and no business models (Resume, JobDescription, Application, …).

### Implemented functionality

- Next.js 15 App Router project, TypeScript `strict` + `noUncheckedIndexedAccess`
- Tailwind CSS (v3) with the shadcn/ui foundation (components.json, `cn()` utility,
  CSS-variable theme, Button component)
- ESLint (flat config via `eslint-config-next` + prettier config) and Prettier
- Vitest 4 with separate unit and integration configs
- Zod environment validation (`src/lib/env.ts`): eager, fail-fast, names each offending
  variable; **production kill switch** — `NODE_ENV="production"` + `E2E_TEST_MODE="1"`
  refuses to start
- `src/instrumentation.ts` so the *web server* validates env at boot (not on first request)
- Pino structured logging with redaction of credentials and the document-content fields
  later milestones introduce (`rawText`, `resumeText`, `suggestedText`, `email`, `phone`, …)
- `AppError` hierarchy + standard envelope `{ error: { code, message, details? } }`,
  exercised end to end by the scaffold route `POST /api/example` (CSRF 403 → Zod 400 →
  success), plus `assertCsrfSafe()` origin validation for state-changing handlers
- Prisma foundation: schema (User + Auth.js adapter models only), **initial migration**
  `20260717004216_init`, client generated on postinstall
- PostgreSQL (Prisma), Redis (ioredis singleton), and S3-compatible storage
  (`@aws-sdk/client-s3`, works against MinIO/R2/S3/Supabase) clients
- `GET /api/live` (process-only) and `GET /api/ready` (Postgres, Redis, object storage
  checked independently with 2 s timeouts; per-check `ok`/`error` with sanitized
  `"unreachable"` reasons; 503 when any check fails)
- `docker-compose.yml` (local dev only): postgres:16-alpine, redis:7-alpine, MinIO with
  console + one-shot bucket-creation job, named volumes, healthchecks on all services
- Worker process skeleton (`worker/index.ts`): validates env at import, verifies
  Postgres/Redis at boot, holds connections, graceful SIGTERM/SIGINT shutdown
  (quit Redis, disconnect Prisma, exit 0); no queue work by design
- `.env.example` (placeholder/compose values only, no real credentials)
- GitHub Actions CI on every push and PR: gitleaks secret scan + npm ci → format:check →
  lint → typecheck → unit tests → prisma generate → build (dummy env provided for the
  eager env module)
- Unit tests (40 across 7 files: env/kill switch, errors envelope, logger redaction, CSRF,
  live route, mocked ready route, example route) and integration tests (3: `/api/ready`
  against real dependencies — all-ok 200; 503 isolating a dead Redis; 503 isolating a
  missing bucket; response-sanitization assertions)

### Architectural decisions

| Decision | Notes |
|---|---|
| Kept the existing wip stack: Next 15.5 / React 19.0 / Tailwind 3.4 / Prisma 6.2 / Zod 3.24 / ESLint 9 / Vitest 4 | Coherent, mutually compatible, currently supported versions. Finishing M0 meant filling gaps, not rewriting working code. |
| Eager env validation (`export const env = loadEnv()`) | Any importing process fails immediately on bad config. Consequence: `next build` needs a (dummy) env — CI provides one in workflow `env:`. `src/instrumentation.ts` was added so the production server fails at *startup*, not first request. |
| shadcn/ui in Tailwind-v3 form (HSL CSS variables + `tailwindcss-animate`, config-based theme) | Matches the branch's Tailwind 3 setup. Written manually in the CLI's exact output shape — the shadcn registry (ui.shadcn.com) is unreachable from this environment; future `npx shadcn add …` runs will slot in unchanged. |
| Readiness reports per-dependency `{ status, error: "unreachable" }` | Sanitized by construction: raw driver errors go only to the (redacted) server log. |
| Integration tests reset the module registry **and** the `globalThis` client caches per scenario | The prisma/redis singletons cache on `globalThis` (dev-HMR reuse), which survives `vi.resetModules()`; tests clear both to isolate scenarios and close clients so vitest exits. |
| Prisma 6 classic (`prisma-client-js`, engines) retained | Working as shipped in the wip; no reason to churn to Prisma 7 in a gap-fill pass. |

### Files created or modified in this pass

Created: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`,
`src/instrumentation.ts`, `prisma/migrations/20260717004216_init/migration.sql`,
`prisma/migrations/migration_lock.toml`, `vitest.integration.config.ts`,
`tests/integration/setup.ts`, `tests/integration/ready.test.ts`, `docs/PROGRESS.md`.

Modified: `tailwind.config.ts` (shadcn theme + animate plugin), `src/app/globals.css`
(shadcn CSS variables + base layer), `package.json` (+`test:integration` script; +deps
below), `package-lock.json`, `CLAUDE.md` (repository-state section updated with real
commands, as it prescribes).

Pre-existing from the wip commit and verified working (not rewritten): env/logger/errors/
prisma/redis/s3 libs, CSRF, live/ready/example routes, worker, docker-compose, CI,
`.env.example`, all unit tests, ESLint/Prettier/tsconfig/vitest configs.

### Packages added (this pass)

| Package | Purpose |
|---|---|
| `class-variance-authority`, `clsx`, `tailwind-merge` | shadcn/ui variant + class utilities (`cn()`) |
| `@radix-ui/react-slot` | shadcn Button `asChild` composition |
| `tailwindcss-animate` | shadcn Tailwind-v3 animation plugin |
| `lucide-react` | shadcn's configured icon library |

### Commands executed and results

| Command | Result |
|---|---|
| `npm ci` | pass (Prisma engines download OK) |
| `npm run format:check` | pass |
| `npm run lint` | pass (0 errors, 0 warnings) |
| `npm run typecheck` | pass |
| `npm run test:unit` | **40/40 pass** (7 files) |
| `npm run test:integration` | **3/3 pass** (against live Postgres/Redis/S3 endpoint) |
| `npm run build` | pass — `/`, `/_not-found` static; `/api/{live,ready,example}` dynamic |
| `docker compose config` | **valid** |
| `npx prisma migrate dev --name init` | migration created + applied |
| Runtime: `next start` + curl | `/api/live` 200 · `/api/ready` 200 → **503 isolating redis while stopped → 200 after restart** · `/api/example` 403 cross-origin / 400 invalid body / 200 valid |
| Boot without `DATABASE_URL` | exit 1 — `Invalid environment configuration - DATABASE_URL: Required` |
| Boot with `NODE_ENV=production E2E_TEST_MODE=1` | exit 1 — kill-switch message |
| Worker + SIGTERM | starting → ready → shutting down → shutdown complete, exit 0; missing env → exit 1 listing all variables |

### Docker Compose validation

`docker compose config` passes. **Container images could not be pulled in this
environment** — its network policy blocks Docker Hub/ECR/quay blob CDNs — so `docker
compose up` itself was not executed here. Dependency-backed checks (readiness, integration
tests, migration, worker) were run against equivalent native services (PostgreSQL 16,
redis-server 7, an S3-compatible test server) exercising the same client code paths.
On a normal network, the exact local flow is:

```sh
docker compose up -d          # postgres, redis, minio + applypilot-dev bucket
cp .env.example .env
npx prisma migrate dev
npm run test:integration
npm run dev                   # then: curl localhost:3000/api/ready
```

### Required environment variables (see .env.example)

`APP_URL`, `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`; optional:
`NODE_ENV`, `E2E_TEST_MODE` (never `"1"` in production — startup refuses), `LOG_LEVEL`.
Note: because env validation is eager, `npm run build` also needs these set (any
syntactically valid values do — CI supplies dummies).

### Unresolved issues / manual setup

- `docker compose up` needs one first-run verification on a machine with registry access
  (see above); the file is validated and uses canonical images.
- CI has not yet run on GitHub for this branch — it triggers on push; marking the `ci` job
  a required check is a repo-settings step.
- `npm audit`: 2 moderate advisories in `next@15.5.20`'s bundled postcss (fix would be a
  major downgrade; track upstream).
- Worker runs via tsx (`npm run worker:start`); compiled worker packaging is M7 scope.

### Milestone boundary confirmation

No M1+ functionality exists in this branch: no auth flows, uploads, parsers, AI calls,
queues, outbox, or business models. Next milestone: **M1 — Authentication**.
