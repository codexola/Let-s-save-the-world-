# Let's save the world —

MedCare — integrated healthcare platform. All core modules work out of the box with local mocks. Add API keys in `.env` to connect real external services.

## Quick start

```bash
npm install
cp .env.example .env
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Open http://localhost:3200

## Platform modules (complete)

| Module | Route |
|--------|-------|
| Homepage | `/` |
| Authentication / Registration | `/login`, `/register` |
| Search | `/search` |
| AI Medical Consultant | `/ai-consultant` |
| Marketplace | `/marketplace` |
| Telemedicine | `/telemedicine` |
| Appointments | `/appointments` |
| Pharmacy | `/pharmacy` |
| Hospital Dashboard | `/hospital` |
| Corporate Dashboard | `/corporate` |
| Medical Blog | `/blog` |
| Community | `/community` |
| Reviews | `/reviews` |
| Chat | `/messages` (`/chat` redirects) |
| Billing | `/billing` |
| Notifications | `/notifications` |
| Admin | `/admin` |
| Analytics | `/analytics` |
| Developer | `/developer` |

## External connections (optional)

Copy `.env.example` → `.env` and fill only what you need. Leave blank to keep demo mocks.

| Service | Env vars | Effect when set |
|---------|----------|-----------------|
| OpenAI | `OPENAI_API_KEY` | Real AI triage instead of keyword rules |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Live checkout (mock pay if empty) |
| Daily.co | `DAILY_API_KEY` | Real video rooms (`VIDEO_PROVIDER=daily`) |
| Agora | `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | Alternative video |
| SMTP | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Real email (+ inbox always) |
| Twilio | `TWILIO_*` | SMS (reserved) |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enables Google button |
| Apple / Microsoft / LINE | see `.env.example` | Enables provider buttons |
| S3 | `S3_*` | Object storage (URL upload still works) |

Check live status: `GET /api/integrations`

**Do not commit production secrets.** Rotate any keys before go-live.

## Demo accounts

| Email | Password | Role |
|-------|----------|------|
| patient@medcare.local | Patient!2026 | Patient |
| doctor@medcare.local | Doctor!2026 | Doctor |
| nurse@medcare.local | Nurse!2026 | Nurse |
| hospital@medcare.local | Hospital!2026 | Hospital |
| pharmacy@medcare.local | Pharmacy!2026 | Pharmacy |
| company@medcare.local | Company!2026 | Company |
| admin@medcare.local | MedCare!2026 | Admin |
| developer@medcare.local | MedCare!2026 | Developer |

## Deploy

GitHub: https://github.com/codexola/Let-s-save-the-world-

```bash
npx vercel --prod
```

Set `JWT_SECRET` (and any integration keys) in the Vercel project environment.
