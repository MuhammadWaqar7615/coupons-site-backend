# Merge Decisions Record: Unified Backend Architecture

This document records the design decisions, precedence resolutions, and architectural contracts established during the unification of the two backends (`cndice-sconto-site-clone` [App A, public portal] and `codice-sconto-admin` [App B, admin CMS]) into `codice-sconto-backend`.

---

## The Golden Precedence Rule

> **Where the implementation plan and the original source code disagreed, the source code took absolute precedence.**  
> Every route, serialization shape, role constant, and security boundary in this unified backend was verified directly against the production source code before implementation.

---

## Detailed Decisions (D1 – D11)

### D1: Authentication Token Storage Key & Session Format
- **Decision**: Keep `AUTH_TOKEN_STORAGE_KEY = "erp tokkenn"` exactly as defined in `src/config/auth.js`.
- **Rationale**: Both App A and App B frontends read and write the cookie and localStorage under this exact key. Changing or standardizing this string would break session continuity across all existing client applications.
- **Implementation**:
  - JWTs are signed with `jose` HS256 using `SESSION_SECRET` (with fail-fast validation in `src/lib/env.js`).
  - Cookies support multi-domain configuration via `COOKIE_DOMAIN` (e.g. `.codicesconto.com` in production, omitted in local dev).
  - Passwords are verified and hashed using Node's built-in `crypto.scrypt` with timing-safe comparison (`crypto.timingSafeEqual`).

### D2: Role Constants & Authorization Guards
- **Decision**: 
  1. `src/lib/auth/roles.js` preserves the exact source export: `ADMIN = "administration"`, `ADMINISTRATION = "administration"`, `EDITOR = "editor"`, `SUBSCRIBOR = "subscribor"`, `USER = "subscribor"`.
  2. The PostgreSQL database schema enum strictly defines `ADMIN`, `EDITOR`, `SUBSCRIBER`.
  3. `normalizeRole()` maps DB `ADMIN` to `"administration"`, `EDITOR` to `"editor"`, and `SUBSCRIBER` to `"subscribor"`.
  4. All admin route guards execute: `await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION])`.
- **Rationale**: App B's existing middleware and route handlers check against both `ROLES.ADMIN` and `ROLES.ADMINISTRATION` because `normalizeRole()` outputs `"administration"`. Preserving this prevents authorization regressions.

