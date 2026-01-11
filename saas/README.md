# Synthetic Friends GTM SaaS (Backend)

This folder is the SaaS-grade backend foundation for the GTM pipeline:
- Multi-tenant orgs and users
- HubSpot + Gmail OAuth integrations
- Encrypted token storage in Postgres
- Base endpoints for auth, integrations, and pipelines

## Stack
- Fastify (high throughput, low overhead)
- Postgres + Prisma
- JWT auth (placeholder, swap to Auth.js/Clerk later if desired)
- AES-256-GCM encryption for credentials

## Quick Start
```bash
cd saas
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Core Endpoints
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/me`
- `GET /v1/integrations`
- `POST /v1/integrations/:type/oauth/start`
- `GET /v1/integrations/:type/oauth/callback`
- `POST /v1/integrations/:type/oauth/refresh`

## Security Notes
- Set `ENCRYPTION_KEY` to a base64-encoded 32-byte key.
- OAuth tokens are encrypted at rest in `IntegrationToken`.
- Rotate JWT and encryption keys on schedule.

## Next Steps
- Add GTM pipeline jobs (company sourcing, enrichment, scoring).
- Add email draft/approval queue and Gmail sending.
- Add webhook ingestion for email opens/clicks.
- Add the multi-tenant dashboard front-end.
