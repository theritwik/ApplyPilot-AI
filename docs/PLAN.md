# ApplyPilot AI — Implementation Plan

**Product:** ApplyPilot AI
**Repository:** `ApplyPilot-AI`
**Status:** Approved plan, Revision 2 (post senior-engineering review), pre-implementation
**Owner:** Ritwik Singh
**Last updated:** 2026-07-16

> Despite the name, ApplyPilot AI does **not** auto-apply to anything. The MVP produces reviewed, human-approved artifacts; the user applies manually. The existing `readme.md` describes a broader aspirational feature set (job scraping, one-click apply); it will be rewritten to match this plan in M7.

---

## Table of Contents

1. [Refined Product Requirements](#1-refined-product-requirements)
2. [MVP Scope, Post-MVP Backlog and Non-Goals](#2-mvp-scope-post-mvp-backlog-and-non-goals)
3. [System Architecture](#3-system-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Prisma Data Model](#5-prisma-data-model)
6. [API Routes](#6-api-routes)
7. [Authentication, Authorization and CSRF](#7-authentication-authorization-and-csrf)
8. [File Storage](#8-file-storage)
9. [Resume Parsing Pipeline](#9-resume-parsing-pipeline)
10. [Match-Score Algorithm](#10-match-score-algorithm)
11. [AI Integration, Output Schemas and Verification](#11-ai-integration-output-schemas-and-verification)
12. [AI Evaluation](#12-ai-evaluation)
13. [Human-Approval Workflow](#13-human-approval-workflow)
14. [Background Jobs: Transactional Outbox and Processing Semantics](#14-background-jobs-transactional-outbox-and-processing-semantics)
15. [Security and Privacy](#15-security-and-privacy)
16. [Testing Strategy](#16-testing-strategy)
17. [Deployment Architecture](#17-deployment-architecture)
18. [Milestones and Acceptance Criteria](#18-milestones-and-acceptance-criteria)
19. [Risks and Mitigations](#19-risks-and-mitigations)
20. [Revision 2 Change Log](#20-revision-2-change-log)
21. [Unresolved Architectural Decisions](#21-unresolved-architectural-decisions)

---

## 1. Refined Product Requirements

### Problem statement

Job seekers manually tailor their resume for every application, guess at how well they match a posting, and track applications in spreadsheets. ApplyPilot AI turns this into a structured, auditable workflow: upload a master resume once, paste a job description, and the system produces an evidence-based match score and truthful, verified tailoring suggestions — with the human approving every change before anything is stored or used.

### Primary end-to-end journey (the MVP contract)

This single journey defines the MVP. It is the PR-gate E2E test (§16) and the bar for M7 completion:

```
Sign in
  → upload resume
  → asynchronous parsing (structured profile with stable node ids)
  → paste job description
  → asynchronous structured analysis (versioned)
  → create application revision (resume version × job-analysis version)
  → deterministic match breakdown with evidence
  → generate verified suggestions
  → approve/reject suggestions
  → apply approved suggestions into a new immutable ResumeVersion
    and a new ApplicationRevision (match recomputed)
  → update application tracking status
```

### Functional requirements (MVP)

| # | Requirement | Notes |
|---|---|---|
| F1 | Google sign-in | Auth.js, Google OAuth only |
| F2 | Resume upload (PDF, DOCX ≤ 10 MB) to private object storage, parsed asynchronously into a structured profile with stable node ids | Text extraction is deterministic; structuring uses AI with validated output; PII redacted before any AI call |
| F3 | Job-description paste and **versioned** structured analysis | Each analysis run produces an immutable `JobAnalysisVersion` |
| F4 | Deterministic resume↔job match score (0–100) with a per-requirement evidence breakdown | Pure function; reproducible for frozen `ResumeVersion` + `JobAnalysisVersion` inputs |
| F5 | AI-assisted resume suggestions restricted to controlled transformations of existing content, verified deterministically | Every suggestion targets a stable node id and cites source evidence; unverifiable output is discarded server-side |
| F6 | Human approval for every modification | Approve/reject per suggestion; applying approved suggestions creates a new immutable `ResumeVersion` and `ApplicationRevision` |
| F7 | Simple application tracker | Grouped status columns **or** a table with a status dropdown; no drag-and-drop in MVP |
| F8 | Background job processing with user-visible status, transactional-outbox reliability, and an append-only audit trail | BullMQ + Redis behind a PostgreSQL outbox |
| F9 | Explicit user consent before any resume/JD content is sent to the AI provider | Consent timestamp + policy/disclosure versions stored |
| F10 | Account deletion as a backend/privacy capability (database rows **and** stored objects) | Minimal interface is acceptable; completeness is not optional |

### Non-functional requirements

- **Truthfulness:** the system must never fabricate resume content. AI outputs are structurally validated (Zod) *and* deterministically verified (numbers, entities, and claim strength checked against source text). The plan is explicit that this **reduces** false claims but cannot mathematically guarantee semantic entailment — human approval is the final gate (§11).
- **Human agency:** no external action, no resume modification without explicit approval.
- **Auditability:** every AI generation, approval decision, and status change is recorded in an application-level append-only audit log (ids/hashes/metadata only — never document text).
- **Determinism where it matters:** match scoring is a versioned pure function; **"deterministic" means the score is reproducible for frozen `ResumeVersion` and `JobAnalysisVersion` inputs.** Every `MatchResult` records the input version ids and content hashes.
- **Reliability:** all queue publications go through a transactional outbox; all processors are idempotent under at-least-once delivery.
- **Privacy:** PII (phone, email, postal address, unrelated personal links) is redacted before content leaves the system; resume/JD text never appears in logs, error trackers, or audit metadata.
- **Isolation:** all data strictly per-user; every query scoped server-side by the authenticated user id; workers derive ownership from database relationships, never from queue payloads.
- **Accessibility:** WCAG 2.1 AA targets — labeled forms, visible focus, sufficient contrast, fully keyboard-operable tracker (a dropdown, natively accessible — one reason drag-and-drop is deferred).
- **Type safety end to end:** TypeScript `strict`, Zod validation at every boundary (HTTP, queue payloads, AI outputs, env vars).

---

## 2. MVP Scope, Post-MVP Backlog and Non-Goals

### In scope (MVP)

Requirements F1–F10, delivered through milestones M0–M7 (§18), a Docker-based local dev environment (Postgres, Redis, MinIO — local development only; production uses managed services), CI, the test suite in §16, and a managed-services production deployment.

### Post-MVP backlog (explicitly deferred, not abandoned)

| Deferred feature | Notes |
|---|---|
| Cover-letter generation | Whole vertical (model, prompts, verification, UI) deferred |
| Analytics dashboard and charts | MVP home page is the tracker itself |
| Funnel analytics | With the dashboard |
| Drag-and-drop Kanban (pointer **and** keyboard drag-and-drop) | MVP tracker uses status dropdown/table; integer `position` column arrives with this feature |
| Audit-log viewer UI | Audit rows are written from M2 on; the viewer ships later |
| Account data-export UI | Deletion stays in MVP (backend capability); export UI/endpoint deferred |
| Multiple download formats | MVP has no tailored-resume export formats beyond on-screen content |
| READY-status cover-letter gating | Removed along with the `READY` status itself |
| Self-hosted Caddy, PostgreSQL, Redis and backup infrastructure | Production uses managed services (§17); self-hosting is a documented alternative, not an MVP deliverable |

### Non-goals (not planned)

| Non-goal | Rationale |
|---|---|
| **Job-site scraping or job discovery** | Legal/ToS risk, brittle. Users paste job descriptions. |
| **Autonomous or mass application submission ("auto-apply")** | No browser automation, no form auto-fill against third-party sites. |
| **Sending emails or any outbound action on the user's behalf** | The product produces artifacts; the user applies manually. |
| ATS-score simulation against real ATS vendors | The match score is our own transparent heuristic, never presented as a vendor's ATS score. |
| Adding new experience, skills, achievements, metrics, employers, projects, education or certifications via AI | Suggestions are controlled transformations of existing content only (§11). |
| Multiple OAuth providers / email-password auth | Google only. |
| Resume PDF re-rendering / templating engine | Post-MVP at the earliest. |
| Teams/multi-tenant orgs, billing, mobile app, browser extension | Single-user accounts, responsive web only. |

---

## 3. System Architecture

### Overview

A Next.js (App Router) application serves the UI and a Zod-typed HTTP API. A separate Node worker process runs the outbox dispatcher and the BullMQ processors for all slow work (parsing, AI calls). Both share one TypeScript codebase — Prisma client, services, contracts. PostgreSQL is the system of record **and** the reliability backbone (transactional outbox); Redis backs BullMQ and rate limiting; an S3-compatible object store holds uploaded files. Web and worker are deployed independently and **share no filesystem**.

```
                ┌──────────────────────────────────────────────────────┐
                │                       Browser                        │
                │   React (RSC + client components), Tailwind,         │
                │   shadcn/ui, typed fetch client                      │
                └───────────────┬──────────────────────────────────────┘
                                │ HTTPS (session cookie; Origin-checked mutations)
                ┌───────────────▼──────────────────────────────────────┐
                │                 Web deployment (Next.js)             │
                │  • App Router pages (server components)              │
                │  • Route handlers /api/* (Zod contracts, CSRF check) │
                │  • Auth.js (Google OAuth, Prisma adapter)            │
                │  • Services layer (authorization + business logic)   │
                │  • Writes entity + JobRun + OutboxEvent in ONE tx    │
                └───────┬──────────────────────┬───────────────────────┘
                        │ Prisma               │ rate limiting
                        ▼                      ▼
              ┌──────────────────┐      ┌──────────┐
              │ Managed          │      │ Managed  │
              │ PostgreSQL       │      │ Redis    │◄────────────┐
              │ (system of       │      │ (BullMQ) │             │
              │  record + outbox)│      └────▲─────┘             │
              └───────▲──────────┘           │ publish           │ consume
                      │                      │                   │
                      │  poll unpublished    │            ┌──────┴───────────────┐
                      │  OutboxEvents ┌──────┴─────┐      │  Worker deployment   │
                      └───────────────┤ Dispatcher │      │  BullMQ processors:  │
                      │               └────────────┘      │  • resume-parse      │
                      │  (dispatcher runs inside          │  • job-analyze       │
                      │   the worker process)             │  • suggestions       │
                      │                                   │  • file-cleanup      │
                      └───── load JobRun + entities ──────┤  Anthropic API calls │
                             derive ownership from DB     │  pdf/docx extraction │
                                                          └──────┬───────────────┘
                                                                 │ S3 API
                                     ┌───────────────────────────▼──┐
                                     │  S3-compatible object store  │
                                     │  (Cloudflare R2 / AWS S3 /   │
                                     │   Supabase Storage; private  │
                                     │   bucket, generated keys)    │
                                     └──────────────────────────────┘
```

### Key architectural decisions

| Decision | Choice | Rationale / rejected alternatives |
|---|---|---|
| API style | **Route handlers + shared Zod contracts** in `src/contracts` | Explicit REST surface, readable and testable with plain HTTP. tRPC rejected (hides the wire format). |
| Queue reliability | **Transactional outbox** — entity + `JobRun` + `OutboxEvent` in one PostgreSQL transaction; dispatcher publishes to BullMQ; idempotent processors | Removes the dual-write race between DB and Redis entirely. "Best effort enqueue + sweep" (Revision 1) rejected: it loses work in the crash window. |
| Queue payloads | **`{ jobRunId }` only** | The worker loads everything else from PostgreSQL and derives ownership from DB relationships. A payload-supplied `userId` would be an unauthenticated trust input. |
| Data mutation model | **Immutable versions + explicit decisions** on both sides: `ResumeVersion` chains and `JobAnalysisVersion` chains, paired via `ApplicationRevision` | Approval and reproducibility are structural. Overwriting a single `JobAnalysis` row (Revision 1) rejected: it silently invalidated existing match results. |
| Match scoring | **Deterministic pure function, versioned** — reproducible for frozen `ResumeVersion` + `JobAnalysisVersion` inputs; input ids + content hashes stored on each `MatchResult` | Reproducible, unit- and property-testable, explainable. |
| Resume edit targets | **Stable immutable node ids + content hashes** on every editable profile node; suggestions carry `targetNodeId` + `expectedOriginalHash` | Positional paths (`experience[1].bullets[2]`) rejected: they break on any reorder/re-parse. Hash mismatch at apply time is a 409 conflict. |
| AI provider | **Anthropic API (`@anthropic-ai/sdk`), task-specific models and token limits** (§11), structured outputs (`messages.parse()` + `zodOutputFormat`) | Schema-guaranteed JSON; per-task model choice keeps extraction cheap and reserves the stronger model for rewriting. A thin `AiClient` interface isolates the SDK. |
| File storage | **S3-compatible object storage from the first upload milestone** (R2 / S3 / Supabase Storage; MinIO in local dev) | Web and worker share no local filesystem. Private bucket, generated keys, authorized access only, cleanup jobs on deletion. Local-disk driver (Revision 1) rejected. |
| Sessions | **Database sessions (Auth.js Prisma adapter)** | Server-side revocation; no JWT key management. |
| CSRF | **Origin/Host allowlist validation on all custom state-changing route handlers**, in addition to `SameSite=Lax` cookies | Auth.js protects only its own endpoints; custom mutations need their own check. |
| Health | **`/api/live` (process) + `/api/ready` (Postgres, Redis, object storage, migrations)** | Single `/api/health` (Revision 1) conflated liveness and readiness. |
| Web/worker code sharing | **Single package, two entry points** | Monorepo tooling is unneeded overhead; the worker imports the same `src/server/**` modules. |

---

## 4. Directory Structure

```
applypilot-ai/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # push: lint, typecheck, unit, build
│       ├── pr.yml                  # PRs: integration + critical E2E journey
│       └── nightly.yml             # nightly/release: full E2E, perf, live AI eval
├── docker/
│   ├── Dockerfile.web
│   └── Dockerfile.worker
├── docker-compose.yml              # LOCAL DEV ONLY: postgres, redis, minio
├── docs/
│   ├── PLAN.md                     # this document
│   └── runbook.md                  # env vars, deploy, operations (M7)
├── evals/                          # offline AI evaluation suite (§12)
│   ├── fixtures/                   # anonymized resume/JD pairs + expected outputs
│   ├── metrics.ts                  # precision/recall, claim-rate, latency, cost
│   └── run.ts                      # `npm run eval` — gates prompt/model changes
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                     # demo data for local dev
├── public/
├── src/
│   ├── app/
│   │   ├── (marketing)/page.tsx    # landing / sign-in
│   │   ├── (app)/                  # authenticated shell (layout enforces session)
│   │   │   ├── applications/       # tracker (grouped columns / table) + [id] detail
│   │   │   ├── resumes/            # upload, list, [id] versions + profile view
│   │   │   ├── jobs/               # paste JD, [id] analysis versions
│   │   │   └── settings/page.tsx   # consent status, account deletion
│   │   └── api/                    # route handlers (see §6), incl. live/ready
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── resumes/  jobs/  applications/
│   │   └── shared/                 # JobRunStatus poller, ConsentGate, EmptyState
│   ├── contracts/                  # Zod schemas shared by client, server, worker
│   │   ├── api/                    # request/response schemas per endpoint
│   │   ├── ai/                     # JobAnalysis, ResumeProfile, Suggestions
│   │   └── queue/                  # { jobRunId } payload schema
│   ├── lib/
│   │   ├── env.ts                  # Zod-validated process.env (fail fast at boot,
│   │   │                           #   incl. production E2E-auth kill switch)
│   │   ├── logger.ts               # pino; serializers strip document text fields
│   │   ├── errors.ts               # AppError taxonomy → HTTP mapping
│   │   ├── prisma.ts  redis.ts
│   │   └── api-client.ts           # typed fetch wrapper inferring from contracts
│   └── server/                     # server-only code (web + worker)
│       ├── auth/                   # auth.ts (Auth.js config), require-user.ts
│       ├── csrf.ts                 # Origin/Host allowlist check for mutations
│       ├── services/               # one service per aggregate; all take userId
│       │   ├── resume-service.ts
│       │   ├── job-service.ts
│       │   ├── application-service.ts   # revisions, status transitions
│       │   ├── match-service.ts
│       │   ├── suggestion-service.ts    # decisions, apply-approved
│       │   ├── consent-service.ts
│       │   ├── account-service.ts       # deletion (rows + objects)
│       │   └── audit-service.ts
│       ├── ai/
│       │   ├── client.ts           # AiClient over @anthropic-ai/sdk; per-task
│       │   │                       #   model + max_tokens config; FakeAiClient
│       │   ├── prompts/            # versioned prompt modules (PROMPT_VERSION)
│       │   ├── redact.ts           # deterministic PII redaction pre-send
│       │   ├── extract-job.ts      # JD → JobAnalysis
│       │   ├── extract-resume.ts   # raw text → ResumeProfile (content only)
│       │   ├── suggest.ts          # controlled transformations only
│       │   └── verify.ts           # deterministic verifier (§11): excerpts,
│       │                           #   numerics, entities, claim strength
│       ├── profile/
│       │   ├── nodes.ts            # node-id assignment, content hashing,
│       │   │                       #   id carry-forward across versions
│       │   └── apply-suggestions.ts # hash-checked application of approved ops
│       ├── parsing/
│       │   ├── pdf.ts              # extraction + encrypted-PDF rejection
│       │   ├── docx.ts             # extraction + zip-bomb limits
│       │   ├── limits.ts           # timeouts, decompressed-size, entry counts
│       │   └── normalize.ts
│       ├── matching/
│       │   ├── score.ts            # pure scoring function (versioned)
│       │   ├── normalize-skill.ts
│       │   └── skill-aliases.ts
│       ├── storage/
│       │   ├── file-store.ts       # interface: put/getStream/signedUrl/delete
│       │   └── s3-file-store.ts    # AWS SDK v3 S3 client (R2/S3/Supabase/MinIO)
│       ├── outbox/
│       │   ├── write.ts            # createJobRunWithOutbox(tx, ...) helper
│       │   └── dispatcher.ts       # poll unpublished → publish → mark published
│       └── queue/
│           └── queues.ts           # queue definitions + names
├── worker/
│   ├── index.ts                    # boots dispatcher + processors, graceful stop
│   └── processors/
│       ├── resume-parse.ts
│       ├── job-analyze.ts
│       ├── suggestions.ts
│       └── file-cleanup.ts
├── tests/
│   ├── unit/                       # vitest (colocated *.test.ts also allowed)
│   ├── integration/                # vitest + real Postgres/Redis/MinIO
│   ├── e2e/                        # Playwright
│   └── fixtures/                   # sample resumes (pdf/docx), JDs, AI outputs
├── .env.example
├── next.config.ts  tailwind.config.ts  tsconfig.json
├── vitest.config.ts  playwright.config.ts
```

Conventions (unchanged from Revision 1):

- `src/server/**` is never imported from client components (`server-only` package).
- Route handlers are thin: CSRF check → parse input with a contract schema → call a service → map result/error. Business logic and authorization live in services.
- Everything crossing a boundary (HTTP body, queue payload, AI response, `process.env`) passes through a Zod schema before use.

---

## 5. Prisma Data Model

```prisma
// ───────── Auth.js (standard adapter models: Account, Session, VerificationToken omitted for brevity)

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())

  accounts     Account[]
  sessions     Session[]
  resumes      Resume[]
  jobs         JobDescription[]
  applications Application[]
  jobRuns      JobRun[]
  auditLogs    AuditLog[]
  storedFiles  StoredFile[]
  consents     UserConsent[]
}

// ───────── Consent (required before any AI processing)

model UserConsent {
  id                   String      @id @default(cuid())
  userId               String
  kind                 ConsentKind
  privacyPolicyVersion String
  aiDisclosureVersion  String
  createdAt            DateTime    @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, kind, createdAt])
}

enum ConsentKind { AI_PROCESSING }

// ───────── Resumes (immutable version chain)

model Resume {
  id        String   @id @default(cuid())
  userId    String
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions ResumeVersion[]

  @@index([userId])
}

model ResumeVersion {
  id          String              @id @default(cuid())
  resumeId    String
  version     Int                 // 1..n per resume
  source      ResumeVersionSource // UPLOAD | SUGGESTIONS_APPLIED
  fileId      String?             // original upload only
  rawText     String              // extracted plain text (source of truth for evidence)
  profile     Json?               // validated ResumeProfile with node ids + hashes
  profileHash String?             // sha256 of canonicalized profile JSON
  parseStatus ParseStatus         @default(PENDING)
  createdAt   DateTime            @default(now())

  resume               Resume                @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  file                 StoredFile?           @relation(fields: [fileId], references: [id])
  revisions            ApplicationRevision[]
  suggestionsAppliedIn Suggestion[]          @relation("SuggestionAppliedVersion")

  @@unique([resumeId, version])
}

enum ResumeVersionSource { UPLOAD SUGGESTIONS_APPLIED }
enum ParseStatus { PENDING PROCESSING COMPLETE FAILED }

model StoredFile {
  id         String    @id @default(cuid())
  userId     String
  storageKey String    @unique   // generated, never user-controlled
  fileName   String
  mimeType   String
  sizeBytes  Int
  sha256     String
  createdAt  DateTime  @default(now())
  deletedAt  DateTime?           // soft-marked; file-cleanup job removes the object,
                                 // then hard-deletes this row

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  resumeVersions ResumeVersion[]

  @@index([userId])
  @@index([deletedAt])
}

// ───────── Jobs (immutable analysis version chain)

model JobDescription {
  id        String   @id @default(cuid())
  userId    String
  title     String
  company   String?
  sourceUrl String?             // reference link only; never fetched by us
  rawText   String
  inputHash String              // sha256 of normalized rawText
  createdAt DateTime @default(now())

  user             User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  analysisVersions JobAnalysisVersion[]
  applications     Application[]

  @@index([userId])
}

model JobAnalysisVersion {
  id               String   @id @default(cuid())
  jobDescriptionId String
  version          Int      // 1..n per job description
  requirements     Json     // validated JobAnalysis schema (immutable)
  requirementsHash String   // sha256 of canonicalized requirements JSON
  inputHash        String   // sha256 of the normalized JD text this run consumed
  model            String
  promptVersion    String
  createdAt        DateTime @default(now())

  jobDescription JobDescription        @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade)
  revisions      ApplicationRevision[]

  @@unique([jobDescriptionId, version])
}

// A JobAnalysisVersion row is created only when an analysis run COMPLETES;
// in-flight/failed state lives on the JobRun. Rows are never overwritten —
// re-analysis appends version n+1. When (inputHash, model, promptVersion)
// match an existing version, the run reuses it instead of calling the AI.

// ───────── Applications: stable shell + immutable revisions

model Application {
  id                String            @id @default(cuid())
  userId            String
  jobDescriptionId  String
  status            ApplicationStatus @default(SAVED)
  notes             String?
  appliedAt         DateTime?
  currentRevisionId String?           @unique
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  user            User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobDescription  JobDescription           @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade)
  currentRevision ApplicationRevision?     @relation("ApplicationCurrentRevision", fields: [currentRevisionId], references: [id])
  revisions       ApplicationRevision[]    @relation("ApplicationRevisions")
  statusEvents    ApplicationStatusEvent[]

  @@unique([userId, jobDescriptionId])
  @@index([userId, status])
}

// Tracker ordering (MVP): rows are sorted by updatedAt desc within each status
// group. No ordering column. An integer `position` column arrives with the
// post-MVP drag-and-drop feature. (Float fractional ordering removed.)

enum ApplicationStatus { SAVED PREPARING APPLIED INTERVIEWING OFFER REJECTED WITHDRAWN }
// READY removed with the cover-letter gating feature (post-MVP).

model ApplicationRevision {
  id                   String         @id @default(cuid())
  applicationId        String
  resumeVersionId      String
  jobAnalysisVersionId String
  source               RevisionSource // why this revision exists
  createdAt            DateTime       @default(now())

  application        Application        @relation("ApplicationRevisions", fields: [applicationId], references: [id], onDelete: Cascade)
  currentOf          Application?       @relation("ApplicationCurrentRevision")
  resumeVersion      ResumeVersion      @relation(fields: [resumeVersionId], references: [id])
  jobAnalysisVersion JobAnalysisVersion @relation(fields: [jobAnalysisVersionId], references: [id])
  matchResults       MatchResult[]
  suggestions        Suggestion[]

  @@index([applicationId, createdAt])
}

enum RevisionSource { INITIAL SUGGESTIONS_APPLIED REPIN }

// Creation order note: Application and its INITIAL revision are created in one
// transaction (insert Application → insert ApplicationRevision → set
// Application.currentRevisionId), since the current-revision FK is circular.

// ───────── Matching (deterministic, versioned, revision-scoped)

model MatchResult {
  id                    String   @id @default(cuid())
  applicationRevisionId String
  algorithmVersion      Int
  score                 Int      // 0–100
  breakdown             Json     // per-component sub-scores + per-requirement evidence
  profileHash           String   // content hash of the ResumeVersion.profile consumed
  requirementsHash      String   // content hash of the JobAnalysisVersion.requirements consumed
  createdAt             DateTime @default(now())

  applicationRevision ApplicationRevision @relation(fields: [applicationRevisionId], references: [id], onDelete: Cascade)

  @@unique([applicationRevisionId, algorithmVersion])
}
// The uniqueness rule is per-revision, so the same algorithmVersion can be
// recomputed for different revisions of the same application without conflict.

// ───────── Suggestions (human-approval unit; node-id targeted)

model Suggestion {
  id                    String              @id @default(cuid())
  applicationRevisionId String
  operation             SuggestionOperation
  targetNodeId          String              // stable node id in the source profile
  expectedOriginalHash  String              // sha256 of the target node's text at generation time
  originalText          String?
  suggestedText         String
  rationale             String
  evidence              Json                // verbatim source excerpts backing the change
  status                SuggestionStatus    @default(PENDING)
  decidedAt             DateTime?
  appliedInVersionId    String?
  model                 String
  promptVersion         String
  createdAt             DateTime            @default(now())

  applicationRevision ApplicationRevision @relation(fields: [applicationRevisionId], references: [id], onDelete: Cascade)
  appliedInVersion    ResumeVersion?      @relation("SuggestionAppliedVersion", fields: [appliedInVersionId], references: [id])

  @@index([applicationRevisionId, status])
}

enum SuggestionOperation { REWRITE_BULLET REWRITE_SUMMARY REORDER EMPHASIZE_SKILL }
enum SuggestionStatus { PENDING APPROVED REJECTED APPLIED }
// SuggestionStatus is suggestion-specific. Future artifacts (e.g. post-MVP
// cover letters) get their own decision enum — APPLIED does not generalize.

// ───────── Tracker history

model ApplicationStatusEvent {
  id            String             @id @default(cuid())
  applicationId String
  fromStatus    ApplicationStatus?
  toStatus      ApplicationStatus
  createdAt     DateTime           @default(now())

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

// ───────── Background jobs: JobRun + transactional outbox

model JobRun {
  id             String       @id @default(cuid())
  userId         String
  type           JobRunType
  entityType     String       // "ResumeVersion" | "JobDescription" | "ApplicationRevision" | "StoredFile"
  entityId       String
  status         JobRunStatus @default(QUEUED)
  attempts       Int          @default(0)
  error          String?      // sanitized, user-safe message only
  idempotencyKey String       @unique
  queuedAt       DateTime     @default(now())
  startedAt      DateTime?
  finishedAt     DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([entityType, entityId])
}

enum JobRunType { RESUME_PARSE JOB_ANALYZE SUGGESTIONS FILE_CLEANUP }
enum JobRunStatus { QUEUED ACTIVE COMPLETED FAILED }

model OutboxEvent {
  id          String    @id @default(cuid())
  topic       String    // queue name: "resume-parse" | "job-analyze" | "suggestions" | "file-cleanup"
  payload     Json      // exactly { jobRunId: string } — nothing else
  createdAt   DateTime  @default(now())
  publishedAt DateTime?
  attempts    Int       @default(0)
  lastError   String?

  @@index([publishedAt, createdAt]) // dispatcher scans unpublished in order
}

// ───────── Audit

model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  actor      Actor    // USER | SYSTEM | AI
  action     String   // "resume.uploaded", "suggestion.approved", "application.status_changed", ...
  entityType String
  entityId   String
  metadata   Json?    // ids, hashes, counts, model/prompt versions — NEVER document text or prompts
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([entityType, entityId])
}

enum Actor { USER SYSTEM AI }
// AuditLog is append-only at the APPLICATION level: no update/delete code paths
// exist. This plan does not claim database-enforced immutability; adding
// REVOKE UPDATE/DELETE grants or a guard trigger is optional post-MVP hardening.
```

Modeling notes:

- **Both inputs to matching are versioned.** `ResumeVersion` and `JobAnalysisVersion` are append-only; an `ApplicationRevision` pins one of each, and `MatchResult` belongs to the revision. Nothing a score depends on can change under it.
- **`Application` holds only stable tracking state** (status, notes, appliedAt, timestamps) plus a pointer to its current revision. Anything that affects matching lives on revisions.
- **`ResumeVersion.profile` nodes carry stable ids and content hashes** (§9). Suggestions target nodes by id and are hash-checked at apply time.
- **`StoredFile` has an explicit `User` relation** (missing in Revision 1) and a `deletedAt` soft-mark that drives the object-storage cleanup job.
- **`Suggestion.appliedInVersionId` is a proper optional relation** to `ResumeVersion` (named relation, distinct from the revision's own resume-version link).
- JSON columns (`profile`, `requirements`, `breakdown`, `evidence`) are always parsed through their Zod schema on read.

---

## 6. API Routes

All routes live under `src/app/api`. Every request passes: session check (`requireUser()`), CSRF Origin/Host check for state-changing methods, then Zod contract validation. Errors use the envelope `{ error: { code, message, details? } }`. Async endpoints return `202 { jobRunId }`; clients poll `GET /api/runs/:id`.

| Method | Path | Purpose | Async? |
|---|---|---|---|
| `*` | `/api/auth/[...nextauth]` | Auth.js handlers (Google OAuth) | – |
| `GET` | `/api/live` | Liveness: process is up (no dependency checks) | – |
| `GET` | `/api/ready` | Readiness: PostgreSQL, Redis, object storage reachable; migrations applied | – |
| `POST` | `/api/consent` | Record `AI_PROCESSING` consent `{privacyPolicyVersion, aiDisclosureVersion}`; required before any AI-triggering endpoint | – |
| `POST` | `/api/resumes` | Multipart upload (title + file). Validates magic bytes/size, streams to object storage, creates Resume + v1 + JobRun + OutboxEvent in one tx. 403 without consent | ✔ |
| `GET` | `/api/resumes` / `/api/resumes/:id` | List / detail incl. versions, parse status, profile | – |
| `GET` | `/api/resumes/:id/file` | Authorized download: streams through the handler or 302-redirects to a short-lived signed URL. Never a public object URL | – |
| `DELETE` | `/api/resumes/:id` | Soft-marks files, enqueues `file-cleanup` via outbox; 409 if referenced by applications | ✔ |
| `POST` | `/api/jobs` | Paste JD `{title, company?, rawText}`; creates JobDescription + analysis JobRun via outbox. 403 without consent | ✔ |
| `GET` | `/api/jobs` / `/api/jobs/:id` | List / detail incl. analysis-version history and latest requirements | – |
| `POST` | `/api/jobs/:id/analyze` | Request a new `JobAnalysisVersion` (e.g. after prompt/model change). Reuses an existing version when `(inputHash, model, promptVersion)` match | ✔ |
| `POST` | `/api/applications` | `{jobDescriptionId, resumeVersionId}` → Application + INITIAL ApplicationRevision (pinning latest JobAnalysisVersion) + MatchResult, one tx. 409 if analysis not yet complete | – |
| `GET` | `/api/applications` | Tracker payload: applications grouped by status, sorted by `updatedAt` desc | – |
| `GET` | `/api/applications/:id` | Detail: current revision, match breakdown, suggestions, revision history | – |
| `PATCH` | `/api/applications/:id` | `{status?, notes?, appliedAt?}`; validates legal transitions; writes StatusEvent + audit | – |
| `POST` | `/api/applications/:id/revisions` | Manual repin `{resumeVersionId?, jobAnalysisVersionId?}` → REPIN revision + recomputed match | – |
| `POST` | `/api/applications/:id/suggestions` | Enqueue suggestion generation against the **current revision** (JobRun + outbox). 403 without consent | ✔ |
| `GET` | `/api/applications/:id/suggestions` | List suggestions with statuses, grouped by revision | – |
| `POST` | `/api/suggestions/:id/decision` | `{decision: "APPROVED" \| "REJECTED"}`; row-locked; 409 if already decided | – |
| `POST` | `/api/applications/:id/apply-suggestions` | Applies all APPROVED suggestions of the current revision: new ResumeVersion + new ApplicationRevision + MatchResult, one tx. 409 on node-hash conflict or concurrent apply | – |
| `GET` | `/api/runs/:id` | Poll a JobRun (status, sanitized error) | – |
| `DELETE` | `/api/account` | Deletes all user rows and enqueues object-storage cleanup; backend/privacy capability with a minimal settings-page trigger | ✔ |

Removed from the MVP surface (post-MVP): cover-letter routes, `GET /api/dashboard/summary`, `GET /api/audit` (viewer UI deferred; audit rows are still written), `POST /api/account/export`.

**Typed client:** `src/lib/api-client.ts` exposes methods whose input/output types are inferred from the contract schemas — client and server cannot drift.

---

## 7. Authentication, Authorization and CSRF

### Authentication

- **Auth.js (NextAuth v5)**, **Google provider only**, **Prisma adapter**, **database sessions** (revocable server-side).
- Session cookie: `HttpOnly`, `Secure` (production), `SameSite=Lax`.
- Sign-in page is the only unauthenticated page; the `(app)` layout calls `auth()` and redirects when there is no session.
- **Test-only credentials provider** exists solely for E2E runs, gated by `E2E_TEST_MODE=1` — with a hard kill switch: `src/lib/env.ts` **fails application startup** when `NODE_ENV === "production" && E2E_TEST_MODE === "1"`. This is asserted by an integration test (§16).

### CSRF (explicit, for custom route handlers)

Auth.js protects its own endpoints only. All custom state-changing route handlers (`POST`/`PATCH`/`DELETE`) additionally pass `src/server/csrf.ts`:

1. Validate the `Origin` header (falling back to `Referer` origin) against an allowlist derived from the configured application URL(s); compare against the `Host` the request arrived on.
2. Reject cross-origin or origin-less mutation requests with 403 (an audit-friendly `csrf.rejected` log line, no document content).
3. Cookie flags (`Secure`, `HttpOnly`, `SameSite=Lax`) are retained as the second layer.
4. If a future embedding scenario makes Origin checks insufficient, a double-submit CSRF token is the documented escalation path — not needed for the MVP's same-origin app.

### Authorization (server-side, defense in depth)

1. **Route boundary** — every handler starts with `const user = await requireUser()` (401 on failure).
2. **Service boundary** — every service function's first parameter is `userId`; queries are written as `where: { id, userId }` or via owning-parent joins, so a missing row and a foreign row are indistinguishable (both 404 — no existence leaks).
3. **No client-trusted identifiers** — `userId` never comes from a request body.
4. **Worker parity** — queue payloads contain only `{ jobRunId }`. The processor loads the `JobRun` from PostgreSQL and derives the user and entities from database relationships. **A `userId` in a queue payload is never trusted because it never exists.**
5. **Tests** — parameterized "other user's resource returns 404" tests across all services (§16).

No roles in the MVP; the service-layer scoping leaves room for them later.

---

## 8. File Storage

S3-compatible object storage from the first upload milestone (M2). **The web server and worker never share a local filesystem.**

- **Interface:** `FileStore` (`put`, `getStream`, `getSignedUrl(ttl)`, `delete`) with a single S3 driver built on the AWS SDK v3 S3 client. Endpoint/credentials via env, so one driver serves **Cloudflare R2**, **AWS S3**, **Supabase Storage** (S3-compatible endpoint), and **MinIO** (local dev/CI).
- **Keys:** generated (`resumes/{userId}/{cuid}`), never derived from user-supplied filenames. Original filename lives only in `StoredFile.fileName` metadata.
- **Access:** the bucket is private; objects are **never publicly accessible**. Downloads go through `GET /api/resumes/:id/file`, which authorizes ownership and then either streams the object through the handler or 302-redirects to a **short-lived signed URL** (≤ 60 s TTL). Which of the two is the default is an M2 benchmark decision (§21); both paths are implemented by the interface.
- **Upload flow:** the web handler validates size/type/magic bytes and streams the body to object storage **before** the DB transaction that creates `StoredFile` + `ResumeVersion` + `JobRun` + `OutboxEvent`. An orphaned object (upload succeeded, transaction failed) is acceptable garbage — removed by the sweep below.
- **Deletion:** deleting a resume or account never leaves objects behind. Rows are soft-marked (`StoredFile.deletedAt`), a `file-cleanup` JobRun is enqueued via the outbox, and the processor deletes the object(s) then hard-deletes the rows. A periodic orphan sweep (worker cron) reconciles objects without live rows and soft-marked rows past a grace period.
- **Env:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_FORCE_PATH_STYLE` for MinIO).

---

## 9. Resume Parsing Pipeline

```
Upload (multipart)                          ── web request, synchronous
  1. Consent check (AI_PROCESSING recorded) → else 403 with consent prompt
  2. Validate: extension ∈ {pdf, docx}, size ≤ 10 MB,
     magic bytes match declared type (%PDF- / PK zip), per-user upload rate limit
  3. Stream file to object storage (generated key)
  4. ONE TRANSACTION: StoredFile + Resume + ResumeVersion v1 (parseStatus PENDING)
     + JobRun + OutboxEvent
  5. Respond 202 { resumeId, jobRunId }

Worker: resume-parse processor              ── asynchronous, idempotent (§14)
  6. Load JobRun → ResumeVersion → StoredFile from PostgreSQL (ownership from DB)
  7. Fetch object stream from storage
  8. Guarded text extraction (deterministic), inside the worker only — never the
     web process:
       PDF  → unpdf; ENCRYPTED PDFs REJECTED up front
       DOCX → mammoth behind zip-bomb guards:
              decompressed-size limit (50 MB), archive-entry limit (1,000)
       Global: 30 s parsing timeout per file; worker container memory limit
       (512 MB) so a pathological file kills one job, not the service;
       malformed files → typed, user-readable errors (never a raw stack)
     Reject: empty/near-empty text (scanned-image PDFs — clear error; OCR out of
     scope), > 50 k chars (refused, not truncated)
  9. Normalization: collapse whitespace, de-hyphenate line breaks, preserve
     bullet structure
 10. PII REDACTION (deterministic, src/server/ai/redact.ts): phone numbers,
     email addresses, postal addresses, personal links replaced with
     placeholders ([EMAIL], [PHONE], …) BEFORE any text leaves the system.
     The AI never receives contact PII; the MVP profile stores no contact block.
 11. AI structuring: redactedText → ResumeProfile (content only) via structured
     output on the extraction-tier model (§11)
 12. Node enrichment (server-side, src/server/profile/nodes.ts): every editable
     node — summary, each skill, each experience entry, each bullet, each
     education entry — is assigned a stable immutable nodeId (cuid) and a
     contentHash = sha256(normalized text). The AI never generates ids.
 13. Deterministic verification: every skill's evidence excerpts must appear
     verbatim (whitespace/case-normalized) in rawText; violations dropped + logged
 14. Persist: profile + profileHash, parseStatus = COMPLETE; audit event
     "resume.parsed" (model id, prompt version, token usage — no text)
  Failure → parseStatus = FAILED + sanitized JobRun.error
```

**Node-id lifecycle:** when a new `ResumeVersion` is created by applying suggestions, unchanged nodes keep their `nodeId` (and hash); a rewritten node keeps its `nodeId` with a new `contentHash`; reordered lists keep all member ids. A fresh upload is a new document: new node ids, and suggestions never transfer across uploads.

The **raw text remains the source of truth** for all evidence verification. The structured profile is a derived view for matching and display; the UI shows both.

---

## 10. Match-Score Algorithm

A **versioned pure function** (`MATCH_ALGORITHM_VERSION = 1`) in `src/server/matching/score.ts`:

```
matchScore(profile: ResumeProfile, requirements: JobAnalysis) → MatchBreakdown
```

No I/O, no randomness, no LLM. **Deterministic means: the score is reproducible for frozen `ResumeVersion` and `JobAnalysisVersion` inputs.** Both inputs are immutable rows; each `MatchResult` stores the input version ids (via its `ApplicationRevision`) **and** the content hashes (`profileHash`, `requirementsHash`) of exactly what was scored, so any historical score can be re-derived and byte-compared.

### Normalization

- Skills normalized: lowercase → trim punctuation → singular/plural fold → alias table (`skill-aliases.ts`: `js/javascript`, `ts/typescript`, `postgres/postgresql`, `k8s/kubernetes`, …). The alias table is data, versioned with the algorithm.
- A required skill counts as **matched** if it appears in the profile's normalized skill list **or** as a token/phrase in any experience bullet or summary. Every match records the resume excerpt(s) where it was found.

### Components and weights

| Component | Weight | Sub-score (0–1) |
|---|---|---|
| Must-have skills | 0.45 | matched must-haves / total must-haves |
| Nice-to-have skills | 0.20 | matched nice-to-haves / total nice-to-haves |
| Years of experience | 0.15 | `clamp(resumeYears / requiredYears, 0, 1)`; resumeYears = merged employment span from experience dates |
| Seniority alignment | 0.10 | level-distance table: exact 1.0, one level apart 0.5, else 0 (intern < junior < mid < senior < lead < principal) |
| Education | 0.10 | 1 if profile's highest level ≥ required level, else 0 |

```
score = round(100 × Σ (weightᵢ × subScoreᵢ) / Σ weightᵢ present)
```

Components the job doesn't specify are **excluded and weights renormalized**.

### Output (`MatchBreakdown`, stored in `MatchResult.breakdown`)

```ts
{
  algorithmVersion: 1,
  score: 74,
  inputs: { resumeVersionId, jobAnalysisVersionId, profileHash, requirementsHash },
  components: [
    { name: "mustHaveSkills", weight: 0.45, subScore: 0.8,
      details: [
        { requirement: "typescript", matched: true,
          evidence: ["Built a TypeScript monorepo serving 2M requests/day"] },
        { requirement: "kubernetes", matched: false, evidence: [] },
      ] },
    ...
  ],
  unmatchedMustHaves: ["kubernetes"],   // feeds the suggestions prompt
}
```

The UI renders this as an explainable breakdown. Unmatched requirements are passed to the suggestions generator as focus areas — suggestions may only *surface or re-emphasize existing evidence*, never invent it.

---

## 11. AI Integration, Output Schemas and Verification

### Client and cost model

- `@anthropic-ai/sdk`, wrapped in `src/server/ai/client.ts`. **Only the worker calls it.**
- **Task-specific models and token limits**, all env-configurable and validated by the evaluation suite (§12) before defaults change:

| Task | Env var | Default model | `max_tokens` | Rationale |
|---|---|---|---|---|
| Resume extraction | `AI_MODEL_EXTRACT` | `claude-haiku-4-5` | 8000 | High-volume, schema-constrained extraction; lower-cost tier is sufficient — verified empirically by the eval suite |
| JD analysis | `AI_MODEL_EXTRACT` | `claude-haiku-4-5` | 4000 | Same extraction profile |
| Suggestions (rewriting) | `AI_MODEL_SUGGEST` | `claude-opus-4-8` | 4000 | Rewriting quality directly drives product value; stronger model reserved for this |

- **All calls use structured outputs**: `client.messages.parse()` with `zodOutputFormat(Schema)`. Non-streaming (outputs are small). Model id + `PROMPT_VERSION` recorded on every artifact.
- **Billing reality:** deployed usage is billed per token against an **Anthropic API key** (platform.claude.com). A Claude Pro/Max subscription does **not** cover API usage. The application key, its spend, and per-workflow cost estimates (from §12) are documented separately in the runbook; a monthly budget alert is part of M7.
- Errors: typed SDK exception chain — `RateLimitError`/5xx/connection → BullMQ retry with backoff; `BadRequestError` → fail the JobRun without retry. Token usage from `response.usage` is audit-logged per run (numbers only).
- Prompts live in `src/server/ai/prompts/*.ts`, each exporting a `PROMPT_VERSION`; changing a prompt requires bumping the version **and** passing the offline evaluation (§12).

### Schemas (in `src/contracts/ai`)

```ts
// 1. Job-description analysis (per JobAnalysisVersion)
export const JobAnalysisSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  seniority: z.enum(["intern","junior","mid","senior","lead","principal","unspecified"]),
  employmentType: z.enum(["full_time","part_time","contract","internship","unspecified"]),
  mustHaveSkills: z.array(z.object({
    name: z.string(),
    category: z.enum(["language","framework","tool","platform","domain","soft"]),
  })),
  niceToHaveSkills: z.array(z.object({ name: z.string(), category: z.enum([...]) })),
  minYearsExperience: z.number().int().nullable(),
  educationRequirement: z.enum(["none","bachelors","masters","phd","unspecified"]),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
});

// 2. Resume structuring — CONTENT ONLY. The AI receives redacted text and
// returns no contact fields. Node ids/hashes are added server-side afterwards.
export const ExtractedResumeSchema = z.object({
  summary: z.string().nullable(),
  skills: z.array(z.object({
    name: z.string(),
    evidence: z.array(z.string()),        // verbatim excerpts from the (redacted) text
  })),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string().nullable(),
    startDate: z.string().nullable(),     // "YYYY-MM" when stated, else null
    endDate: z.string().nullable(),       // null = present
    bullets: z.array(z.string()),
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().nullable(),
    level: z.enum(["highschool","bachelors","masters","phd","other"]).nullable(),
    year: z.string().nullable(),
  })),
  certifications: z.array(z.string()),
});

// Stored form (after server-side node enrichment): every editable node gains
//   { nodeId: string, contentHash: string }
export type ResumeProfile = Enriched<ExtractedResumeSchema>;

// 3. Suggestions — node-targeted, controlled operations only
export const SuggestionBatchSchema = z.object({
  suggestions: z.array(z.object({
    operation: z.enum(["REWRITE_BULLET","REWRITE_SUMMARY","REORDER","EMPHASIZE_SKILL"]),
    targetNodeId: z.string(),             // must exist in the provided profile
    originalText: z.string().nullable(),
    suggestedText: z.string(),
    rationale: z.string(),                // ties to a specific job requirement
    evidence: z.array(z.string()),        // verbatim source excerpts justifying every claim
  })).max(10),
});
// The prompt presents the profile WITH node ids so the model targets real nodes;
// the server independently re-checks targetNodeId existence and records
// expectedOriginalHash = the node's contentHash at generation time.
```

### Controlled transformations (MVP)

Suggestions may **only**:

1. **Rewrite one existing bullet** (`REWRITE_BULLET`)
2. **Rewrite the existing summary** (`REWRITE_SUMMARY`)
3. **Reorder existing skills or sections** (`REORDER` — target is the list node; `suggestedText` is the new order of existing member node ids; nothing added or removed)
4. **Emphasize a skill already supported by evidence** (`EMPHASIZE_SKILL` — surfaces an evidenced skill more prominently within existing content)

Suggestions may **never** add new experience, skills, achievements, metrics, employers, projects, education, or certifications. Out-of-policy output fails verification and is dropped.

### Deterministic verification layer (`src/server/ai/verify.ts`)

Runs after schema validation, before anything is persisted. All checks are deterministic string/token analysis against the source texts (resume raw text + JD raw text):

| Check | Rule |
|---|---|
| Evidence presence | Every `evidence` excerpt must occur verbatim (whitespace/case-normalized) in the corresponding source text |
| Target integrity | `targetNodeId` must exist in the source profile; `originalText` must match the node's current text |
| **Numeric grounding** | Every number, percentage, date, and currency value in `suggestedText` must appear in the original node text or the cited evidence. A rewrite cannot introduce "40%", "$2M", "2019", or "6 engineers" that the source never stated |
| **Entity grounding** | Employer names, universities, certifications, and project names in `suggestedText` must appear in the source resume text — detected via the extracted profile's own entity lists plus capitalized-phrase scanning |
| **Technology grounding** | Technology/skill names in `suggestedText` (matched against the skill dictionary + alias table) must be present in the source resume |
| **Claim-strength check** | Leadership/ownership/scale verbs ("led", "owned", "managed", "architected", "founded", "directed", and a maintained list) are rejected unless the same or a stronger form appears in the original node or cited evidence. A rewrite may not upgrade "contributed to" into "led" |
| Operation policy | The operation must be one of the four controlled transformations, applied to the declared node kind (e.g. `REWRITE_SUMMARY` only targets the summary node); `REORDER` output must be a permutation of the existing member ids |

Failures are dropped item-by-item and audit-logged (`ai.suggestion_rejected` with reason codes, counts, hashes — no text). If an entire batch fails, the JobRun fails with a user-visible message.

**Honest limits (stated in-product and in docs):** these checks are lexical, not semantic. Evidence presence does not prove semantic entailment — a suggestion can cite a true excerpt yet claim more than the excerpt supports in ways no string check can catch. The verifier **reduces** the false-claim rate (measured in §12); it cannot mathematically guarantee elimination of every false claim. That is why every suggestion still requires explicit human approval, with the evidence displayed beside it.

---

## 12. AI Evaluation

An **offline evaluation suite** (`evals/`) using **anonymized fixtures** — real-world-shaped resume/JD pairs with all personal data replaced. It is the release gate for any prompt or model change.

- **Dataset:** target **30–50 resume/JD pairs**; the MVP ships with **at least 10** (M7 acceptance criterion). Fixtures live in the repo (they are anonymized) with expected structured outputs curated by hand.
- **Metrics measured per run:**
  - structured field extraction accuracy (title, seniority, years, education vs. hand labels)
  - required-skill **precision and recall** (extracted must-haves vs. labeled must-haves)
  - **unsupported-claim rate** (manual + heuristic count of suggestion claims not grounded in the source)
  - **evidence rejection rate** (share of generated items dropped by the verifier — a rising rate flags prompt drift)
  - **schema failure rate** (parse/validation failures per 100 calls)
  - **p50 and p95 latency** per operation
  - **estimated cost per complete workflow** (upload → analysis → suggestions), from recorded token usage × current pricing
- **Gate:** `npm run eval` runs the suite against the fixed dataset and writes a scored report. Any change to `PROMPT_VERSION`, `AI_MODEL_EXTRACT`, or `AI_MODEL_SUGGEST` must include the before/after report; regressions beyond agreed thresholds block release. The nightly CI job (§16) runs the live evaluation on a schedule as drift detection.
- **Model selection is empirical:** the extraction-tier default (`claude-haiku-4-5`) holds only while its eval metrics stay within thresholds; the suite is the mechanism for promoting/demoting task models — not intuition.

---

## 13. Human-Approval Workflow

Approval is **structural**: the schema makes unapproved changes unrepresentable.

```
 AI generates suggestions against the CURRENT ApplicationRevision (status: PENDING)
        │  (each carries targetNodeId + expectedOriginalHash)
        ▼
 Review UI: side-by-side original vs suggested, rationale, evidence excerpts
        │
   user decides per suggestion (row-locked; concurrent decisions → one wins, other 409)
        ├── REJECTED ──► terminal; audit "suggestion.rejected"
        └── APPROVED ──► audit "suggestion.approved"
                              │
                              ▼   user clicks "Apply approved suggestions"
                    ONE TRANSACTION:
                      1. re-verify each approved suggestion's expectedOriginalHash
                         against the source node — any mismatch aborts with 409
                         (stale suggestion; user must regenerate)
                      2. new ResumeVersion (source: SUGGESTIONS_APPLIED), node ids
                         carried forward, rewritten nodes re-hashed
                      3. suggestions → APPLIED (appliedInVersionId set)
                      4. new ApplicationRevision (source: SUGGESTIONS_APPLIED)
                         pinning the new ResumeVersion + same JobAnalysisVersion
                      5. new MatchResult for the new revision
                      6. Application.currentRevisionId updated; audit events
```

Invariants (enforced in services + covered by tests):

1. A `ResumeVersion` with `source = SUGGESTIONS_APPLIED` can only be created from suggestions with `status = APPROVED`, and only when every `expectedOriginalHash` still matches its target node. **Hash mismatch → 409 conflict, nothing applied.**
2. Decision transitions are one-way: `PENDING → APPROVED | REJECTED`, and `APPROVED → APPLIED` only via the apply transaction. Decisions are row-locked; the second concurrent decision on the same suggestion gets 409.
3. Concurrent `apply-suggestions` requests are serialized (advisory lock per application); the loser sees 409.
4. Applying never mutates history: old versions, old revisions, and old match results remain queryable.
5. Every generation (actor `AI`), decision (actor `USER`), and derived recomputation (actor `SYSTEM`) writes an `AuditLog` row — ids, hashes, model/prompt versions, counts; never text.

No feature in the MVP takes any action outside the app, so "no external action without approval" is currently satisfied by having no external-action pathway at all — re-check this at every review that adds an integration.

---

## 14. Background Jobs: Transactional Outbox and Processing Semantics

### Why an outbox

Writing to PostgreSQL and Redis is a dual write: a crash between the two either loses work (DB row without a queue job) or processes phantoms (queue job without a DB row). The outbox removes the dual write: **the only thing a web request writes is one PostgreSQL transaction.**

### Write path (web, one transaction)

```
BEGIN;
  -- 1. business entity mutation (e.g. ResumeVersion v1, parseStatus PENDING)
  -- 2. JobRun row (QUEUED, idempotencyKey, entityType/entityId, userId)
  -- 3. OutboxEvent row (topic = queue name, payload = { jobRunId })
COMMIT;
```

If the transaction commits, the work **will** eventually run; if it aborts, nothing exists anywhere. There is no state in which Redis knows about work PostgreSQL doesn't.

### Dispatch path (worker process)

```
loop (every 1s, and immediately after each non-empty batch):
  SELECT * FROM "OutboxEvent"
   WHERE "publishedAt" IS NULL
   ORDER BY "createdAt"
   LIMIT 100
   FOR UPDATE SKIP LOCKED;                -- safe under multiple dispatchers
  for each event:
    queue.add(topic, { jobRunId }, { jobId: event.id, attempts: 3, backoff })
    UPDATE "OutboxEvent" SET "publishedAt" = now() WHERE id = event.id;
```

- **BullMQ `jobId = OutboxEvent.id`** — republishing the same event is deduplicated by BullMQ, so the crash window *between publish and mark-published* only ever produces a duplicate publish, never duplicate acceptance.
- **Reconciliation is the same loop:** any event still unpublished (dispatcher crash, Redis outage) is picked up on a later pass; `attempts`/`lastError` record publish failures, and events unpublished for > 5 minutes raise an alert metric.

### Queue payload contract

Payloads are exactly `{ jobRunId: string }` (Zod-enforced). The processor loads the `JobRun` and its target entity from PostgreSQL and **derives user/ownership from database relationships**. A `userId` in a payload would be an unauthenticated input — so it is not there at all.

### Processor skeleton (all processors)

```
1. payload ← Zod-parse ({ jobRunId })
2. run ← load JobRun (with user + entity via relations); missing → ack & drop (log)
3. if run.status ∈ {COMPLETED, FAILED} → ack & exit        // duplicate delivery
4. if donePredicate(entity) already satisfied               // crash-after-persist
     → mark run COMPLETED, ack & exit
5. mark run ACTIVE (attempts++, startedAt)
6. do the work; all writes are idempotent (deterministic keys / upserts / re-runnable)
7. persist results + mark run COMPLETED (same transaction where possible)
   on unrecoverable error → mark FAILED (sanitized message) + throw UnrecoverableError
   on transient error → throw (BullMQ retries with backoff)
```

Each processor defines a **done predicate** on its target entity:

| Processor | Done predicate |
|---|---|
| `resume-parse` | `ResumeVersion.parseStatus === COMPLETE` |
| `job-analyze` | a `JobAnalysisVersion` exists for `(jobDescriptionId, inputHash, model, promptVersion)` |
| `suggestions` | suggestions exist for `(applicationRevisionId, promptVersion)` |
| `file-cleanup` | no soft-marked `StoredFile` rows remain for the target |

### Documented failure semantics

| Scenario | Behavior |
|---|---|
| **Duplicate delivery** (dispatcher republish, BullMQ retry, stalled reclaim) | Step 3/4 of the skeleton: terminal runs are acked as no-ops; already-persisted work short-circuits via the done predicate. At-least-once delivery is the assumption everywhere. |
| **Crash before persistence** | No state was written. BullMQ redelivers (retry or stalled reclaim) and the processor re-runs from scratch. External side effects (an AI call) may be repeated — acceptable, bounded by the attempt limit, and paid-for tokens are the only loss. |
| **Crash after persistence but before JobRun completion** | On redelivery the done predicate detects the completed work (e.g. profile already stored with matching hash) and marks the JobRun `COMPLETED` without re-calling the AI. |
| **Stalled-job redelivery** | BullMQ stalled-job detection (lock expiry, `maxStalledCount`) re-queues jobs whose worker died mid-run; the redelivery follows the same skeleton, so half-finished runs are resumed or short-circuited, never double-applied. |
| **Retry exhaustion** | After 3 attempts (exponential backoff 5 s → 30 s → 2 m) the run is marked `FAILED` with a sanitized user-facing error; internal detail goes to logs only. The UI offers retry, which creates a **new** JobRun + OutboxEvent (fresh idempotency key with an attempt suffix) — failed runs are never resurrected in place. |

### Operational settings

Concurrency 5 per queue; per-user cap of 3 concurrently ACTIVE AI runs (enforced at enqueue); 120 s per-job timeout with a 90 s AbortController on AI calls; worker traps SIGTERM → stops claiming, drains in-flight (including the dispatcher loop), exits.

---

## 15. Security and Privacy

| Area | Measures |
|---|---|
| **Secrets** | Env vars only; `.env` git-ignored; `.env.example` documents every variable. `src/lib/env.ts` (Zod) fails boot on missing/malformed config. Gitleaks in CI. |
| **CSRF** | §7: Origin/Host allowlist validation on every custom state-changing route handler; cross-origin mutations rejected with 403; `Secure`/`HttpOnly`/`SameSite=Lax` cookies retained; double-submit token documented as escalation path. |
| **AI consent** | No resume/JD content is sent to the AI provider until the user has recorded `AI_PROCESSING` consent. Stored: consent timestamp, privacy-policy version, AI-provider disclosure version (`UserConsent`). Enforced in every service that enqueues AI work (403 otherwise), not just in the UI. |
| **PII redaction** | Deterministic pre-send redaction (`ai/redact.ts`): phone numbers, email addresses, postal addresses, and unrelated personal links replaced with placeholders before any provider call. Contact PII never leaves the system; the MVP profile stores no contact block. |
| **Log hygiene** | Resume/JD text, AI prompts, and AI responses are never written to logs, Sentry breadcrumbs/error metadata, or `AuditLog.metadata`. Pino serializers strip known text fields; Sentry `beforeSend` scrubs request bodies; audit metadata is ids/hashes/counts/versions only. A unit test greps a captured log stream from a full pipeline run for fixture-document markers. |
| **Input validation** | Zod at every boundary. Uploads validated by size, extension, and magic bytes; storage keys generated server-side; downloads only via the authorized handler / short-lived signed URLs (§8). |
| **Parser hardening** | All parsing in the worker, never the web process. Encrypted PDFs rejected up front; DOCX decompressed-size limit (50 MB) and archive-entry limit (1,000) against zip bombs; 30 s parse timeout; worker memory limits so one pathological file cannot take down the service; malformed files produce typed errors. |
| **Authorization** | §7: session-scoped queries, ownership derived from DB relationships in workers, 404-not-403. |
| **Rate limiting** | Redis token buckets: global per-user API limit; stricter limits on upload and AI-triggering endpoints; per-user AI concurrency cap. 429 with `Retry-After`. |
| **Prompt-injection resistance** | Resume/JD text is untrusted input: delimited as data in prompts, but the real guarantee is downstream — schema-constrained outputs + the deterministic verifier (§11). The AI has no tools and no network access; text in, validated JSON out. |
| **Test-auth kill switch** | The E2E credentials provider cannot exist in production: startup fails hard when `NODE_ENV === "production" && E2E_TEST_MODE === "1"` (env-validation assertion + integration test). |
| **XSS** | React escaping; no `dangerouslySetInnerHTML` for user/AI content; security headers (CSP with nonce, `X-Content-Type-Options`, `Referrer-Policy`). |
| **Account deletion** | Backend capability (F10): deletes all database rows **and** stored objects via the file-cleanup pipeline; verified by an integration test that checks both stores for residue. Minimal settings-page trigger; polished flows post-MVP. |
| **Audit integrity** | `AuditLog` is **application-level append-only**: no update/delete code paths exist. This plan does not claim database-enforced immutability; `REVOKE UPDATE/DELETE` grants or a guard trigger are documented optional hardening. |
| **Dependencies** | Dependabot + `npm audit` in CI; lockfile committed. |

---

## 16. Testing Strategy

### Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure logic: match scoring, skill normalization, verifier checks (numeric/entity/claim-strength), node hashing, redaction, status transitions, contract schemas, env validation |
| Property-based | Vitest + **fast-check** | Match engine invariants (below) |
| Integration | Vitest + real Postgres/Redis/MinIO (compose services) | Services, outbox, processors, storage, authorization — the list below |
| E2E | Playwright (Chromium) | The primary journey + variants against a running web+worker with **FakeAiClient** |
| Static | ESLint, `tsc --noEmit`, Prettier check, Gitleaks | — |

### Property-based tests (fast-check, match engine)

- Score always ∈ [0, 100] for arbitrary valid profiles/requirements.
- Determinism: same inputs (arbitrary) ⇒ identical breakdown across repeated runs.
- Permutation invariance: shuffling skill/experience order never changes the score.
- Monotonicity: adding a matched must-have skill to the profile never decreases the score; removing one never increases it.
- Renormalization: removing an unspecified component from requirements never produces NaN or out-of-range scores.

### Required integration tests (explicit list)

1. **Duplicate BullMQ delivery** — deliver the same `{ jobRunId }` twice; second delivery is a no-op; exactly one set of results persists.
2. **Worker crash before persistence** — kill the processor mid-run before any write; redelivery completes the work; no partial state.
3. **Worker crash after persistence, before JobRun completion** — persist results, crash before status update; redelivery hits the done predicate and marks COMPLETED without re-doing work (assert the FakeAiClient was called exactly once).
4. **Stalled-job redelivery** — expire the BullMQ lock on an ACTIVE job; the reclaimed run resumes/short-circuits correctly.
5. **Outbox publication retry** — commit entities with Redis down; assert unpublished events; restore Redis; dispatcher publishes them; also assert publish-then-crash-before-mark produces no duplicate processing (jobId dedupe).
6. **Concurrent suggestion decisions** — two simultaneous decisions on one suggestion: one succeeds, one gets 409; final state has a single decision.
7. **Concurrent apply-approved requests** — two simultaneous applies: exactly one new ResumeVersion + ApplicationRevision; loser gets 409.
8. **Stale suggestion source hashes** — apply a suggestion whose target node changed since generation: 409, nothing applied, statuses unchanged.
9. **Cross-origin CSRF rejection** — mutation request with a foreign/absent Origin: 403; same-origin passes.
10. **Unauthorized storage access** — user B requesting user A's file: 404; direct object access without going through the API impossible (private bucket asserted via anonymous request in the MinIO harness).
11. **Production E2E-auth kill switch** — booting env validation with `NODE_ENV=production` and `E2E_TEST_MODE=1` throws.
12. **Account deletion completeness** — seed a full account (files, versions, applications, suggestions); delete; assert zero rows **and** zero objects remain.

Plus (carried over from Revision 1): parameterized cross-user 404 tests for every service; approval-invariant tests; parser fixture tests (encrypted PDF, zip bomb, oversized, malformed, image-only); log-hygiene test (no document text in captured logs).

### AI in tests

- All CI tests use **FakeAiClient** (fixture outputs) — fast, free, deterministic.
- The **live** AI evaluation (§12) runs nightly and before releases, never on the PR path.

### E2E scenarios (Playwright)

Auth via the test-only credentials provider (`E2E_TEST_MODE=1`, dev/test only — §15):

1. **Primary journey (PR gate):** sign in → consent → upload resume → parsed profile appears → paste JD → analysis appears → create application → match breakdown with evidence → generate suggestions → reject one, approve one → apply → new version + revision + updated score → change tracker status → persists on reload.
2. Consent gate: AI-triggering actions blocked until consent is recorded.
3. Failure surfacing: a failing parse (fixture) shows a readable error + retry.
4. Accessibility: `@axe-core/playwright` on each main page, zero critical violations; tracker status changes fully keyboard-operable.

### CI structure

| Trigger | Jobs |
|---|---|
| **Every push** | lint, typecheck, unit (incl. property-based), build |
| **Pull requests** | everything above + integration suite (Postgres/Redis/MinIO service containers, `prisma migrate deploy`, migration-drift check) + **critical E2E journey** (scenario 1) |
| **Nightly / release** | complete E2E suite, performance checks (tracker/list endpoints under seeded load), **live AI evaluation** against the fixture dataset with the production model config |

---

## 17. Deployment Architecture

**Managed services only for the first production release.** No self-hosted Caddy, no VM administration, no self-managed database backups (provider-managed backups are configuration, not operations).

```
   GitHub Actions ──── build images / deploy ────────────────┐
        │  (migrate step runs `prisma migrate deploy`        │
        │   against managed Postgres before rollout)         ▼
        │                                    ┌────────────────────────────┐
        │                                    │  Web deployment            │
        │                                    │  (Vercel, or a container   │
        │                                    │   platform e.g. Railway/   │
        │                                    │   Fly/Render)              │
        │                                    └──────┬─────────────────────┘
        │                                           │
        │            ┌──────────────────────────────┼──────────────────┐
        │            ▼                              ▼                  ▼
        │   ┌─────────────────┐          ┌──────────────────┐  ┌───────────────┐
        │   │ Managed         │          │ Managed Redis    │  │ S3-compatible │
        │   │ PostgreSQL      │          │ (Upstash /       │  │ object store  │
        │   │ (Neon/Supabase/ │          │  Redis Cloud)    │  │ (R2 / S3 /    │
        │   │  RDS)           │          └────────▲─────────┘  │  Supabase)    │
        │   └────────▲────────┘                   │            └───────▲───────┘
        │            │                            │                    │
        │            └────────────┬───────────────┘────────────────────┘
        │                         │
        │              ┌──────────┴───────────────┐
        └─────────────►│  Worker deployment       │
                       │  (container: Railway /   │
                       │   Fly / Render)          │
                       │  dispatcher + processors │
                       └──────────────────────────┘
```

- **Separate web and worker deployments**, scaled and restarted independently; they share only `DATABASE_URL`, `REDIS_URL`, and the S3 credentials.
- **Web:** Vercel is the default candidate (native Next.js); a container platform is the fallback if request-streaming for uploads/downloads proves awkward there (§21). The worker is always a container (long-lived process).
- **Migrations:** `prisma migrate deploy` as an explicit release step before rollout — never at container boot.
- **Health:** platform health checks target `/api/ready` (web) and an equivalent worker probe; `/api/live` for restart decisions.
- **Observability:** pino JSON logs to the platform's log drain; Sentry (with the §15 scrubber); JobRun/OutboxEvent lag metrics.
- **Local dev parity:** docker-compose runs Postgres, Redis, MinIO — the same interfaces the managed services expose. Self-hosted production (Caddy/VM/backup scripts) is out of MVP scope; a short "self-hosting notes" appendix in the runbook is the only nod to it.

---

## 18. Milestones and Acceptance Criteria

Each milestone is independently testable, sized for one developer, merged to `main` behind green CI, and **complete before the next milestone starts**.

---

### M0 — Foundation

**Scope:** Next.js App Router scaffold (TypeScript `strict`, `noUncheckedIndexedAccess`); Tailwind + shadcn/ui; Prisma + initial migration (User + Auth.js models); Redis client; `env.ts` validation (including the production/E2E kill-switch assertion); pino logger with text-stripping serializers; error taxonomy + API error envelope; CSRF middleware skeleton; `GET /api/live` + `GET /api/ready`; docker-compose (postgres, redis, minio); CI `ci.yml` (push: lint, typecheck, unit, build); `.env.example`.

**Acceptance criteria:**
- [ ] `docker compose up` starts postgres, redis, minio; `GET /api/live` returns 200 with no dependency checks; `GET /api/ready` returns 200 and reports Postgres, Redis, and object-storage status individually — and returns 503 when any one of them is stopped.
- [ ] `npm run lint && npm run typecheck && npm run test && npm run build` pass locally and in CI; CI is a required check.
- [ ] A missing required env var fails startup naming the variable; setting `NODE_ENV=production` + `E2E_TEST_MODE=1` fails startup (unit test).
- [ ] A sample route demonstrates: Zod 400 on bad input, `AppError` mapping, and 403 on a cross-origin POST (CSRF check active).
- [ ] Gitleaks CI step passes; no secrets in the repo.

---

### M1 — Authentication

**Scope:** Auth.js with Google provider + Prisma adapter; sign-in page; authenticated `(app)` layout with redirect; `requireUser()`; sign-out; test-only credentials provider gated by `E2E_TEST_MODE` (kill switch already enforced by M0 env validation); Playwright harness using the test provider.

**Acceptance criteria:**
- [ ] A new user signs in with Google and lands on an empty authenticated shell; the User row is created once and reused on re-login.
- [ ] Unauthenticated page access redirects to sign-in; unauthenticated API calls return 401 with the error envelope.
- [ ] Session cookie is `HttpOnly`, `Secure` (prod), `SameSite=Lax`; sign-out invalidates the DB session.
- [ ] E2E: sign-in via test provider → shell renders; 401 checks pass in CI.
- [ ] Integration test: the credentials provider is absent from the Auth.js config when `E2E_TEST_MODE` is unset.

---### M2 — Resume Upload, Object Storage, Parsing and Worker Infrastructure

**Scope:** StoredFile/Resume/ResumeVersion/UserConsent/JobRun/OutboxEvent/AuditLog models + migrations; `FileStore` interface + S3 driver (MinIO local, R2/S3/Supabase via env); consent capture UI + `POST /api/consent` + enforcement; upload endpoint (validation → stream to storage → single outbox transaction); worker process with outbox dispatcher + processor skeleton (done predicates, idempotency, graceful shutdown); guarded pdf/docx extraction (encrypted-PDF rejection, zip-bomb limits, timeout); PII redaction; AI client wrapper (per-task model/token config) + FakeAiClient; resume structuring prompt + `ExtractedResumeSchema`; node enrichment (ids + hashes); evidence verifier (presence checks); `file-cleanup` processor + resume deletion; resumes UI (upload, list, detail with status polling, raw text + profile view); `GET /api/runs/:id`; first audit events.

**Acceptance criteria:**
- [ ] Without recorded consent, upload returns 403 and the UI shows the consent prompt; after `POST /api/consent`, the stored row has timestamp + both versions, and upload proceeds.
- [ ] Uploading a valid PDF/DOCX returns 202; polling ends with `parseStatus = COMPLETE`; the profile renders with every editable node carrying a `nodeId` and `contentHash`; every skill's evidence appears verbatim in the raw text.
- [ ] The object exists in MinIO under a generated key; anonymous direct object access fails; `GET /api/resumes/:id/file` succeeds for the owner and 404s for another user.
- [ ] The text sent to the AI (captured via FakeAiClient) contains no email/phone/postal/personal-link fixtures — placeholders only.
- [ ] Malicious/broken fixtures (encrypted PDF, DOCX zip bomb over the decompressed-size or entry limits, oversized file, wrong magic bytes, image-only PDF) each produce their typed, user-readable error; nothing half-created; the web process never parses.
- [ ] Outbox semantics proven by integration tests §16 #1–#5 (duplicate delivery, crash before/after persistence, stalled redelivery, publication retry) for the `resume-parse` pipeline.
- [ ] Deleting a resume removes DB rows and, after the cleanup job, the stored object (integration test asserts both).
- [ ] Audit rows exist for `consent.recorded`, `resume.uploaded`, `resume.parsed` with ids/hashes/model metadata and no document text; the log-hygiene test passes over a full pipeline run.

---

### M3 — Versioned Job-Description Analysis

**Scope:** JobDescription + JobAnalysisVersion models + migrations; paste-JD form, jobs list/detail UI with version history; `job-analyze` processor (creates version n+1 on completion); `(inputHash, model, promptVersion)` reuse; `POST /api/jobs/:id/analyze`; JD analysis prompt + `JobAnalysisSchema`; requirements display.

**Acceptance criteria:**
- [ ] Pasting a JD yields, via the async flow, a `JobAnalysisVersion` v1 whose JSON validates against the schema; UI renders must-have vs nice-to-have distinctly, plus seniority/years/education.
- [ ] Re-running analysis with identical input, model, and prompt version reuses the existing version (FakeAiClient not called — asserted); after a `PROMPT_VERSION` bump, re-running creates v2 while v1 remains readable.
- [ ] Analysis rows are immutable: no code path updates `requirements` (write-once verified by test), and version numbers are gapless per JD.
- [ ] Empty/too-long (> 20 k chars) input rejected with clear messages; failures surface with retry (new JobRun).
- [ ] `inputHash`, `requirementsHash`, `model`, `promptVersion` stored on every version.

---

### M4 — Applications and Deterministic Matching

**Scope:** Application + ApplicationRevision + MatchResult + ApplicationStatusEvent models + migrations (circular current-revision FK handled in one transaction); application creation flow (pin resume version + latest analysis version → INITIAL revision + match); matching engine (`score.ts`, normalization, alias table) with golden-fixture + fast-check property tests; match breakdown UI; manual repin endpoint.

**Acceptance criteria:**
- [ ] Creating an application produces, in one transaction: Application, INITIAL ApplicationRevision, MatchResult; `currentRevisionId` is set; detail page shows score + full breakdown with per-requirement evidence and the pinned version ids.
- [ ] `MatchResult` stores `profileHash` and `requirementsHash` matching the pinned versions' content; recomputing the same revision with the same `algorithmVersion` is a no-op (uniqueness holds); the same `algorithmVersion` computes fine on a different revision of the same application.
- [ ] Golden fixtures pass; all §16 property-based invariants pass (bounds, determinism, permutation invariance, monotonicity, renormalization).
- [ ] Unmatched must-haves listed explicitly; duplicate application for the same job (same user) rejected via `@@unique([userId, jobDescriptionId])`.
- [ ] Repin creates a REPIN revision + new MatchResult without touching prior revisions/results.
- [ ] Coverage for `src/server/matching/**` ≥ 95% lines.

---

### M5 — AI Suggestions, Verification and Human Approval

**Scope:** Suggestion model + migration; `suggestions` processor (prompt over node-id-annotated profile + requirements + unmatched must-haves; controlled operations only); full deterministic verifier (evidence presence, target integrity, numeric/entity/technology grounding, claim-strength, operation policy); review UI (original vs suggested, rationale, evidence, approve/reject); decision endpoint with row locking; apply-approved transaction (hash re-check → new ResumeVersion with carried-forward node ids → APPLIED statuses → new SUGGESTIONS_APPLIED revision → new MatchResult → currentRevision update); concurrency serialization; audit events throughout.

**Acceptance criteria:**
- [ ] Generated suggestions are PENDING, target existing `nodeId`s, carry `expectedOriginalHash`, and are limited to the four operations; out-of-policy fixture outputs (added metric, new employer, upgraded "contributed to"→"led", unknown technology, REORDER that drops a member) are each rejected by the verifier with distinct reason codes and audit entries.
- [ ] Verifier unit suite passes: verbatim/whitespace-variant excerpts accepted; paraphrased or fabricated excerpts rejected; numbers/dates/currency absent from source rejected; claim-strength list enforced.
- [ ] Decisions are one-way and row-locked: concurrent decisions on one suggestion → one 200, one 409 (integration test §16 #6).
- [ ] Apply-approved: creates exactly one new ResumeVersion (unchanged nodes keep ids and hashes; rewritten nodes keep ids with new hashes), one new ApplicationRevision, one new MatchResult, marks suggestions APPLIED with `appliedInVersionId`, updates `currentRevisionId` — all or nothing.
- [ ] Stale-hash apply → 409 and zero writes (§16 #8); concurrent applies → single winner (§16 #7); apply with zero approved suggestions → 400.
- [ ] E2E: generate → reject one → approve one → apply → new version + revision visible, score updated.

---

### M6 — Simple Application Tracker

**Scope:** Tracker UI: applications grouped by status (columns or table view) with a **status dropdown** per application — no drag-and-drop; rows ordered by `updatedAt` desc within groups; legal-transition validation; StatusEvent recording; notes + appliedAt editing; empty states.

**Acceptance criteria:**
- [ ] All applications render grouped by status; changing status via the dropdown persists, moves the row, and survives reload.
- [ ] Illegal transitions (defined transition map) are rejected with 400 and the UI reverts; every successful change writes an ApplicationStatusEvent + AuditLog row.
- [ ] Notes and appliedAt editable inline; setting status to APPLIED prompts for (optional) appliedAt.
- [ ] Fully keyboard-operable (dropdown + forms); axe scan of the tracker page has zero critical violations.
- [ ] E2E: create → SAVED → PREPARING → APPLIED with a date → INTERVIEWING; history of status events visible on the detail page.

---

### M7 — Security Hardening, AI Evaluation, Deployment and Documentation

**Scope:** Rate limiting (global + AI endpoints + per-user AI concurrency cap); CSP + security headers; Sentry with scrubber; account deletion end-to-end (rows + objects) with minimal settings UI; AI evaluation suite (`evals/` runner, metrics, ≥ 10 anonymized fixture pairs) + nightly workflow + release gate documentation; per-task model/token config finalized via eval results; managed-services deployment (web + worker, managed Postgres/Redis, object storage) with migrate-then-deploy workflow; runbook (env vars, deploy, API-key/cost documentation, budget alert); README rewritten to describe only shipped functionality; PR/nightly CI workflows completed.

**Acceptance criteria:**
- [ ] Rate limits return 429 + `Retry-After`; a 4th concurrent AI run per user is rejected per design; limits documented.
- [ ] §16 integration tests #9–#12 pass (CSRF rejection, unauthorized storage access, production kill switch, account-deletion completeness).
- [ ] `npm run eval` runs ≥ 10 anonymized fixture pairs and reports: extraction accuracy, skill precision/recall, unsupported-claim rate, evidence rejection rate, schema failure rate, p50/p95 latency, estimated cost per workflow; the report is committed as the baseline; the nightly workflow runs it live.
- [ ] A deliberate prompt regression in a test branch is caught by the eval thresholds (gate demonstrably works).
- [ ] Production deploy from a tagged release succeeds: web and worker deployed separately on managed services; `/api/ready` green with managed Postgres/Redis/object storage; migrations applied before rollout; HTTPS + security headers verified by an automated check.
- [ ] Sentry receives a test error with request bodies/document text scrubbed (manual verification documented).
- [ ] Runbook documents the Anthropic **API key** setup, explicitly notes that a Claude Pro subscription does not cover API usage, and records the measured per-workflow cost estimate; a monthly budget alert is configured.
- [ ] README describes only shipped functionality; the primary-journey E2E (§16 scenario 1) is green on `main`.

---

### Milestone dependency graph

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► M6 ──► M7
              │
              └── M2 establishes: object storage, outbox + dispatcher,
                  processor skeleton, consent, redaction, AI client, audit —
                  M3–M5 all build on these foundations.
```

---

## 19. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **M2 is the heaviest milestone** (storage + outbox + parsing + AI + consent in one increment) | High | Schedule slip at the critical foundation | The M2 scope list is ordered so infrastructure (storage → outbox → processor skeleton) lands before AI concerns; each item has its own tests; nothing in M3+ starts until M2's criteria are green. If needed, M2 may be split at the "processor skeleton proven" boundary without changing the roadmap. |
| **PDF/DOCX extraction quality** (multi-column layouts, image-only scans) | High | Garbage poisons everything downstream | Fixture corpus from day one; raw text shown beside the parsed profile; explicit "scanned image" error; OCR deferred and documented. |
| **AI fabrication despite prompts** | Medium | Violates the truthfulness promise | Controlled transformations only; deterministic verifier (numeric/entity/technology/claim-strength grounding); measured unsupported-claim rate in the eval suite; human approval as the final gate. Documented honestly: lexical checks reduce but cannot guarantee elimination (§11). |
| **Semantic gaps the verifier cannot catch** | Medium | Residual false claims reach the review UI | Evidence displayed beside every suggestion so the human decision is informed; unsupported-claim rate tracked over time; thresholds tighten as the fixture set grows. |
| **Extraction-tier model too weak** (`claude-haiku-4-5` misses skills → bad match scores) | Medium | Match credibility | The eval suite measures skill precision/recall per model; the extraction model is promoted to a stronger tier the moment metrics dip below thresholds — a config change, not a refactor. |
| **AI cost/latency surprises** | Medium | Worker backlog, spend | Task-specific models and token caps; per-user rate + concurrency limits; token usage logged per run; cost-per-workflow measured in evals; budget alert; separate API-key billing documented (no Pro-subscription assumption). |
| **Outbox dispatcher lag or Redis outage** | Low–Medium | Delayed jobs (never lost) | Work is durable in PostgreSQL by design; unpublished-event age metric + alert; dispatcher resumes automatically; integration-tested (§16 #5). |
| **Anonymized fixture collection is slow** (30–50 pairs) | Medium | Weak evaluation coverage early | MVP requires only ≥ 10; the suite is built so pairs can be added incrementally; synthetic-but-realistic fixtures acceptable while real anonymized ones accumulate. |
| **Match-score credibility** ("why 74?") | Medium | User distrust | Full breakdown with per-requirement evidence; versioned, documented algorithm; input hashes make any score re-derivable; never presented as a vendor ATS score. |
| **Scope creep toward auto-apply/scraping** | Medium | Legal/ToS exposure | Non-goals explicit; no outbound-action pathway exists in the architecture to extend "accidentally". |
| **Vercel streaming limits for uploads/downloads** | Low–Medium | Web-tier platform rework | The FileStore interface supports both streaming and signed-URL modes; decision deferred to an M2 benchmark (§21); container platform is a drop-in fallback for the web tier. |
| **Auth.js v5 / Next.js version drift** | Low | Build breakage | Pinned versions, lockfile in CI, Dependabot behind the CI gate. |

---

## 20. Revision 2 Change Log

Every major change from Revision 1, by review item:

1. **Product name** — "AutoApply AI" removed; ApplyPilot AI used consistently; repository `ApplyPilot-AI`.
2. **Reduced MVP** — roadmap rewritten from M0–M9 to M0–M7. Moved to post-MVP: cover-letter generation (model, prompts, routes, processor, UI), analytics dashboard/charts, funnel analytics, drag-and-drop Kanban (pointer and keyboard), audit-log viewer UI, account data-export UI/endpoint, multiple download formats, READY-status cover-letter gating (and the `READY` status itself), self-hosted Caddy/PostgreSQL/Redis/backup infrastructure. Account deletion kept as a backend/privacy capability with a minimal trigger. Tracker MVP is grouped columns / table with a status dropdown — no drag-and-drop.
3. **File storage** — local-disk driver replaced by an S3-compatible `FileStore` (Cloudflare R2 / AWS S3 / Supabase Storage; MinIO in dev) from M2: generated keys, private bucket, authorized-route or short-lived-signed-URL access only, `deletedAt`-driven cleanup job plus orphan sweep, and no shared web/worker filesystem anywhere in the design.
4. **Background-job reliability** — "transactional-ish" enqueue replaced with a full **transactional outbox**: entity + JobRun + OutboxEvent in one PostgreSQL transaction; dispatcher (`FOR UPDATE SKIP LOCKED`, BullMQ `jobId` = event id) publishes and marks published; the same loop is the reconciliation path. Queue payloads reduced to `{ jobRunId }`; workers load everything from PostgreSQL and derive ownership from relationships (payload `userId` eliminated as a trust input). Documented semantics for duplicate delivery, crash before persistence, crash after persistence, stalled-job redelivery, and retry exhaustion, with per-processor done predicates.
5. **Database model** — added `JobAnalysisVersion` (append-only, `jobDescriptionId` + version + requirements + `inputHash` + model + promptVersion + createdAt) replacing the overwritable `JobAnalysis`. Added `ApplicationRevision` (applicationId, resumeVersionId, jobAnalysisVersionId, source, createdAt); `Application` now holds only stable tracking state plus `currentRevisionId`. `MatchResult` moved onto revisions with `@@unique([applicationRevisionId, algorithmVersion])`, allowing the same algorithm version across revisions. Added the missing `StoredFile → User` relation. Made `Suggestion.appliedInVersionId` a proper optional relation. Introduced a dedicated `SuggestionStatus` enum (the shared `DecisionStatus` with `APPLIED` is gone). Removed Float `boardOrder`; MVP orders by `updatedAt` within status groups, integer `position` deferred to the drag-and-drop feature.
6. **Stable resume edit targets** — positional paths (`experience[1].bullets[2]`) replaced by immutable `nodeId` + `contentHash` on every editable profile node (assigned server-side, carried forward across versions). Suggestions now carry `targetNodeId`, `operation`, `expectedOriginalHash`, `originalText`, `suggestedText`, `rationale`, `evidence`; applying fails with 409 when the hash no longer matches.
7. **AI reliability** — "deterministic matching" defined precisely (reproducible for frozen `ResumeVersion` + `JobAnalysisVersion` inputs); `MatchResult` stores input version ids and content hashes. Verifier strengthened beyond substring matching: numeric/percentage/date/currency grounding, employer/university/certification/project entity grounding, technology-name grounding, claim-strength (leadership/ownership) checks. Suggestions restricted to four controlled transformations; all additions of new facts prohibited. Documented honestly that evidence presence ≠ semantic entailment and the verifier reduces but cannot guarantee elimination of false claims.
8. **AI evaluation** — new offline eval suite (`evals/`): anonymized fixtures (target 30–50 pairs, ≥ 10 in MVP), measuring extraction accuracy, skill precision/recall, unsupported-claim rate, evidence rejection rate, schema failure rate, p50/p95 latency, and cost per workflow; release gate for prompt/model changes; nightly live run. Task-specific models and token limits (`AI_MODEL_EXTRACT` default `claude-haiku-4-5`, `AI_MODEL_SUGGEST` default `claude-opus-4-8`, per-operation `max_tokens`), with model choices validated empirically. Documented that deployed usage bills against an application Anthropic API key — a Claude Pro subscription does not cover it — with costs tracked separately.
9. **Security** — explicit CSRF protection for custom state-changing route handlers (Origin/Host allowlist, cross-origin rejection, double-submit token as documented escalation, cookie flags retained). AI-processing consent required before any content is sent to the provider, storing timestamp + privacy-policy version + AI-disclosure version. Deterministic PII redaction (phone, email, postal address, personal links) before every provider call. Log hygiene: resume/JD text and prompts excluded from logs, Sentry, and audit metadata, with a test enforcing it. Parser hardening: DOCX decompressed-size and archive-entry limits, encrypted-PDF rejection, parse timeout, worker memory limits, typed malformed-file errors, parsing only in the worker. Production startup fails when `NODE_ENV === "production" && E2E_TEST_MODE === "1"`. AuditLog described accurately as application-level append-only (DB-level enforcement listed as optional hardening, not claimed).
10. **Health endpoints** — single `/api/health` split into `GET /api/live` (process) and `GET /api/ready` (PostgreSQL, Redis, object storage, migrations).
11. **Testing** — added the twelve explicit integration tests (duplicate delivery, crash before/after persistence, stalled redelivery, concurrent decisions, concurrent applies, stale hashes, outbox retry, CSRF rejection, unauthorized storage access, production kill switch, deletion completeness); property-based testing with fast-check for the match engine; CI restructured into push (lint/typecheck/unit/build), PR (integration + critical E2E journey), and nightly/release (full E2E, performance, live AI evaluation) tiers.
12. **Deployment** — self-hosted single-VM design (Caddy, self-managed Postgres/Redis, backup scripts) replaced by managed services: managed PostgreSQL, managed Redis, S3-compatible object storage, separate web and worker deployments. docker-compose retained for local development only.
13. **Milestones** — all acceptance criteria rewritten against the corrected architecture; each milestone independently testable, one-developer sized, and sequential; the primary end-to-end journey stated verbatim in §1 and enforced as the PR-gate E2E test and M7 completion bar.

---

## 21. Unresolved Architectural Decisions

Decisions intentionally left open, each with an owner-milestone and a default:

1. **File download mode: streaming proxy vs. short-lived signed URLs.** Both are behind the `FileStore` interface. Default: streaming through the authorized handler (simplest authz story); decide in M2 after benchmarking memory/latency on the target web platform — signed URLs win if streaming through the handler is costly on serverless.
2. **Web-tier platform: Vercel vs. container host.** Depends on decision 1 and multipart-upload ergonomics on serverless. Default: Vercel; fall back to the same container platform as the worker if streaming limits bite. Decide by M7 deployment.
3. **Extraction-model tier.** `AI_MODEL_EXTRACT` defaults to `claude-haiku-4-5`, but the commitment is to the eval thresholds, not the model: if skill precision/recall on the fixture set is inadequate, promote to a mid-tier model. Decide with the first full eval report (M7, revisited as fixtures grow).
4. **Outbox dispatch latency mechanism.** MVP uses 1 s polling with `SKIP LOCKED` (simple, testable). PostgreSQL `LISTEN/NOTIFY` (or triggering a dispatch pass inline after commit) would cut latency but adds connection-lifecycle complexity — post-MVP optimization unless polling latency proves user-visible.
5. **Auto-revision on new JobAnalysisVersion.** When a JD is re-analyzed, existing applications keep their pinned analysis version; a manual repin endpoint exists. Whether to *prompt* users ("a newer analysis exists — update this application?") or auto-create REPIN revisions is a product decision deferred until real usage; MVP behavior is manual-only.
6. **Redaction scope for "unrelated personal links."** Emails/phones/postal addresses are unambiguous; classifying which URLs are "personal" (LinkedIn? GitHub? portfolio?) is not. MVP default: redact all URLs except a small allowlist of domains that commonly carry professional evidence (github.com, gitlab.com) — the allowlist is a reviewed config file. Revisit with user feedback.
7. **Suggestion regeneration policy after apply.** After a successful apply, remaining PENDING suggestions target superseded hashes and will conflict. MVP: they stay visible but apply-blocked, with a "regenerate against current version" action. Whether to auto-expire them instead is deferred.

---

*End of plan (Revision 2). The first implementation milestone is **M0 — Foundation**; no application code exists yet and none should be written except in service of M0's acceptance criteria.*
