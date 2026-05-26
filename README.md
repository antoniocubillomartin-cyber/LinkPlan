# LINK & PLAN (Full-Stack)

Production-ready full-stack implementation of LINK & PLAN with:
- **Frontend:** Next.js + React + Tailwind
- **Backend:** Node.js + Express REST API
- **Database:** PostgreSQL + Prisma ORM
- **DevOps:** Docker + GitHub Actions CI + Vercel/Render deployment support

## Project Structure

- `/frontend` - Next.js app (users, smart plan generator, reservations, admin data panel)
- `/backend` - Express API, Prisma schema/migrations, plan generation service, seed data
- `docker-compose.yml` - local full-stack startup with PostgreSQL
- `.github/workflows/ci.yml` - lint/test/build/deploy validation pipeline

## Environment Variables

Copy `.env.example` to your local env files and configure values.

Backend:
- `DATABASE_URL`
- `PGPASSWORD`
- `PORT`
- `FRONTEND_URL`

Frontend:
- `NEXT_PUBLIC_API_BASE_URL`

## Local Setup

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm --prefix backend run prisma:seed
npm --prefix backend run dev
npm --prefix frontend run dev
```

Frontend runs at `http://localhost:3000`, API at `http://localhost:4000`.

## Docker Setup

```bash
docker compose up --build
```

## Deployment

### Frontend (Vercel)
- Deploy `/frontend`
- Set `NEXT_PUBLIC_API_BASE_URL` to deployed API URL

### Backend (Render / Railway / Fly.io compatible)
- Deploy `/backend` with Node runtime
- Provision PostgreSQL and set `DATABASE_URL`
- Run migrations: `npm run prisma:migrate`
- Seed optional initial data: `npm run prisma:seed`

## API Coverage

- `GET/POST/DELETE /api/users`
- `POST /api/plans/generate`
- `GET/POST /api/reservations`
- `GET /api/admin/data`
- `GET /api/venues`