### D3: Edge Middleware vs Node Runtime
- **Decision**:
  1. Root `middleware.js` runs in the Next.js **Edge Runtime**. It performs CORS preflight and headers injection with **zero** imports of Prisma or Node crypto.
  2. Every API route file explicitly declares `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.
- **Rationale**: In Next.js App Router, middleware is executed on the Edge before route handlers. Importing Node-only packages (such as `@prisma/client` or `node:crypto`) into Edge middleware crashes the server. Route handlers running on Node can safely execute Prisma database queries and Node crypto algorithms.
- **CORS Handling**: When `credentials: true` is set, `Access-Control-Allow-Origin` cannot be `*`. Middleware echoes the exact requesting `Origin` if it matches allowed patterns (e.g., `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002`, or custom domain in `CORS_ORIGIN`).

### D4: Public vs. Admin Access on Mixed-Method Routes
- **Decision**:
  - **Public GET, Admin POST / PUT / DELETE**:
    - `/api/stores`: `GET` public, `POST` admin.
    - `/api/stores/[id]`: `GET` public, `PUT` admin, `DELETE` admin.
    - `/api/stores/[id]/coupons`: `GET` public.
    - `/api/categories` & `/api/categories/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/subcategories` & `/api/subcategories/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/sliders` & `/api/sliders/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/badges` & `/api/badges/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/promo-banners` & `/api/promo-banners/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/blog` & `/api/blog/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/features`: `GET` public.
    - `/api/search`: `GET` public.
    - `/api/seo/global`: `GET` public (exposes site metadata), `POST` admin.
    - `/api/seo/pages` & `/api/seo/pages/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/seo/redirects` & `/api/seo/redirects/[id]`: `GET` public, `POST`/`PUT`/`DELETE` admin.
    - `/api/seo/robots`: `GET` public config, `POST` admin.
    - `/api/seo/sitemap`: `GET` public config/XML, `POST` admin.
  - **Strictly Admin-Guarded (All Methods)**:
    - `/api/coupons` (GET & POST) and `/api/coupons/bulk-delete`.
    - `/api/stores/bulk-delete`.
    - `/api/users` & `/api/users/[id]`.
    - `/api/translations`.
    - `/api/theme`.
    - `/api/settings`.
    - `/api/email-templates` & `/api/email-templates/[key]`.
    - `/api/seo/dashboard`.
    - `/api/upload`.
- **Rationale**: Verified against consumption patterns in App A and App B. Admin operations require strict authentication; public consumer catalog and SEO readers do not require credentials.

### D5: SEO Crawler Endpoints vs. Admin Management APIs
- **Decision**:
  - `/robots.txt` is served via `src/app/robots.txt/route.js` as `text/plain; charset=utf-8`.
  - `/sitemap.xml` is served via `src/app/sitemap.xml/route.js` as `application/xml; charset=utf-8`.
  - `/api/seo/robots` returns JSON `{ config: ... }` for the admin `RobotsForm.jsx`.
  - `/api/seo/sitemap` returns JSON `{ config: ... }` by default or when `Accept: application/json` is requested (resolving the fatal JSON parse error in `SitemapForm.jsx`), but returns full XML when `?format=xml` or `Accept: application/xml` is specified.
- **Rationale**: Next.js App Router natively routes `/robots.txt` and `/sitemap.xml` to `src/app/robots.txt/route.js` and `src/app/sitemap.xml/route.js`. The `/api/seo/*` endpoints are designated for admin CMS configuration.

### D6: Coupons Listing Route Canon
- **Decision**: Canonicalize `src/app/api/coupons/route.js` from App B (Admin).
  - `GET /api/coupons` requires Admin privileges and provides full pagination (`page`, `limit`), filtering (`storeId`, `type`, `status`, `search`), and relations.
  - Public coupons are consumed via `GET /api/stores/[id]/coupons` or `GET /api/features`.
- **Rationale**: Neither public portal page calls `/api/coupons` without a store ID. App A's consumer site fetches coupons through `/api/stores/[id]/coupons`.

### D7: User Registration Flow
- **Decision**: Public registration endpoint was intentionally **not** created. User creation is strictly admin-guarded at `POST /api/users`.
- **Rationale**: Investigation of both codebases proved that App B's `src/app/account/registrati/page.js` was an incomplete static mockup without any backend submission target or handler. The Prisma database schema has no self-registration audit columns.

### D8: Strict User Password Stripping
- **Decision**: `serializeUser(u)` in `src/lib/serializer.js` strips both `passwordHash` and `password` properties before returning any user object across `/api/auth/login`, `/api/users`, and `/api/users/[id]`.
- **Rationale**: Prevents accidental leakage of password hashes in JSON responses.

### D9: Polymorphic Identifier Resolution (UUID vs. Slug)
- **Decision**: Endpoints `/api/stores/[id]`, `/api/categories/[id]`, `/api/subcategories/[id]`, and `/api/blog/[id]` support both database UUIDs and URL slugs using `where: { OR: [{ id }, { slug: id }] }` (or `title` for blog posts).
- **Rationale**: App B Admin accesses entities by internal UUID `id`, whereas App A consumer portal accesses entities by SEO-friendly `slug`. Supporting both transparently satisfies both client applications without needing separate routes.

### D10: Response Envelope Preservation
- **Decision**: Every response preserves its canonical envelope property:
  - Stores: `{ stores: [...] }`, `{ store: {...} }`
  - Coupons: `{ success: true, data: [...], total, pages }`, `{ coupon: {...} }`
  - Categories: `{ categories: [...] }`, `{ category: {...} }`
  - Subcategories: `{ subcategories: [...] }`, `{ subcategory: {...} }`
  - Blog: `{ posts: [...] }`, `{ post: {...} }`
  - Sliders: `{ sliders: [...] }`, `{ slider: {...} }`
  - Badges: `{ badges: [...] }`, `{ badge: {...} }`
  - Promo Banners: `{ promoBanners: [...] }`, `{ promoBanner: {...} }`
  - Users: `{ users: [...] }`, `{ user: {...} }`
  - Theme: `{ theme: {...} }`
  - Settings: `{ settings: {...} }`
  - Translations: `{ translations: [...] }`
  - Email Templates: `{ templates: [...] }`, `{ template: {...} }`
  - Live Search: `{ stores: [...], coupons: [...] }`
- **Rationale**: Client components expect their specific response root keys. Destructuring breaks if keys change from plural to singular or if items are wrapped inside unexpected keys.

### D11: MongoDB Compatibility Shims
- **Decision**: Preserve legacy MongoDB-to-Prisma compatibility shims in `src/lib/serializer.js`:
  1. `_id: record.id` attached to all serialized objects.
  2. `storeId: c.store ? { ...c.store, _id: c.store.id } : c.storeId` on coupons.
  3. `categories` on stores formatted as array of category ID strings.
  4. Lowercase enum strings (`"code"`, `"link"`, `"featured"`, `"enabled"`, `"disabled"`) returned to clients.
- **Rationale**: The consumer site frontend components (written originally for MongoDB) inspect `_id` and lowercase string values for UI conditionals.

---

## Justification for Additional Endpoints Outside Source Union

The full route diff against the source application union `(A ∪ B)` across `src/app` identifies four entries:
1. `/api/health`: A production-grade liveness and readiness probe supporting basic database connection ping (`/api/health`) and deep diagnostic checks (`/api/health?deep=1`) for deployment orchestrators, load balancers, and monitoring tools.
2. `/api/seo/dashboard`: User-mandated endpoint to aggregate counts for global SEO status, active SEO pages, and redirects for the SEO suite dashboard (centralizing logic previously embedded directly inside App B's `dashboard/seo/dashboard/page.jsx` server component).
3. `/robots.txt`: Standard search crawler route handler serving dynamically compiled `text/plain; charset=utf-8` exclusion rules directly from the database `RobotsConfig` record.
4. `/sitemap.xml`: Standard search crawler route handler serving dynamically compiled `application/xml; charset=utf-8` sitemap index for all active stores, categories, and blog posts.

