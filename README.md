# Let's save the world —

MedCare integrated healthcare platform (patients, doctors, nurses, hospitals, companies).

## Setup

```bash
npm install
cp .env.example .env
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Open http://localhost:3200

## Demo accounts

| Email | Password | Role |
|-------|----------|------|
| developer@medcare.local | MedCare!2026 | Developer |
| admin@medcare.local | MedCare!2026 | Admin |
| patient@medcare.local | Patient!2026 | Patient |
| doctor@medcare.local | Doctor!2026 | Doctor |
| nurse@medcare.local | Nurse!2026 | Nurse |
| hospital@medcare.local | Hospital!2026 | Hospital |
| company@medcare.local | Company!2026 | Company |

## Highlights

- Public homepage: features, evaluations, top providers, popular blogs with viewer avatars
- Role-specific homes after login; language settings on each home
- Profiles with photos; mutual reviews
- Blogs require a cover photo; views archived; evaluation replies
- Support inquiries for admin/developer contact; chat after mutual agreement

## Deploy

GitHub: https://github.com/codexola/Let-s-save-the-world-

Vercel: set `JWT_SECRET` and `DATABASE_URL=file:./prisma/seed-data.db` (runtime copies to `/tmp` on Vercel).
