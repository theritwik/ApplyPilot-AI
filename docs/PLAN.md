# ApplyPilot AI — Implementation Plan

> **Naming note.** The product brief refers to "AutoApply AI"; the repository is `ApplyPilot-AI`. This plan uses **ApplyPilot AI** as the product name throughout. Despite the "AutoApply/ApplyPilot" branding, the MVP deliberately does **not** auto-apply to anything — see [Non-Goals](#2-mvp-scope-and-non-goals). The existing `readme.md` describes a broader aspirational feature set (job scraping, one-click apply); it will be rewritten to match this plan in the final milestone.

**Status:** Approved plan, pre-implementation
**Owner:** Ritwik Singh
**Last updated:** 2026-07-16

---

## Table of Contents

1. [Refined Product Requirements](#1-refined-product-requirements)
2. [MVP Scope and Non-Goals](#2-mvp-scope-and-non-goals)
3. [System Architecture](#3-system-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Prisma Data Model](#5-prisma-data-model)
6. [API Routes](#6-api-routes)
7. [Authentication and Authorization](#7-authentication-and-authorization)
8. [Resume Parsing Pipeline](#8-resume-parsing-pipeline)
9. [Match-Score Algorithm](#9-match-score-algorithm)
10. [AI Integration and Output Schemas](#10-ai-integration-and-output-schemas)
11. [Human-Approval Workflow](#11-human-approval-workflow)
12. [Background-Job Design](#12-background-job-design)
13. [Security and Privacy](#13-security-and-privacy)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Milestones and Acceptance Criteria](#16-milestones-and-acceptance-criteria)
17. [Risks and Mitigations](#17-risks-and-mitigations)

---

## 1. Refined Product Requirements

### Problem statement

Job seekers manually tailor their resume and cover letter for every application, guess at how well they match a posting, and track applications in spreadsheets. ApplyPilot AI turns this into a structured, auditable workflow: upload a master resume once, paste a job description, and the system produces an evidence-based match score, truthful tailoring suggestions, and a draft cover letter — with the human approving every change before anything is stored or used.

### Core user journey

```
Sign in with Google
  └─► Upload master resume (PDF/DOCX) ──► parsed into structured profile
        └─► Paste a job description ──► analyzed into structured requirements
              └─► Create an Application (resume × job)
                    ├─► Deterministic match score with per-requirement evidence
                    ├─► AI suggestions to improve the resume  ──► user approves/rejects each
                    │       approved suggestions ──► new immutable resume version
                    ├─► AI cover-letter draft ──► user edits/approves
                    └─► Track the application on a Kanban board ──► dashboard analytics
```

### Functional requirements (MVP)

| # | Requirement | Notes |
|---|---|---|
| F1 | Google sign-in | Auth.js, Google OAuth only for MVP |
| F2 | Resume upload (PDF, DOCX ≤ 10 MB) and parsing into a structured profile | Text extraction is deterministic; structuring uses AI with validated output |
| F3 | Job-description paste and structured analysis | Must-have/nice-to-have skills, seniority, years of experience, education, keywords |
| F4 | Deterministic resume↔job match score (0–100) with a per-requirement evidence breakdown | Pure function, versioned, no LLM in the scoring path |
| F5 | AI-assisted resume suggestions grounded in existing resume content | Every suggestion cites verbatim resume excerpts; uncited suggestions are discarded server-side |
| F6 | Human approval for every modification | Suggestions are approve/reject; approved ones produce a new immutable resume version; nothing is silently changed |
| F7 | Cover-letter generation with edit + explicit approval | Claims must cite resume/job excerpts |
| F8 | Application Kanban tracker | Columns: Saved → Preparing → Ready → Applied → Interviewing → Offer / Rejected / Withdrawn |
| F9 | Dashboard analytics | Counts by status, applications per week, average match score, funnel conversion |
| F10 | Background job processing with status visibility, and an audit log of every state change | BullMQ + Redis; `JobRun` and `AuditLog` tables |

### Non-functional requirements

- **Truthfulness:** the system must never fabricate resume content. AI outputs are structurally validated (Zod) *and* semantically verified (evidence excerpts must exist in the source documents).
- **Human agency:** no external action, no resume modification, and no cover-letter finalization without explicit user approval.
- **Auditability:** every AI generation, approval decision, and status change is recorded in an append-only audit log.
- **Isolation:** all data is strictly per-user; every query is scoped server-side by the authenticated user's id.
- **Determinism where it matters:** match scoring is a versioned pure function so results are reproducible and unit-testable.
- **Accessibility:** WCAG 2.1 AA targets — keyboard-operable Kanban, labeled forms, visible focus, sufficient contrast.
- **Type safety end to end:** TypeScript `strict`, Zod validation at every boundary (HTTP, queue payloads, AI outputs, env vars).

---

## 2. MVP Scope and Non-Goals

### In scope (MVP)

The ten features F1–F10 above, a Docker-based local dev environment, CI, unit/integration/E2E tests for critical logic, and a deployable production configuration.

### Explicit non-goals (MVP)

| Non-goal | Rationale |
|---|---|
| **Job-site scraping or job discovery** | Legal/ToS risk, brittle, out of scope. Users paste job descriptions. |
| **Autonomous or mass application submission ("auto-apply")** | The product requires human approval for everything; no browser automation, no form auto-fill against third-party sites. |
| **Sending emails or any outbound action on the user's behalf** | The MVP produces artifacts (resume versions, cover letters); the user applies manually. |
| ATS-score simulation against real ATS vendors | The match score is our own transparent, documented heuristic — not a claim about any vendor's ATS. |
| Multiple OAuth providers / email-password auth | Google only. |
| Resume PDF re-rendering / templating engine | MVP exports tailored resume content as structured text/Markdown; pixel-perfect PDF generation is a post-MVP feature. |
| Interview prep, salary insights, AI recruiter chat | Post-MVP (per legacy README roadmap). |
| Teams/multi-tenant orgs, billing | Single-user accounts only. |
| Mobile app / browser extension | Responsive web only. |

Anything not listed as F1–F10 is out of scope until the MVP milestones are complete.

---

## 3. System Architecture

### Overview

A single Next.js (App Router) application serves the UI and the typed HTTP API. A separate Node worker process consumes BullMQ queues for all slow work (parsing, AI calls). Both share one TypeScript codebase — Prisma client, services, contracts — and differ only in entry point. PostgreSQL is the system of record; Redis backs queues and rate limiting.

```
                ┌────────────────────────────────────────────────────┐
                │                     Browser                        │
                │   React (RSC + client components), Tailwind,       │
                │   shadcn/ui, typed fetch client                    │
                └──────────────┬─────────────────────────────────────┘
                               │ HTTPS (session cookie)
                ┌──────────────▼─────────────────────────────────────┐
                │                Next.js app (web)                   │
                │  • App Router pages (server components)            │
                │  • Route handlers /api/* (Zod-validated contracts) │
                │  • Auth.js (Google OAuth, Prisma adapter)          │
                │  • Services layer (authorization + business logic) │
                └───────┬──────────────┬─────────────────┬───────────┘
                        │              │                 │ enqueue
                 Prisma │              │ rate limit      ▼
                        │              │          ┌─────────────┐
                ┌───────▼──────┐  ┌────▼─────┐    │   BullMQ    │
                │  PostgreSQL  │  │  Redis   │◄───┤   queues    │
                │ (system of   │  │          │    └──────┬──────┘
                │  record)     │  └──────────┘           │ consume
                └───────▲──────┘                  ┌──────▼──────────────────┐
                        │                         │      Worker (node)      │
                        └─────────────────────────┤ • resume-parse          │
                                                  │ • job-analyze           │
              ┌───────────────┐                   │ • suggestions           │
              │ File storage  │◄──────────────────┤ • cover-letter          │
              │ (local volume │                   │ Anthropic API calls,    │
              │  → S3 later)  │                   │ pdf/docx extraction     │
              └───────────────┘                   └─────────────────────────┘
```

### Key architectural decisions

| Decision | Choice | Rationale / rejected alternatives |
|---|---|---|
| API style | **Route handlers + shared Zod contracts** in `src/contracts` | Explicit REST surface is readable in a portfolio and testable with plain HTTP. tRPC rejected (hides the wire format); Server Actions used only where a plain form post is clearly simpler, and they call the same services. |
| Slow work | **Everything AI or file-parsing runs in the worker via BullMQ** | Keeps web requests < 1s, survives AI-provider latency spikes, gives retries/backoff for free. Client polls `JobRun` status (simple, robust); SSE considered post-MVP. |
| Data mutation model | **Immutable versions + explicit decisions** | Resume content is never edited in place: applying approved suggestions creates a new `ResumeVersion`. This makes the approval requirement structural, not procedural. |
| Match scoring | **Deterministic pure function, versioned** | Reproducible, unit-testable, explainable. LLM-as-judge scoring rejected: non-deterministic and unauditable. |
| AI provider | **Anthropic API (`@anthropic-ai/sdk`), default model `claude-opus-4-8`, model id via env** | Structured outputs (`messages.parse()` + `zodOutputFormat`) give schema-guaranteed JSON, which the "validated structured output" requirement demands. A thin `AiClient` interface isolates the SDK so a second provider could be added without touching services. |
| Web/worker code sharing | **Single package, two entry points** | Monorepo tooling (turborepo/nx) is overhead the project doesn't need; the worker imports the same `src/server/**` modules. |
| File storage | **Storage interface with a local-disk driver (Docker volume) for MVP; S3-compatible driver post-MVP** | Keeps dev/deploy simple; interface prevents lock-in. Files are never publicly served — downloads go through an authorized route handler. |
| Sessions | **Database sessions (Auth.js Prisma adapter)** | Server-side revocation, no JWT key management; fits "server-side authorization" requirement. |

---

## 4. Directory Structure

```
applypilot-ai/
├── .github/
│   └── workflows/
│       └── ci.yml                  # lint → typecheck → unit → integration → e2e
├── docker/
│   ├── Dockerfile.web
│   └── Dockerfile.worker
├── docker-compose.yml              # dev: web, worker, postgres, redis
├── docker-compose.prod.yml
├── docs/
│   └── PLAN.md                     # this document
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                     # demo data for local dev / screenshots
├── public/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (marketing)/page.tsx    # landing / sign-in
│   │   ├── (app)/                  # authenticated shell (layout enforces session)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── resumes/            # list, [id] detail w/ versions
│   │   │   ├── jobs/               # paste JD, [id] analysis view
│   │   │   ├── applications/
│   │   │   │   ├── board/page.tsx  # Kanban
│   │   │   │   └── [id]/page.tsx   # match score, suggestions, cover letter
│   │   │   └── settings/page.tsx   # profile, data export/delete
│   │   └── api/                    # route handlers (see §6)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── resumes/  jobs/  applications/  dashboard/
│   │   └── shared/                 # JobRunStatus poller, EmptyState, etc.
│   ├── contracts/                  # Zod schemas shared by client, server, worker
│   │   ├── api/                    # request/response schemas per endpoint
│   │   ├── ai/                     # JobAnalysis, ResumeProfile, Suggestions, CoverLetter
│   │   └── queue/                  # queue payload schemas
│   ├── lib/                        # framework-agnostic utilities
│   │   ├── env.ts                  # Zod-validated process.env (fail fast at boot)
│   │   ├── logger.ts               # pino structured logger
│   │   ├── errors.ts               # AppError taxonomy → HTTP mapping
│   │   ├── prisma.ts               # singleton client
│   │   ├── redis.ts
│   │   └── api-client.ts           # typed fetch wrapper inferring from contracts
│   └── server/                     # server-only code (web + worker)
│       ├── auth/                   # auth.ts (Auth.js config), require-user.ts
│       ├── services/               # one service per aggregate; all take userId
│       │   ├── resume-service.ts
│       │   ├── job-service.ts
│       │   ├── application-service.ts
│       │   ├── match-service.ts
│       │   ├── suggestion-service.ts
│       │   ├── cover-letter-service.ts
│       │   ├── dashboard-service.ts
│       │   └── audit-service.ts
│       ├── ai/
│       │   ├── client.ts           # AiClient wrapper over @anthropic-ai/sdk
│       │   ├── prompts/            # versioned prompt modules (PROMPT_VERSION const)
│       │   ├── extract-job.ts      # JD → JobAnalysis
│       │   ├── extract-resume.ts   # raw text → ResumeProfile
│       │   ├── suggest.ts          # (profile, analysis) → Suggestions
│       │   ├── cover-letter.ts
│       │   └── evidence.ts         # verbatim-excerpt verifier (anti-fabrication)
│       ├── parsing/
│       │   ├── pdf.ts              # unpdf/pdf-parse text extraction
│       │   ├── docx.ts             # mammoth text extraction
│       │   └── normalize.ts        # whitespace/section normalization
│       ├── matching/
│       │   ├── score.ts            # pure scoring function (versioned)
│       │   ├── normalize-skill.ts
│       │   └── skill-aliases.ts    # "js" → "javascript", etc.
│       ├── storage/
│       │   ├── file-store.ts       # interface
│       │   └── local-file-store.ts
│       └── queue/
│           ├── queues.ts           # queue definitions + names
│           └── enqueue.ts          # creates JobRun row + enqueues atomically
├── worker/
│   ├── index.ts                    # BullMQ workers bootstrap
│   └── processors/
│       ├── resume-parse.ts
│       ├── job-analyze.ts
│       ├── suggestions.ts
│       └── cover-letter.ts
├── tests/
│   ├── unit/                       # vitest (also colocated *.test.ts allowed)
│   ├── integration/                # vitest + real Postgres/Redis (compose)
│   ├── e2e/                        # Playwright
│   └── fixtures/                   # sample resumes (pdf/docx), JDs, AI outputs
├── .env.example                    # every env var, no real values
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                   # strict: true, noUncheckedIndexedAccess: true
├── vitest.config.ts
└── playwright.config.ts
```

Conventions:

- `src/server/**` must never be imported from client components (enforced with `server-only` package imports).
- Route handlers are thin: parse input with a contract schema → call a service → map result/error to a response. All business logic and authorization live in services.
- Everything that crosses a boundary (HTTP body, queue payload, AI response, `process.env`) passes through a Zod schema before use.

---

## 5. Prisma Data Model

```prisma
// ───────── Auth.js (standard adapter models: Account, Session, VerificationToken omitted for brevity)

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  createdAt     DateTime  @default(now())

  accounts      Account[]
  sessions      Session[]
  resumes       Resume[]
  jobs          JobDescription[]
  applications  Application[]
  jobRuns       JobRun[]
  auditLogs     AuditLog[]
}

// ───────── Resumes (immutable version chain)

model Resume {
  id        String   @id @default(cuid())
  userId    String
  title     String              // "Master Resume", user-editable
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions  ResumeVersion[]

  @@index([userId])
}

model ResumeVersion {
  id             String              @id @default(cuid())
  resumeId       String
  version        Int                 // 1..n per resume
  source         ResumeVersionSource // UPLOAD | SUGGESTIONS_APPLIED
  fileId         String?             // original upload only
  rawText        String              // extracted plain text
  profile        Json?               // validated ResumeProfile (null until parsed)
  parseStatus    ParseStatus         @default(PENDING)
  createdAt      DateTime            @default(now())

  resume       Resume        @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  file         StoredFile?   @relation(fields: [fileId], references: [id])
  applications Application[]
  suggestions  Suggestion[]  @relation("SuggestionSourceVersion")

  @@unique([resumeId, version])
}

enum ResumeVersionSource { UPLOAD SUGGESTIONS_APPLIED }
enum ParseStatus { PENDING PROCESSING COMPLETE FAILED }

model StoredFile {
  id         String   @id @default(cuid())
  userId     String
  storageKey String   @unique
  fileName   String
  mimeType   String
  sizeBytes  Int
  sha256     String
  createdAt  DateTime @default(now())

  resumeVersions ResumeVersion[]

  @@index([userId])
}

// ───────── Jobs

model JobDescription {
  id        String   @id @default(cuid())
  userId    String
  title     String              // user-supplied or extracted
  company   String?
  sourceUrl String?             // optional reference link (never fetched by us)
  rawText   String
  createdAt DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  analysis     JobAnalysis?
  applications Application[]

  @@index([userId])
}

model JobAnalysis {
  id               String      @id @default(cuid())
  jobDescriptionId String      @unique
  status           ParseStatus @default(PENDING)
  requirements     Json?       // validated JobAnalysis schema
  model            String?     // AI model id used
  promptVersion    String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  jobDescription JobDescription @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade)
}

// ───────── Applications (resume version × job) + Kanban

model Application {
  id               String            @id @default(cuid())
  userId           String
  jobDescriptionId String
  resumeVersionId  String
  status           ApplicationStatus @default(SAVED)
  boardOrder       Float             @default(0)  // fractional ordering within a column
  notes            String?
  appliedAt        DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobDescription JobDescription     @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade)
  resumeVersion  ResumeVersion      @relation(fields: [resumeVersionId], references: [id])
  matchResults   MatchResult[]
  suggestions    Suggestion[]
  coverLetters   CoverLetter[]
  statusEvents   ApplicationStatusEvent[]

  @@unique([userId, jobDescriptionId, resumeVersionId])
  @@index([userId, status])
}

enum ApplicationStatus { SAVED PREPARING READY APPLIED INTERVIEWING OFFER REJECTED WITHDRAWN }

model ApplicationStatusEvent {
  id            String            @id @default(cuid())
  applicationId String
  fromStatus    ApplicationStatus?
  toStatus      ApplicationStatus
  createdAt     DateTime          @default(now())

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

// ───────── Matching (deterministic, versioned)

model MatchResult {
  id               String   @id @default(cuid())
  applicationId    String
  algorithmVersion Int
  score            Int      // 0–100
  breakdown        Json     // per-component sub-scores + per-requirement evidence
  createdAt        DateTime @default(now())

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@unique([applicationId, algorithmVersion])
}

// ───────── Suggestions (human-approval unit)

model Suggestion {
  id                    String           @id @default(cuid())
  applicationId         String
  sourceResumeVersionId String           // version the suggestion was generated against
  kind                  SuggestionKind
  targetSection         String           // e.g. "experience[1].bullets[2]", "summary"
  originalText          String?
  suggestedText         String
  rationale             String
  evidence              Json             // verbatim resume/job excerpts backing the suggestion
  status                DecisionStatus   @default(PENDING)
  decidedAt             DateTime?
  appliedInVersionId    String?          // ResumeVersion created when applied
  model                 String
  promptVersion         String
  createdAt             DateTime         @default(now())

  application         Application   @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  sourceResumeVersion ResumeVersion @relation("SuggestionSourceVersion", fields: [sourceResumeVersionId], references: [id])

  @@index([applicationId, status])
}

enum SuggestionKind { REWRITE_BULLET REWRITE_SUMMARY REORDER_SECTION EMPHASIZE_SKILL }
enum DecisionStatus { PENDING APPROVED REJECTED APPLIED }

// ───────── Cover letters

model CoverLetter {
  id            String         @id @default(cuid())
  applicationId String
  draftText     String         // AI-generated draft (never mutated)
  editedText    String?        // user's edited version
  factsUsed     Json           // claims + source excerpts (resume/job)
  status        DecisionStatus @default(PENDING)
  decidedAt     DateTime?
  model         String
  promptVersion String
  createdAt     DateTime       @default(now())

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId, status])
}

// ───────── Background jobs + audit

model JobRun {
  id             String       @id @default(cuid())
  userId         String
  type           JobRunType
  entityType     String       // "ResumeVersion" | "JobDescription" | "Application" | ...
  entityId       String
  status         JobRunStatus @default(QUEUED)
  attempts       Int          @default(0)
  error          String?
  idempotencyKey String       @unique
  queuedAt       DateTime     @default(now())
  startedAt      DateTime?
  finishedAt     DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([entityType, entityId])
}

enum JobRunType { RESUME_PARSE JOB_ANALYZE SUGGESTIONS COVER_LETTER }
enum JobRunStatus { QUEUED ACTIVE COMPLETED FAILED }

model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  actor      Actor    // USER | SYSTEM | AI
  action     String   // "resume.uploaded", "suggestion.approved", "application.status_changed", ...
  entityType String
  entityId   String
  metadata   Json?    // diffs, model ids, prompt versions — never raw secrets/PII beyond necessity
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([entityType, entityId])
}

enum Actor { USER SYSTEM AI }
```

Modeling notes:

- **`ResumeVersion` is append-only.** Uploads create v1; applying approved suggestions creates v(n+1) with `source = SUGGESTIONS_APPLIED`. The original upload file is retained on v1.
- **`Application` pins a specific `resumeVersionId`**, so match scores and suggestions are always relative to a known snapshot. When a new version is created from suggestions, the application is re-pointed to it and the match score recomputed (both recorded in the audit log).
- **`MatchResult.breakdown`** stores the full explanation (per-requirement matched/unmatched + evidence excerpts) so the UI never recomputes and history is preserved across algorithm versions.
- **`JobRun.idempotencyKey`** (e.g. `resume-parse:{resumeVersionId}`) prevents duplicate enqueues; BullMQ job id mirrors it.
- JSON columns (`profile`, `requirements`, `breakdown`, `evidence`, `factsUsed`) are always parsed through their Zod schema on read — the DB stores them, the schema owns their shape.

---

## 6. API Routes

All routes live under `src/app/api`. Every request body/query is parsed with a Zod schema from `src/contracts/api`; every response conforms to a Zod response schema; errors use a single envelope `{ error: { code, message, details? } }`. All routes (except auth and health) require a session and scope data by `session.user.id`.

| Method | Path | Purpose | Async? |
|---|---|---|---|
| `*` | `/api/auth/[...nextauth]` | Auth.js handlers (Google OAuth) | – |
| `GET` | `/api/health` | Liveness: DB + Redis ping | – |
| `POST` | `/api/resumes` | Multipart upload (title + file). Validates magic bytes/size, stores file, creates Resume + v1, enqueues `RESUME_PARSE` | ✔ returns `jobRunId` |
| `GET` | `/api/resumes` | List resumes with latest version + parse status | – |
| `GET` | `/api/resumes/:id` | Resume detail incl. versions | – |
| `GET` | `/api/resumes/:id/file` | Authorized download of the original upload | – |
| `DELETE` | `/api/resumes/:id` | Delete resume (cascades; blocked if referenced by applications, returns 409) | – |
| `POST` | `/api/jobs` | Paste JD (title, company?, rawText). Creates JobDescription, enqueues `JOB_ANALYZE` | ✔ |
| `GET` | `/api/jobs` / `GET /api/jobs/:id` | List / detail incl. analysis status + requirements | – |
| `POST` | `/api/applications` | Create application `{jobDescriptionId, resumeVersionId}`; computes match synchronously (pure function, fast) | – |
| `GET` | `/api/applications?view=board` | Board payload grouped by status, ordered by `boardOrder` | – |
| `GET` | `/api/applications/:id` | Full detail: job, resume version, match, suggestions, cover letters | – |
| `PATCH` | `/api/applications/:id` | Update `{status?, boardOrder?, notes?, appliedAt?}`; validates legal status transitions; writes StatusEvent + audit | – |
| `POST` | `/api/applications/:id/suggestions` | Enqueue `SUGGESTIONS` generation for the pinned resume version | ✔ |
| `GET` | `/api/applications/:id/suggestions` | List suggestions with statuses | – |
| `POST` | `/api/suggestions/:id/decision` | `{decision: "APPROVED" \| "REJECTED"}` — records decision + audit | – |
| `POST` | `/api/applications/:id/apply-suggestions` | Materializes all APPROVED suggestions into a new ResumeVersion, re-points application, recomputes match | – |
| `POST` | `/api/applications/:id/cover-letter` | Enqueue `COVER_LETTER` draft generation | ✔ |
| `PATCH` | `/api/cover-letters/:id` | Save `editedText` (only while PENDING) | – |
| `POST` | `/api/cover-letters/:id/decision` | Approve/reject the (edited) letter | – |
| `GET` | `/api/runs/:id` | Poll a JobRun (status, error) — used by all async flows | – |
| `GET` | `/api/dashboard/summary` | Aggregates for dashboard | – |
| `GET` | `/api/audit` | Paginated audit log for the current user | – |
| `POST` | `/api/account/export` / `DELETE /api/account` | Data export (JSON) and full account deletion | – |

**Async pattern:** endpoints marked ✔ return `202 { jobRunId }`. The client polls `GET /api/runs/:id` (2s interval with backoff) until `COMPLETED`/`FAILED`, then refetches the entity. This keeps the contract simple and testable.

**Typed client:** `src/lib/api-client.ts` exposes `api.resumes.create(input)`-style methods whose input/output types are inferred from the contract schemas — the client and server cannot drift.

---

## 7. Authentication and Authorization

### Authentication

- **Auth.js (NextAuth v5)** with the **Google provider** only, using the **Prisma adapter** and **database sessions** (revocable server-side, no JWT signing-key rotation to manage).
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`. Auth.js provides CSRF protection for its own endpoints; state-changing API routes rely on `SameSite=Lax` + same-origin checks (Next.js Server Actions have origin checks built in).
- Sign-in page is the only unauthenticated page; the `(app)` layout calls `auth()` and redirects to sign-in when there is no session.

### Authorization (server-side, defense in depth)

1. **Route boundary** — every handler starts with `const user = await requireUser()` (throws 401 → mapped by the error middleware).
2. **Service boundary** — every service function's first parameter is `userId`; there is no service API that fetches an entity without it. Queries are written as `where: { id, userId }` (or via parent joins for child entities), so a missing row and a foreign row are indistinguishable (both 404 — no existence leaks).
3. **No client-trusted identifiers** — `userId` never comes from the request body; it always derives from the session.
4. **Worker parity** — queue payloads carry `userId`, and processors call the same services, so authorization holds even for background work.
5. **Tests** — every service has an "other user's resource returns NotFound" unit test (see §14).

There are no roles in the MVP (every user owns only their own data); the service-layer scoping design leaves room for roles later without restructuring.

---

## 8. Resume Parsing Pipeline

```
Upload (multipart)                        ── web request, synchronous
  1. Validate: extension ∈ {pdf, docx}, size ≤ 10 MB,
     magic bytes match declared type (%PDF- / PK zip),
     rate limit (uploads per user per hour)
  2. Store file via FileStore (sha256 dedupe key), create Resume + ResumeVersion v1
     (parseStatus = PENDING), create JobRun, enqueue `resume-parse`
  3. Respond 202 { resumeId, jobRunId }

Worker: resume-parse processor            ── asynchronous
  4. Text extraction (deterministic):
       PDF  → unpdf (pdfjs-based) text extraction
       DOCX → mammoth → HTML → text
     Reject: empty/near-empty text (scanned image PDFs — clear user-facing error;
     OCR is out of scope for MVP), > 50k chars (truncation refused, error instead)
  5. Normalization: collapse whitespace, de-hyphenate line breaks,
     preserve bullet structure, strip headers/footers heuristically
  6. AI structuring: rawText → ResumeProfile via structured output
     (schema in §10). Model sees ONLY the resume text; prompt forbids inference
     of facts not present.
  7. Post-validation: every skill's evidence excerpts must appear verbatim
     (whitespace-normalized) in rawText — violations are dropped and logged.
  8. Persist: profile JSON + parseStatus = COMPLETE; audit log "resume.parsed"
     (model id, prompt version, token usage).
  Failure at any step → parseStatus = FAILED + JobRun.error (user-facing message
  distinguishes "bad file" from "try again later").
```

The **raw text is the source of truth** for evidence verification everywhere else in the system (suggestions, cover letters). The structured profile is a derived view used for matching and display; the UI shows the parsed profile next to the raw text and lets the user re-run parsing after replacing the file (new version).

---

## 9. Match-Score Algorithm

A **versioned pure function** (`MATCH_ALGORITHM_VERSION = 1`) in `src/server/matching/score.ts`:

```
matchScore(profile: ResumeProfile, analysis: JobAnalysis) → MatchBreakdown
```

No I/O, no randomness, no LLM. Same inputs ⇒ byte-identical output (unit-tested).

### Normalization

- Skills normalized: lowercase → trim punctuation → singular/plural fold → alias table (`skill-aliases.ts`: `js/javascript`, `ts/typescript`, `postgres/postgresql`, `k8s/kubernetes`, `react.js/react`, …). The alias table is data, reviewed and versioned with the algorithm.
- A required skill counts as **matched** if it appears in the profile's normalized skill list **or** as a token/phrase in any experience bullet or summary. Every match records its evidence: the resume excerpt(s) where it was found.

### Components and weights

| Component | Weight | Sub-score (0–1) |
|---|---|---|
| Must-have skills | 0.45 | matched must-haves / total must-haves |
| Nice-to-have skills | 0.20 | matched nice-to-haves / total nice-to-haves |
| Years of experience | 0.15 | `clamp(resumeYears / requiredYears, 0, 1)`; resumeYears = span of employment computed from experience dates (overlaps merged) |
| Seniority alignment | 0.10 | level distance table: exact = 1.0, one level apart = 0.5, otherwise 0 (levels: intern < junior < mid < senior < lead < principal) |
| Education | 0.10 | 1 if profile's highest level ≥ required level, else 0 |

```
score = round(100 × Σ (weightᵢ × subScoreᵢ) / Σ weightᵢ present)
```

Components the job doesn't specify (e.g. no education requirement, no years stated) are **excluded and weights renormalized** — a job that only lists skills is scored purely on skills.

### Output (`MatchBreakdown`, stored in `MatchResult.breakdown`)

```ts
{
  algorithmVersion: 1,
  score: 74,
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

The UI renders this as an explainable breakdown ("you're missing X, here's what matched and why"). Unmatched requirements are passed to the suggestions generator as focus areas — but suggestions may only *surface existing evidence*, never invent it.

---

## 10. AI Integration and Output Schemas

### Client

- `@anthropic-ai/sdk`, wrapped in `src/server/ai/client.ts`. **Only the worker calls it** (never web requests).
- Model: `claude-opus-4-8` by default, overridable via `AI_MODEL` env var. Recorded on every generated artifact (`model`, `promptVersion` columns).
- **All calls use structured outputs**: `client.messages.parse()` with `zodOutputFormat(Schema)` — the API constrains generation to the schema and the SDK validates the parse. `max_tokens: 16000`, non-streaming (outputs are small).
- Errors: typed SDK exception chain (`RateLimitError` → retry via BullMQ backoff; `BadRequestError` → fail the JobRun, no retry; `APIConnectionError`/5xx → retry). Token usage from `response.usage` is logged to the audit trail for cost visibility.
- Prompts live in `src/server/ai/prompts/*.ts`, each exporting the prompt text and a `PROMPT_VERSION` string; changing a prompt requires bumping the version.

### Schemas (in `src/contracts/ai`)

```ts
// 1. Job-description analysis
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
  keywords: z.array(z.string()),          // ATS-style keywords for display
});

// 2. Resume structuring
export const ResumeProfileSchema = z.object({
  fullName: z.string().nullable(),
  summary: z.string().nullable(),
  skills: z.array(z.object({
    name: z.string(),
    evidence: z.array(z.string()),        // verbatim excerpts from the resume text
  })),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string().nullable(),
    startDate: z.string().nullable(),     // "YYYY-MM" when stated, else null
    endDate: z.string().nullable(),       // null = present
    bullets: z.array(z.string()),         // verbatim from resume
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().nullable(),
    level: z.enum(["highschool","bachelors","masters","phd","other"]).nullable(),
    year: z.string().nullable(),
  })),
  certifications: z.array(z.string()),
});

// 3. Resume suggestions
export const SuggestionBatchSchema = z.object({
  suggestions: z.array(z.object({
    kind: z.enum(["REWRITE_BULLET","REWRITE_SUMMARY","REORDER_SECTION","EMPHASIZE_SKILL"]),
    targetSection: z.string(),            // stable path into the profile
    originalText: z.string().nullable(),
    suggestedText: z.string(),
    rationale: z.string(),                // ties to a specific job requirement
    basedOn: z.array(z.string()),         // verbatim resume excerpts justifying every claim
  })).max(10),
});

// 4. Cover letter
export const CoverLetterDraftSchema = z.object({
  salutation: z.string(),
  bodyParagraphs: z.array(z.string()).min(2).max(4),
  closing: z.string(),
  factsUsed: z.array(z.object({
    claim: z.string(),
    source: z.enum(["resume","job"]),
    excerpt: z.string(),                  // verbatim excerpt from the cited source
  })),
});
```

### Anti-fabrication enforcement (two independent layers)

1. **Prompt layer:** system prompts state that only facts present in the provided resume/job text may be used; suggestions rephrase, reorder, or emphasize — never add skills, employers, dates, metrics, or credentials.
2. **Verifier layer (`ai/evidence.ts`, deterministic):** after schema validation, every `evidence`/`basedOn`/`factsUsed.excerpt` string must occur in the corresponding source text (whitespace- and case-normalized substring match). Items that fail are **dropped**, the drop is audit-logged (`ai.evidence_rejected`), and if all items in a batch fail the JobRun fails with a user-visible message. The prompt layer is best-effort; the verifier is the guarantee.

---

## 11. Human-Approval Workflow

Approval is **structural**: the schema makes unapproved changes unrepresentable, not merely discouraged.

```
 AI generates suggestions (status: PENDING)
        │
        ▼
 Review UI: side-by-side original vs suggested, rationale, evidence excerpts
        │
   user decides per suggestion
        ├── REJECTED ──► terminal; audit "suggestion.rejected"
        └── APPROVED ──► audit "suggestion.approved"
                              │
                              ▼   user clicks "Apply approved suggestions"
                    New ResumeVersion (source: SUGGESTIONS_APPLIED) built by
                    applying approved diffs to the source version's profile;
                    suggestions → APPLIED, application re-pointed, match recomputed
```

Invariants (enforced in services + covered by tests):

1. A `ResumeVersion` with `source = SUGGESTIONS_APPLIED` can only be created from suggestions with `status = APPROVED`; the created version records which (`appliedInVersionId` back-references).
2. Suggestion decisions are one-way: `PENDING → APPROVED|REJECTED → (APPROVED →) APPLIED`. No un-apply; the user instead re-points the application to an older version (also audited).
3. Cover letters: the AI `draftText` is immutable; the user edits `editedText`; only an explicit `APPROVED` decision makes the letter usable (copy/download buttons render only for approved letters). Regeneration creates a new `CoverLetter` row rather than overwriting.
4. Kanban `READY` status requires an approved cover letter *or* an explicit user override (recorded in the audit log) — the system nudges toward completeness but the human decides.
5. Every decision writes an `AuditLog` row with actor `USER`; every generation writes one with actor `AI` (model, prompt version, token usage); every derived recomputation writes one with actor `SYSTEM`.

No feature in the MVP takes any action outside the app (no emails, no submissions), so "no external action without approval" is satisfied by having no external actions at all — this is asserted in the non-goals and should be re-checked at every code review that adds an integration.

---

## 12. Background-Job Design

### Queues (BullMQ on Redis)

| Queue | Payload (Zod-validated) | Producer | Consumer work |
|---|---|---|---|
| `resume-parse` | `{ jobRunId, userId, resumeVersionId }` | `POST /api/resumes` | extract text → structure → verify → persist |
| `job-analyze` | `{ jobRunId, userId, jobDescriptionId }` | `POST /api/jobs` | analyze JD → persist requirements |
| `suggestions` | `{ jobRunId, userId, applicationId }` | `POST /api/applications/:id/suggestions` | generate → verify evidence → persist PENDING suggestions |
| `cover-letter` | `{ jobRunId, userId, applicationId }` | `POST /api/applications/:id/cover-letter` | generate → verify facts → persist PENDING letter |

### Lifecycle and reliability

- **Enqueue is transactional-ish:** `enqueue.ts` creates the `JobRun` row first (with `idempotencyKey` = `{type}:{entityId}:{contentHash?}`), then adds the BullMQ job using the same key as the job id. A duplicate request returns the existing run instead of double-processing. If the Redis add fails after the row insert, the run stays QUEUED and a reconciliation sweep (worker startup + periodic) re-enqueues stale QUEUED runs.
- **Retries:** `attempts: 3`, exponential backoff (5s → 30s → 2m). Non-retryable failures (validation, bad file, AI `BadRequestError`) throw an `UnrecoverableError` so BullMQ fails immediately.
- **Status mirroring:** processor wraps work in a helper that transitions `JobRun` QUEUED→ACTIVE→COMPLETED/FAILED with timestamps and a sanitized `error` string (internal stack traces go to logs only).
- **Concurrency:** worker concurrency 5 per queue; per-user in-flight cap (max 3 active AI runs) enforced at enqueue time to bound cost and protect API rate limits.
- **Timeouts:** per-job timeout 120s (AI calls get an AbortController at 90s).
- **Observability:** structured logs (pino) with `jobRunId`/`userId` correlation ids; JobRun table doubles as the user-visible status API; failed runs are visible in the UI with a retry button (creates a new run).
- **Graceful shutdown:** worker traps SIGTERM, stops taking jobs, drains in-flight, then exits — required for clean deploys.

---

## 13. Security and Privacy

| Area | Measures |
|---|---|
| **Secrets** | All secrets via environment variables; `.env` git-ignored; `.env.example` documents every variable with placeholders. `src/lib/env.ts` (Zod) fails the boot if anything is missing/malformed. CI never echoes env values. Gitleaks step in CI as a guardrail. |
| **Input validation** | Zod at every boundary: HTTP bodies/queries/params, multipart metadata, queue payloads, AI responses, env. File uploads validated by size, extension, and magic bytes; files are stored with generated keys (never user-controlled paths) and served only through an authorized handler with `Content-Disposition: attachment`. |
| **Authorization** | §7: session-scoped queries at the service layer, userId never from client input, 404-not-403 to avoid existence leaks. |
| **Rate limiting** | Redis token buckets: global per-user API limit, stricter limits on upload and AI-triggering endpoints (e.g. 10 AI generations/hour/user). 429 with `Retry-After`. |
| **Injection resistance (prompt)** | Resume/JD text is untrusted input to prompts. It is delimited and the system prompt instructs the model to treat it as data; more importantly, outputs are schema-constrained and evidence-verified, so injected instructions cannot produce out-of-schema or fabricated results. AI never has tools or network access — text in, validated JSON out. |
| **XSS/CSRF** | React escaping (no `dangerouslySetInnerHTML` for user/AI content), `SameSite=Lax` cookies, Auth.js CSRF on auth flows. Security headers (CSP with nonce, `X-Content-Type-Options`, `Referrer-Policy`) via `next.config.ts`. |
| **PII & privacy** | Resumes are sensitive PII. Stored only for the owning user; no analytics beyond the user's own dashboard; logs contain ids, never resume text. Account deletion cascades everything (files included) — `DELETE /api/account`. Data export endpoint returns the user's data as JSON. AI provider calls send only the necessary text; provider data-retention posture is documented for users in the privacy note. |
| **Transport/infra** | HTTPS-only in production (HSTS), DB/Redis not exposed publicly (compose network / private networking), containers run as non-root, minimal base images. |
| **Auditability** | Append-only `AuditLog`; no update/delete paths for it in application code. |
| **Dependencies** | Dependabot + `npm audit` in CI; lockfile committed. |

---

## 14. Testing Strategy

### Layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure logic: match scoring, skill normalization/aliases, evidence verifier, status-transition rules, contract schemas, env validation | every push, < 30s |
| Integration | Vitest + real Postgres/Redis (docker-compose services in CI) | Services against a real DB: authorization scoping, version-chain invariants, enqueue idempotency, JobRun lifecycle; route handlers via `next-test-api-route` style invocation | every push |
| E2E | Playwright (Chromium) | Full user journeys against a running app + worker with **mocked AI** | every push (PR gate) |
| Static | ESLint, `tsc --noEmit`, Prettier check, Gitleaks | – | every push |

### Critical-logic test requirements (the "must-test" list)

1. **Match engine:** golden-fixture tests (resume/JD pairs → exact expected breakdowns); determinism test (1000 shuffled-input runs, identical output); weight-renormalization cases (missing components); alias-table cases; evidence excerpts always present for matched requirements.
2. **Evidence verifier:** accepts verbatim and whitespace-variant excerpts; rejects paraphrases and fabricated strings; batch-drop behavior.
3. **Approval invariants:** cannot apply a PENDING/REJECTED suggestion; applying approved suggestions creates exactly one new version and marks suggestions APPLIED; decision transitions are one-way.
4. **Authorization:** for every service, accessing another user's entity returns NotFound (parameterized test over all services).
5. **Status machine:** only legal Kanban transitions accepted; every transition writes a StatusEvent + AuditLog.
6. **Parsing:** fixture PDFs/DOCX (normal, multi-column, image-only, oversized, wrong-magic-bytes) produce expected text or expected typed errors.
7. **Contracts:** every route rejects malformed input with 400 and a structured error envelope.

### AI in tests

- Unit/integration/E2E use a **fake AI client** (the `AiClient` interface has a `FakeAiClient` returning fixture outputs), so tests are fast, free, and deterministic.
- A small **live smoke suite** (tagged `@live`, excluded from CI by default) exercises each prompt against the real API with one fixture each — run manually before releases and when bumping `PROMPT_VERSION` or `AI_MODEL`.

### E2E scenarios (Playwright)

Auth via a test-only credentials provider enabled when `E2E_TEST_MODE=1` (Google OAuth can't run headlessly in CI):
1. Sign in → upload resume → see parsed profile.
2. Paste JD → see analysis → create application → see match breakdown with evidence.
3. Generate suggestions → reject one, approve one → apply → new version + updated score.
4. Generate cover letter → edit → approve → copy/download available.
5. Drag application across Kanban columns (mouse + keyboard) → dashboard reflects counts.
6. Accessibility pass: `@axe-core/playwright` on each main page, zero critical violations.

### CI (GitHub Actions)

`lint+typecheck` → `unit` → `integration` (Postgres/Redis service containers, `prisma migrate deploy`) → `build` → `e2e` (compose up web+worker with fake AI) → docker image build. Migration drift check (`prisma migrate diff`) on every PR. All jobs required to merge to `main`.

---

## 15. Deployment Architecture

### Target: single-host Docker Compose (portfolio-appropriate), cloud-portable

```
                    ┌──────────────────────────────────────────┐
   GitHub Actions   │  Host (Hetzner/Fly.io/Railway/any VM)    │
   ─ build images ─►│  ┌────────┐  ┌────────┐  ┌────────────┐  │
   ─ run migrations │  │ Caddy  │─►│  web   │  │   worker   │  │
   ─ deploy         │  │ (TLS)  │  │ Next.js│  │  (BullMQ)  │  │
                    │  └────────┘  └───┬────┘  └─────┬──────┘  │
                    │                  │             │         │
                    │        ┌─────────▼─────┐  ┌────▼─────┐   │
                    │        │  PostgreSQL   │  │  Redis   │   │
                    │        │  (volume)     │  │ (volume) │   │
                    │        └───────────────┘  └──────────┘   │
                    │        files volume (resume uploads)     │
                    └──────────────────────────────────────────┘
```

- **Images:** two Dockerfiles (web: standalone Next.js output; worker: node + compiled worker entry), multi-stage builds, non-root user, pinned base image.
- **Migrations:** `prisma migrate deploy` runs as a dedicated step before the new containers start (deploy script / release phase), never at container boot race.
- **Config:** all env via the host's secret store / `.env` on the server (never in images or repo).
- **Backups:** nightly `pg_dump` to object storage; files volume rsynced alongside.
- **Health/monitoring:** `/api/health` (DB+Redis ping) wired to the platform's health checks; pino logs shipped as JSON; error tracking via Sentry (DSN optional env).
- **Alternative split deployment** (documented, not default): Vercel for web + managed Postgres (Neon) + managed Redis (Upstash) + worker on Fly/Railway. The codebase requires nothing platform-specific either way; the only constraint is that web and worker share `DATABASE_URL`/`REDIS_URL`.

---

## 16. Milestones and Acceptance Criteria

Each milestone is a shippable increment merged to `main` behind green CI. Order is dependency-driven; estimates assume one engineer.

---

### M0 — Foundation & Walking Skeleton

**Scope:** Next.js App Router scaffold (TypeScript `strict`, `noUncheckedIndexedAccess`); Tailwind + shadcn/ui; Prisma + initial migration (User only); Redis client; `env.ts` validation; pino logger; error taxonomy + API error envelope; `/api/health`; docker-compose (web, worker-stub, postgres, redis); GitHub Actions CI (lint, typecheck, unit, build); Prettier/ESLint config; `.env.example`.

**Acceptance criteria:**
- [ ] `docker compose up` starts web, postgres, redis; `GET /api/health` returns 200 with DB+Redis status.
- [ ] `npm run lint && npm run typecheck && npm run test` all pass locally and in CI; CI is a required check.
- [ ] A missing required env var fails startup with a message naming the variable.
- [ ] Throwing a typed `AppError` in a sample route returns the standard error envelope with the mapped status code.
- [ ] No secrets in the repo (gitleaks CI step passes).

---

### M1 — Google Authentication

**Scope:** Auth.js with Google provider + Prisma adapter (Account/Session models + migration); sign-in page; authenticated `(app)` layout with redirect; `requireUser()` helper; sign-out; test-only credentials provider gated by `E2E_TEST_MODE`.

**Acceptance criteria:**
- [ ] A new user can sign in with Google and lands on an (empty) dashboard; User row is created once and reused on re-login.
- [ ] Unauthenticated access to any `(app)` page redirects to sign-in; unauthenticated API calls return 401 with the error envelope.
- [ ] Session cookie is `HttpOnly`, `Secure` (prod), `SameSite=Lax`; sign-out invalidates the DB session (back button shows no data).
- [ ] E2E: sign-in via test provider → dashboard, and 401 checks, pass in CI.

---

### M2 — Resume Upload, Parsing Pipeline & Job Infrastructure

**Scope:** StoredFile/Resume/ResumeVersion/JobRun/AuditLog models + migrations; FileStore (local driver); upload endpoint with validation (size/type/magic bytes); BullMQ setup (queues, enqueue helper with idempotency, worker process, JobRun lifecycle wrapper, graceful shutdown); pdf/docx text extraction + normalization; AI client wrapper + `FakeAiClient`; resume structuring prompt + `ResumeProfileSchema` + evidence verifier; resumes UI (upload, list, detail with status polling, raw text + parsed profile view); `GET /api/runs/:id`; audit-service with first events.

**Acceptance criteria:**
- [ ] Uploading a valid PDF/DOCX returns 202 and, within the poll loop, ends with `parseStatus = COMPLETE` and a rendered structured profile.
- [ ] Rejected inputs (>10 MB, wrong type, spoofed extension, image-only PDF) produce typed, user-readable errors; nothing is left half-created.
- [ ] Duplicate submit of the same upload does not create a second JobRun (idempotency test).
- [ ] Worker retries transient failures (3 attempts, backoff) and marks JobRun FAILED with a sanitized message on exhaustion; UI shows failure + retry.
- [ ] Every skill in a stored profile has evidence excerpts that appear verbatim in the raw text (verifier integration test); fabricated-evidence fixture is dropped and audit-logged.
- [ ] Audit log contains `resume.uploaded` and `resume.parsed` entries with model/prompt metadata.
- [ ] Another user's resume/file/run returns 404 (authorization tests).

---

### M3 — Job-Description Analysis

**Scope:** JobDescription/JobAnalysis models + migrations; paste-JD form and jobs list/detail UI; `job-analyze` queue + processor; job analysis prompt + `JobAnalysisSchema`; requirements display (skills chips, seniority, years, education, responsibilities).

**Acceptance criteria:**
- [ ] Pasting a JD (fixture) yields a COMPLETE analysis whose JSON validates against `JobAnalysisSchema`; UI renders must-have vs nice-to-have distinctly.
- [ ] Empty/too-long (>20k chars) input rejected with clear messages.
- [ ] Analysis failures surface with retry; re-running analysis overwrites the previous requirements (single JobAnalysis per JD) and is audit-logged.
- [ ] Model id + prompt version stored on the analysis row.

---

### M4 — Deterministic Matching & Applications

**Scope:** Application/MatchResult/ApplicationStatusEvent models + migrations; matching engine (`score.ts`, normalization, alias table) with golden-fixture unit tests; application creation flow ("pair this resume version with this job"); match breakdown UI (score, per-component bars, matched/unmatched requirements with evidence excerpts).

**Acceptance criteria:**
- [ ] Creating an application computes and stores a MatchResult synchronously; the detail page shows score + full breakdown with evidence.
- [ ] Determinism test passes (repeated/shuffled inputs → identical output); golden fixtures pass; weight renormalization cases pass.
- [ ] Unmatched must-haves are listed explicitly ("missing: kubernetes").
- [ ] `algorithmVersion` recorded; recomputation only occurs on explicit triggers (version change), never silently.
- [ ] Unit-test coverage for `src/server/matching/**` ≥ 95% lines.

---

### M5 — AI Suggestions with Human Approval

**Scope:** Suggestion model + migration; `suggestions` queue + processor (prompt receives profile, analysis, and unmatched requirements); evidence verification on `basedOn`; review UI (original vs suggested diff, rationale, evidence, approve/reject per item); apply-approved flow → new ResumeVersion → re-point application → recompute match; audit events for every decision.

**Acceptance criteria:**
- [ ] Generated suggestions are all PENDING and each displays rationale + evidence excerpts traceable to the resume.
- [ ] A suggestion whose `basedOn` is not verbatim-present in the resume never reaches the DB (verifier test), and the drop is audit-logged.
- [ ] Approve/reject persists immediately; decisions are immutable (second decision returns 409).
- [ ] "Apply approved" creates exactly one new ResumeVersion, marks those suggestions APPLIED, re-points the application, recomputes the match, and audit-logs each step; PENDING/REJECTED suggestions are untouched.
- [ ] With zero approved suggestions the apply action is disabled/400.
- [ ] E2E: generate → reject one → approve one → apply → new version visible and score updated.

---

### M6 — Cover-Letter Generation with Approval

**Scope:** CoverLetter model + migration; `cover-letter` queue + processor; prompt using approved resume version + job analysis; `factsUsed` verification; letter UI (draft view, edit box, approve/reject, regenerate-as-new-row, copy + download `.md`/`.txt` for approved letters only).

**Acceptance criteria:**
- [ ] Generated draft validates against `CoverLetterDraftSchema`; every `factsUsed.excerpt` verifies against its source (resume or JD) or the run fails visibly.
- [ ] Draft text is immutable; edits save to `editedText`; approval freezes the letter (further edits 409).
- [ ] Copy/download only available for APPROVED letters; regeneration creates a new row, never overwrites.
- [ ] All generations and decisions audit-logged with model/prompt metadata.
- [ ] E2E: generate → edit → approve → download.

---

### M7 — Application Kanban Tracker

**Scope:** Board UI (columns per `ApplicationStatus`, cards with company/title/score); drag-and-drop (dnd-kit) + fractional `boardOrder`; keyboard-accessible move menu on each card (a11y parity with drag); status-transition validation (legal moves only, e.g. can't jump SAVED→OFFER); StatusEvent recording; notes + appliedAt editing on cards; READY gating per §11 invariant 4.

**Acceptance criteria:**
- [ ] Applications appear in the correct column; drag between columns and reorder within a column persist across reload.
- [ ] Every status change writes an ApplicationStatusEvent and AuditLog entry; illegal transitions rejected with 400 and revert optimistic UI.
- [ ] Moving to READY without an approved cover letter prompts for explicit override; the override is audit-logged.
- [ ] Full keyboard operability: a card can be selected and moved between columns without a pointer; axe scan of the board has zero critical violations.
- [ ] E2E: create → move through SAVED→PREPARING→READY(override)→APPLIED with reload persistence.

---

### M8 — Dashboard Analytics

**Scope:** `dashboard-service` aggregates (single grouped queries, no N+1): totals by status, applications/week (8 weeks), average + distribution of match scores, funnel (Saved→Applied→Interview→Offer conversion), recent activity feed from AuditLog; dashboard UI with accessible charts (values available as text/table, not color-only).

**Acceptance criteria:**
- [ ] Dashboard numbers reconcile exactly with board contents (integration test seeds data and asserts equality).
- [ ] New user sees a proper empty state with CTAs, not zeros/errors.
- [ ] Aggregates computed in the DB (query-count assertion in test); page P95 < 500ms with 1k seeded applications.
- [ ] Charts have text alternatives; axe scan passes.

---

### M9 — Hardening, Observability & Production Deployment

**Scope:** Rate limiting (global + AI endpoints); per-user AI concurrency cap; security headers/CSP; account export + deletion; audit-log viewer page; Sentry hookup; seed script + demo fixtures; production Dockerfiles + compose.prod + Caddy TLS; deploy workflow (build → migrate → deploy) to the chosen host; backup script; README rewritten to match the shipped product (removing unbuilt claims); `docs/` runbook (env vars, deploy, restore).

**Acceptance criteria:**
- [ ] Exceeding rate limits returns 429 with `Retry-After`; AI endpoints capped at documented limits; 4th concurrent AI run is queued/rejected per design.
- [ ] Account deletion removes all rows and stored files for the user (integration test proves zero residue); export returns valid JSON of all user data.
- [ ] Production deploy from a tagged release via GitHub Actions succeeds; app served over HTTPS with security headers (verified by automated check); migrations applied before rollout.
- [ ] Backup script produces a restorable dump (restore rehearsal documented and performed once).
- [ ] `@live` AI smoke suite passes against the production model config.
- [ ] README accurately describes only shipped functionality; all MVP acceptance criteria M0–M8 remain green on `main`.

---

### Milestone dependency graph

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► M6 ──► M7 ──► M8 ──► M9
              │                     ▲
              └── job infra reused ─┘  (M3–M6 all consume M2's queue/AI/audit foundations)
```

---

## 17. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **PDF text extraction quality** (multi-column layouts, image-only scans) | High | Parsing garbage poisons everything downstream | Curate a fixture corpus early (M2); show raw text next to the parsed profile so users can catch problems; explicit "this looks like a scanned image" error; OCR deferred, documented. |
| **AI fabrication despite prompts** | Medium | Violates the core "truthful" promise | The deterministic evidence verifier is the guarantee, not the prompt; fabrications are dropped and logged; `@live` smoke suite watches for regression when prompts/models change. |
| **AI cost/latency surprises** | Medium | Worker backlog, spend | Per-user rate + concurrency caps, token usage logged per run, fake client everywhere in tests, model configurable by env. |
| **Match-score credibility** ("why 74?") | Medium | Users distrust an opaque number | Full breakdown UI with per-requirement evidence; documented, versioned algorithm; conservative claims (our heuristic, not "ATS score"). |
| **Scope creep toward auto-apply/scraping** | Medium | Legal/ToS exposure, safety regression | Non-goals are explicit in this plan and enforced at review; the architecture has no outbound-action pathway to extend "accidentally". |
| **Schema churn once real data flows** | Medium | Migration pain | JSON payloads owned by Zod schemas (cheap to evolve), relational skeleton kept minimal and stable; prompt/algorithm versioning decouples regeneration from schema. |
| **Auth.js v5 / Next.js version drift** | Low | Build breakage | Pin versions, lockfile in CI, Dependabot with CI gate. |
| **Single-host deployment failure** | Low | Downtime (portfolio impact) | Nightly backups + rehearsed restore; stateless web/worker make re-provisioning fast; health checks + Sentry alerts. |

---

*End of plan. The first implementation milestone is **M0 — Foundation & Walking Skeleton**; no application code should be written except in service of M0's acceptance criteria.*
