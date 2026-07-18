# MedCare Technical Architecture

## Current shape: modular monolith

MedCare ships as a **single Next.js 15 (App Router) application** with clear **service-module boundaries** under `src/services/*` and domain logic in `src/lib/*`. HTTP edges are thin route handlers in `src/app/api/*`.

This is intentional for velocity and Vercel deploy simplicity while remaining **extractable** into microservices when scale demands it.

```
┌──────────────────────────────────────────────────────────┐
│  Clients                                                  │
│  Web: Next.js + React + Tailwind                          │
│  Mobile: API-ready (Flutter / React Native recommended)   │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS / TLS (edge)
┌───────────────────────────▼──────────────────────────────┐
│  Edge middleware — JWT session, rate limit, security HDR │
└───────────────────────────┬──────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Auth Service        Clinical Services    AI Services
   User Service        Appointment          Triage / Recommend
   Admin / GRC         Pharmacy / Rx        Summarize / Translate
   Privacy             Telemedicine / Chat  Interactions / No-show
   Notification        Search / Blog        Ops forecast
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              Data layer (see roadmap)
```

## Frontend

| Item | Choice |
|------|--------|
| Web | Next.js 15 + React 19 |
| Styling | Tailwind CSS 4 + shared components (`src/components`) |
| Mobile | Not in-repo; consume same REST `/api/*` from Flutter or React Native |

## Backend service map (logical)

| Service | Module / routes |
|---------|-----------------|
| Authentication | `src/services/auth`, `/api/auth`, 2FA, WebAuthn, OAuth |
| User | `src/services/users`, `/api/profile`, `/api/admin/users` |
| Doctor / Hospital / Pharmacy | Role homes + profile APIs |
| Search | `src/lib/search-engine.ts`, `/api/search` |
| AI Recommendation | `src/lib/recommend.ts`, `/api/recommend` |
| Appointment | `/api/appointments`, `src/lib/ai-advanced` optimize/no-show |
| Chat | `/api/messages`, AES-256-GCM |
| Telemedicine | `/api/telemedicine` |
| Prescription / Marketplace | `/api/pharmacy`, `/api/marketplace` |
| Payment / Subscription | `/api/billing`, `/api/subscriptions` |
| Notification | `src/lib/notify.ts`, `/api/notifications`, cron |
| Blog / Knowledge | `/api/blogs`, `/api/knowledge` |
| Analytics | `/api/analytics` |
| Admin / GRC / Privacy | `/api/admin`, `/api/grc`, `/api/privacy` |

## Data layer — today vs target

| Concern | Today (demo) | Production target |
|---------|--------------|-------------------|
| Transactional DB | SQLite (Prisma) | **PostgreSQL** |
| Cache / sessions | In-memory rate limit | **Redis** |
| Search | In-process Prisma scoring | **OpenSearch / Elasticsearch** |
| Objects | URL fields + optional S3 config | **S3-compatible** object storage |
| Async jobs | Vercel cron (reminders, retention) | **Kafka / RabbitMQ** + workers |

Local optional stack: see `docker-compose.yml` (Postgres + Redis).

## Security & compliance hooks

- TLS at edge; HSTS in production middleware
- AES-256-GCM for chat + field helpers
- RBAC permissions; MFA
- Audit logs + PHI access logs
- Consent, retention, export, erasure (`/privacy`, `/grc`)

## Extraction path to microservices

1. Keep Prisma models as the contract; wrap each `src/services/*` behind HTTP.
2. Move read-heavy search to OpenSearch indexer consuming domain events.
3. Introduce Redis for sessions and rate limits (replace Map).
4. Publish appointment/notification events to Kafka; workers send SMS/push.
5. Split auth into its own service last (hardest shared concern).

## Disclaimer

Virtual triage and other AI tools **do not replace a licensed physician**.
