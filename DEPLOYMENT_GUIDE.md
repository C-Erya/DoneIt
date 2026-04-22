# Deployment Guide

This project is now prepared for a split deployment:

- Frontend: Vercel
- Backend: Railway
- Database: Supabase Postgres

## 1. Backend Environment Variables

Set these in Railway:

```bash
PORT=3001
DATABASE_URL=your-supabase-pooling-url
DIRECT_URL=your-supabase-direct-url
OPENAI_API_KEY=your-openai-or-compatible-key
OPENAI_MODEL=deepseek-ai/DeepSeek-V3.2
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
AUTH_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGIN=https://your-frontend-domain.vercel.app
ALLOW_DEMO_AUTH_FALLBACK=false
DEMO_USER_EMAIL=demo@task-web.local
DEMO_USER_PASSWORD_HASH=local-demo-no-login
DEMO_USER_NICKNAME=Demo User
```

Notes:
- `CLIENT_ORIGIN` can contain multiple origins separated by commas.
- In production, set `ALLOW_DEMO_AUTH_FALLBACK=false`.
- Keep `AUTH_SECRET` long and random.

## 2. Railway Deployment

This repo includes `railway.json`, so Railway can use:

```bash
npm run start --workspace server
```

Recommended build flow in Railway:

```bash
npm install
npm run build --workspace server
```

If you need to push schema updates:

```bash
npm run db:push --workspace server
```

## 3. Frontend Environment Variables

Set this in Vercel:

```bash
VITE_API_BASE_URL=https://your-backend-domain.up.railway.app
```

This repo includes `vercel.json`, configured to:
- install root dependencies
- build the client workspace
- serve `client/dist`
- rewrite all routes to `index.html`

## 4. Vercel Deployment

Recommended Vercel settings:
- Root Directory: `.`
- Framework Preset: `Other`
- Build Command: provided by `vercel.json`
- Output Directory: provided by `vercel.json`

## 5. First Production Checklist

- Confirm Railway backend can reach Supabase.
- Confirm Vercel frontend uses the Railway API domain.
- Confirm `CLIENT_ORIGIN` matches the deployed frontend domain exactly.
- Confirm auth register/login works with `ALLOW_DEMO_AUTH_FALLBACK=false`.
- Confirm `GET /api/health` is reachable.
- Confirm one new user can register and sees empty personal data.

## 6. Optional Migration

If you still need to move local JSON data into Supabase:

```bash
npm run db:migrate:json --workspace server
```

Run that only once against the target production database you actually want to seed.
