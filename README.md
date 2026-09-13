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
apps/
  flutter/     Flutter client
  api/         NestJS API server (/api/v1)
  worker/      NestJS background worker (BullMQ)
packages/
  api_contracts/  Shared REST DTO / contract types
  shared_types/   Cross-language-shape type definitions
  config/         Shared configuration schema
database/
  migrations/     Prisma migrations
  seeds/          Standard reference data (COA, tax, UoM, roles)
  fixtures/       Demo-tenant fixtures
infrastructure/
  docker/         Dockerfiles + docker-compose
docs/
  architecture/   ADRs and conventions
.github/workflows CI
```

## Local development

Prerequisites:

- Node.js >= 20
- Flutter (stable)
- Docker (for PostgreSQL + Redis) — replaces local DB installation

Start the stack:

```bash
npm install
npm run gen:prisma
npm run db:migrate
npm run dev:api
```

The API listens on `http://localhost:3000` with OpenAPI docs at `/api/docs`.
See `infrastructure/docker/README.md` for the containerised environment.
