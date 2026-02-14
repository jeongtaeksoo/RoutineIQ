## RutineIQ

RutineIQ helps users log a day quickly, analyze behavior with AI, and generate a realistic routine for tomorrow.

### Stack
- Web: Next.js 14 (`apps/web`)
- API: FastAPI (`apps/api`)
- DB/Auth: Supabase (`supabase/schema.sql`)
- Billing: Stripe (optional)

### Repository Layout
- `apps/web`: frontend (App Router)
- `apps/api`: backend API
- `supabase`: schema and SQL patches
- `docs`: architecture and product/design references

### Local Development
1. API
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

2. Web
```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

### Core Endpoints
- `GET /health`
- `POST /api/logs`
- `GET /api/logs?date=YYYY-MM-DD`
- `POST /api/analyze`
- `GET /api/reports?date=YYYY-MM-DD`

### Deployment
- Web: Vercel (connected to GitHub; push to `main` triggers deploy)
- API: Render

### Key Docs
- `docs/ARCHITECTURE.md`
- `docs/IA.md`
- `docs/DB_DESIGN.md`
- `RELEASE_CHECKLIST.md`
