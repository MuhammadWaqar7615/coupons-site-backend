# CodiceSconto Unified Backend

Standalone unified backend API application for the CodiceSconto platform, combining the public consumer portal APIs and the admin CMS services into a single, high-performance service.

---

## 1. Quick Start

### Prerequisites
- **Node.js**: v22+ (verified on Node v25.8.2; `.nvmrc` pinned to 22)
- **Database**: PostgreSQL 15+ (hosted on Supabase)
- **Storage**: Supabase Storage buckets (`store-images`, `coupon-banners`)

### Setup & Run
```bash
# 1. Navigate to backend
cd codice-sconto-backend

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your actual DATABASE_URL, DIRECT_URL, SESSION_SECRET, and SUPABASE credentials

# 3. Install dependencies
npm install

# 4. Generate Prisma Client
npx prisma generate

# 5. Start development server on PORT 4000
npm run dev
```

The backend starts on `http://localhost:4000` (configured via `PORT=4000`).

---

## 2. Environment Variables

| Variable | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `4000` | HTTP port for the Next.js server |
| `DATABASE_URL` | **Yes** | `postgresql://...@...pooler.supabase.com:6543/postgres?pgbouncer=true` | Pooled connection string for queries |
| `DIRECT_URL` | **Yes** | `postgresql://...@...supabase.com:5432/postgres` | Direct connection for Prisma migrations |
| `SESSION_SECRET` | **Yes** | Strong 32+ character random secret | Signs & verifies HS256 auth tokens |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | `https://your-project.supabase.co` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | `eyJhbGciOi...` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | `eyJhbGciOi...` | Supabase service key (for administrative operations) |
| `COOKIE_DOMAIN` | No | `localhost` or `.codicesconto.com` | Domain for cross-subdomain auth cookies |
| `CORS_ORIGIN` | No | `http://localhost:3000,http://localhost:3001` | Allowed CORS origins for frontend clients |

---

## 3. Architecture & Key Modules

```
codice-sconto-backend/
├── middleware.js                 # Edge CORS preflight & header reflection
├── run_full_smoke_test.sh        # Automated end-to-end runtime smoke & regression test suite
├── prisma/
│   └── schema.prisma             # Byte-for-byte canonical schema (20 models, 4 enums)
├── migration-scripts/            # Database ETL & migration tooling
└── src/
    ├── app/
    │   ├── api/                  # 39 API route endpoints
    │   ├── robots.txt/route.js   # Dynamic text/plain crawler rules
    │   ├── sitemap.xml/route.js  # Dynamic application/xml sitemap
    │   ├── layout.js             # Root HTML layout
    │   └── page.js               # Service status landing JSON
    ├── config/
    │   └── auth.js               # AUTH_TOKEN_STORAGE_KEY ("erp tokkenn")
    └── lib/
        ├── api-errors.js         # Standardized auth error mapping
        ├── auth/                 # Session (jose HS256), roles, password (scrypt), guards
        ├── emailTemplates.js     # Default email template definitions
        ├── env.js                # Fail-fast environment variable validation
        ├── prisma.js             # PrismaClient singleton instance
        ├── serializer.js         # Centralized MongoDB compatibility shims & password stripping
        ├── supabase.js           # Supabase client singleton & storage deletion helper
        └── translations.js       # Default translation catalog
```

---

## 4. Health Check & Diagnostics

- **Root Status**: `GET http://localhost:4000/` returns `{ status: "healthy", service: "codice-sconto-backend" }`
- **Shallow Ping**: `GET http://localhost:4000/api/health` performs a fast `prisma.$queryRaw\`SELECT 1\`` database check (200 OK).
- **Deep Probe**: `GET http://localhost:4000/api/health?deep=1` tests database query response time and Supabase storage bucket availability. Returns `200` if operational, `503` if degraded.

---

## 5. End-to-End Testing

To run the automated runtime test suite covering all public endpoints, unauthenticated admin guards (401/403), login flow, and authenticated session operations:
```bash
./run_full_smoke_test.sh
```

---

## 6. Front-End Integration

When running alongside the front-end applications:
- **Public Portal** (`cndice-sconto-site-clone`): Runs on `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL=http://localhost:4000` (or proxy `/api/*` via Next.js rewrites).
- **Admin Dashboard** (`codice-sconto-admin`): Runs on `http://localhost:3001`. Set `NEXT_PUBLIC_API_URL=http://localhost:4000` (or proxy `/api/*` via Next.js rewrites).

---

## 7. Documentation
- [MERGE_DECISIONS.md](./MERGE_DECISIONS.md): In-depth documentation of all 11 core architectural merge decisions (D1–D11) and endpoint justifications.
- [ENDPOINT_INVENTORY.md](./ENDPOINT_INVENTORY.md): Complete matrix of all 39 API routes, HTTP methods, authorization levels, and response envelopes.

# coupons-site-backend
