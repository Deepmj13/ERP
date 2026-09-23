# ERP

Multi-tenant SaaS ERP — one shared product across Web, desktop (Win/macOS/Linux) and mobile (Android/iOS).

## Stack

| Layer         | Technology                    |
| ------------- | ----------------------------- |
| Frontend      | Flutter (Riverpod, go_router) |
| Backend       | NestJS + TypeScript           |
| Database      | PostgreSQL (Prisma ORM)       |
| Cache / Queue | Redis (BullMQ)                |
| Files         | S3-compatible object storage  |
| Infra         | Docker, GitHub Actions        |

Architecture decisions and the authoritative implementation plan live in:

- `ERP_Implementation_Plan_V1.md` — original plan (unchanged baseline)
- `ERP_Implementation_Plan_V2.md` — revised plan (active source of truth)

## Repository structure

```text
backend/         Self-contained NestJS backend (API + worker + Prisma)
  src/main.ts        API entry
  src/worker/        BullMQ background worker (PDF, email, notifications)
  prisma/            Schema, migrations, seed
  Dockerfile         Build for Render / any Node 20 host
  docker-compose.yml Local PostgreSQL + Redis
apps/
  flutter/       Flutter client
docs/
  architecture/  ADRs and conventions
.github/workflows CI
```

## Local development — backend

Prerequisites:

- Node.js >= 20
- Docker (for PostgreSQL + Redis) — or point `DATABASE_URL` at an existing DB

```bash
docker compose -f backend/docker-compose.yml up -d
cd backend
cp .env.example .env        # then edit secrets
npm install
npm run db:migrate:deploy   # apply migrations
npm run db:seed             # optional: permissions + demo tenant
npm run start:dev           # API on http://localhost:3000 (docs at /api/v1/docs)
```

Run the background worker (PDF/email jobs) in a second terminal:

```bash
cd backend
npm run start:dev:worker
```

> **Redis is optional for the API.** The API boots and serves routes even with no
> Redis running (it logs a single `redis unreachable` warning); enqueueing
> endpoints return a fast `503 Job queue unavailable` instead of hanging. The
> worker, however, genuinely requires Redis to receive scheduled/queue jobs.

Unit tests: `npm test` — e2e suite: `npm run test:e2e`.

## Deployment (Render)

You can deploy the backend directory directly to Render:

1. Push the repo to GitHub.
2. In Render create a **Web Service** from the repo, set **Root Directory = `backend`**, build
   `npm ci && npm run gen:prisma && npm run build`, start `node dist/main.js`.
   (A `Dockerfile` is also included if you prefer a Docker runtime.)
3. Add the env vars from `backend/.env.example` (DATABASE_URL, DIRECT_URL, REDIS_URL, JWT secrets…).
4. Optionally add the worker as a separate service: build `npm ci && npm run gen:prisma && npm run build`,
   start `node dist/worker/main.js`.
