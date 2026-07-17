# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**M0 (Foundation) is complete** — see `docs/PROGRESS.md` for what exists and how it was
verified. `readme.md` is still the old aspirational feature list that predates the plan
(rewritten in M7); do not treat it as authoritative. `docs/PLAN.md` is the single source
of truth.

**Read `docs/PLAN.md` before writing any code.** It is long (~1380 lines) — grep for the relevant section header rather than re-reading it in full each time. Key sections: §5 Prisma data model, §6 API routes, §9 resume parsing pipeline, §10 match-score algorithm, §11 AI schemas/verification, §14 outbox/queue semantics, §16 testing strategy, §18 milestones.

**Work milestone by milestone, in order (M0 → M7, §18 of the plan).** Do not jump ahead to a later milestone's scope (e.g. don't add suggestion generation before matching from M4 exists). Each milestone lists its scope and acceptance criteria explicitly — implement exactly that, then stop. Next up: **M1 — Authentication**.

## Commands

```sh
docker compose up -d          # local postgres, redis, minio (+ bucket) — dev only
cp .env.example .env          # compose-matching defaults
npx prisma migrate dev        # apply migrations (creates client via postinstall too)

npm run dev                   # web app on :3000
npm run worker:start          # worker process (tsx); worker:dev = watch mode
npm run lint                  # eslint .
npm run typecheck             # tsc --noEmit
npm run format:check          # prettier (format to write)
npm run test:unit             # vitest, tests/unit (no external deps needed)
npm run test:integration     # vitest, tests/integration — requires compose services
npm run build                 # next build — requires env vars set (eager validation)

# single test file / name:
npx vitest run tests/unit/env.test.ts
npx vitest run tests/unit -t "kill switch"
```

Notes: env validation is eager (`src/lib/env.ts` throws at import), so `build`/`start`
need a valid-looking env — CI supplies dummies in `.github/workflows/ci.yml`. Readiness
is `GET /api/ready` (per-dependency statuses); liveness is `GET /api/live`.

## Product shape (from the plan)

ApplyPilot AI is **not** an auto-apply bot. The MVP produces reviewed, human-approved artifacts (match scores, resume rewrite suggestions); the user applies manually. There is deliberately no code path that takes external action (no scraping, no form-filling, no outbound emails) — see plan §2 "Non-goals" and §19 risk "Scope creep toward auto-apply/scraping."

The primary end-to-end journey (plan §1) is the contract for the whole MVP and the PR-gate E2E test:

```
Sign in → upload resume → async parsing (structured profile, stable node ids)
  → paste job description → async structured analysis (versioned)
  → create application revision (resume version × job-analysis version)
  → deterministic match breakdown with evidence
  → generate verified suggestions → approve/reject
  → apply approved suggestions → new immutable ResumeVersion + ApplicationRevision
  → update application tracking status
```

## Architecture (target — to be built per the plan)

- **Single Next.js (App Router) codebase, two entry points**: the web server (route handlers under `src/app/api`) and a separate worker process (`worker/index.ts`) that runs the outbox dispatcher and BullMQ processors. They share one package and `src/server/**`, but **never share a filesystem** — all files go through S3-compatible object storage, never local disk.
- **Everything is versioned and immutable, never overwritten in place**: `ResumeVersion` chains, `JobAnalysisVersion` chains, paired via an `ApplicationRevision` that also pins a `MatchResult`. Applying approved suggestions creates a *new* `ResumeVersion` + `ApplicationRevision`, never mutates the old ones. This is the core modeling decision — read plan §5 before touching any of these models.
- **Resume profile nodes carry stable, immutable `nodeId` + `contentHash`** (assigned server-side, never by the AI). Suggestions target a `nodeId` and record `expectedOriginalHash`; applying re-checks the hash and 409s on mismatch. Positional paths (`experience[1].bullets[2]`) were explicitly rejected as fragile (plan §9, §21).
- **Transactional outbox for all background work**: a web request writes exactly one PostgreSQL transaction (entity + `JobRun` + `OutboxEvent`); a dispatcher polls unpublished events (`FOR UPDATE SKIP LOCKED`) and publishes to BullMQ with `jobId = OutboxEvent.id` for dedup. Queue payloads are **only** `{ jobRunId }` — the processor loads everything else from Postgres and derives ownership from DB relationships. Never trust a `userId` from a queue payload or request body. See plan §14 for full failure-mode semantics (duplicate delivery, crash before/after persistence, stalled jobs, retry exhaustion) — these are covered by required integration tests (§16).
- **Match scoring is a pure, versioned function** (`MATCH_ALGORITHM_VERSION`), no I/O, no LLM — reproducible for frozen `ResumeVersion` + `JobAnalysisVersion` inputs. Every `MatchResult` stores the content hashes it was computed from. See plan §10 for weights/components.
- **AI is used only for structured extraction and controlled rewriting, never for scoring or free-form generation.** All calls go through `messages.parse()` with Zod schemas (`src/contracts/ai`), only from the worker, never the web process. Suggestions are restricted to four controlled transformations (rewrite bullet, rewrite summary, reorder, emphasize skill) — never adding new facts. A deterministic verifier (`src/server/ai/verify.ts`) checks evidence presence, numeric/entity/technology grounding, and claim-strength before anything is persisted; failures are dropped and audit-logged. This reduces but does not guarantee elimination of false claims — human approval is the final gate (plan §11, §13).
- **PII is redacted before any text reaches the AI provider** (phone/email/postal address/personal links → placeholders), and resume/JD text/prompts must never appear in logs, Sentry, or audit metadata (plan §15 — there's a log-hygiene test for this).
- **Authorization is service-layer, not route-layer**: every service function takes `userId` as its first parameter; queries are always scoped `where: { id, userId }` (or via owning-parent joins) so a missing row and someone else's row are indistinguishable — both return 404, never 403 (no existence leaks). Workers derive ownership from DB relationships loaded via the `JobRun`, never from the queue payload.
- **CSRF**: Auth.js only protects its own endpoints. Every custom state-changing route handler additionally validates `Origin`/`Host` against an allowlist (`src/server/csrf.ts`) — this is required, not optional, on any new mutation endpoint.

Full directory layout is in plan §4 — don't recreate it speculatively; create directories as the milestone that needs them is implemented.

## Testing strategy (once tooling exists)

- Unit (Vitest): pure logic — match scoring, skill normalization, verifier checks, node hashing, redaction, schemas.
- Property-based (Vitest + fast-check): match-engine invariants (score bounds, determinism, permutation invariance, monotonicity, renormalization).
- Integration (Vitest + real Postgres/Redis/MinIO): outbox/processor semantics, authorization, storage — plan §16 lists twelve required scenarios (duplicate delivery, crash before/after persistence, stalled redelivery, outbox retry, concurrent decisions/applies, stale hashes, CSRF rejection, unauthorized storage access, prod E2E-auth kill switch, account-deletion completeness). Implement these as their owning milestone lands.
- E2E (Playwright): primary journey is the PR-gate test; auth via a test-only credentials provider gated by `E2E_TEST_MODE=1`, which must be provably impossible in production (`NODE_ENV === "production" && E2E_TEST_MODE === "1"` fails startup).
- All CI tests use a `FakeAiClient`; the live Anthropic API is only called in the nightly eval job, never on the PR path.
