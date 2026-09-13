# Unified Backend API Endpoint Inventory

Complete matrix of all API routes supported by `codice-sconto-backend`, including HTTP methods, authentication levels, canonical source origin, and top-level response envelopes.

---

## 1. System & Health

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `GET` | Public | Backend Native | None | `{ status: "healthy", service: "codice-sconto-backend", ... }` | Backend root health status |
| `/api/health` | `GET` | Public | Backend Native | `?deep=1` (optional) | `{ status: "ok", timestamp, database: { connected: true }, ... }` | Shallow ping (200) or deep check (200/503) |
| `/robots.txt` | `GET` | Public | App B & Native | None | `text/plain; charset=utf-8` | Crawler rules generated from `RobotsConfig` |
| `/sitemap.xml` | `GET` | Public | App B & Native | None | `application/xml; charset=utf-8` | XML sitemap generated from database |

---

## 2. Authentication

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Public | Unified (A+B) | `{ email, password }` | `{ success: true, user: { id, email, role, status, _id } }` | Sets `token` cookie, strips passwordHash |
| `/api/auth/logout` | `POST` | Public | Unified (A+B) | `?redirect=/path` (opt) | `{ success: true, message: "Logged out successfully" }` or 303 Redirect | Clears `token` cookie with matching domain |

---

## 3. Stores Catalog

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/stores` | `GET` | Public | Unified (A+B) | `?status`, `?network`, `?featured`, `?popular`, `?category`, `?search` | `{ stores: [...] }` | Supports consumer filters + admin listings |
| `/api/stores` | `POST` | Admin Only | App B | Store JSON body | `{ store: { ...store, _id } }` (201) | Generates slug, connects categories |
| `/api/stores/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID or slug) | `{ store: { ...store, _id } }` | Polymorphic UUID & slug lookup |
| `/api/stores/[id]` | `PUT` | Admin Only | App B | Store JSON body | `{ store: { ...store, _id } }` | Cleans up old Supabase logo if updated |
| `/api/stores/[id]` | `DELETE` | Admin Only | App B | `id` (UUID or slug) | `{ message: "Store deleted successfully" }` | Deletes store and Supabase image |
| `/api/stores/[id]/coupons` | `GET` | Public | Unified (A+B) | `?activeOnly`, `?section` | `{ coupons: [...] }` | Store-scoped coupon listing |
| `/api/stores/bulk-delete` | `POST` | Admin Only | App B | `{ ids: [...] }` | `{ message: "Stores deleted successfully" }` | Bulk store deletion with Supabase cleanup |

---

## 4. Coupons & Deals

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/coupons` | `GET` | Admin Only | App B | `?page`, `?limit`, `?storeId`, `?type`, `?status`, `?search` | `{ success: true, data: [...], total, pages, currentPage }` | Full admin table pagination & filtering |
| `/api/coupons` | `POST` | Admin Only | App B | Coupon JSON body | `{ success: true, data: { ...coupon, _id } }` (201) | Type checks `code` or `couponUrl` |
| `/api/coupons/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID) | `{ success: true, data: {...}, coupon: {...} }` | Dual envelope matches App A & B |
| `/api/coupons/[id]` | `PUT` | Admin Only | App B | Coupon JSON body | `{ success: true, data: {...}, coupon: {...} }` | Cleans up old banner image if changed |
| `/api/coupons/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ success: true, message: "Coupon deleted successfully" }` | Removes coupon and Supabase banner |
| `/api/features` | `GET` | Public | Unified (A+B) | None | `{ features: [...] }` | Featured coupons for homepage sections |

---

## 5. Categories & Subcategories

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/categories` | `GET` | Public | Unified (A+B) | `?status`, `?showInMenu`, `?featured`, `?slug` | `{ categories: [...] }` | Includes subcategories & stores for consumer |
| `/api/categories` | `POST` | Admin Only | App B | Category JSON body | `{ category: { ...category, _id } }` (201) | Unique slug auto-generation |
| `/api/categories/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID or slug) | `{ category: { ...category, _id } }` | Polymorphic UUID & slug lookup |
| `/api/categories/[id]` | `PUT` | Admin Only | App B | Category JSON body | `{ category: { ...category, _id } }` | Cleans up old image from Supabase |
| `/api/categories/[id]` | `DELETE` | Admin Only | App B | `id` (UUID or slug) | `{ message: "Category deleted successfully" }` | Deletes category & storage image |
| `/api/subcategories` | `GET` | Public | Unified (A+B) | `?status`, `?parentCategory`, `?categoryId` | `{ subcategories: [...] }` | Includes parentCategory `{ id, title, slug }` |
| `/api/subcategories` | `POST` | Admin Only | App B | Subcategory JSON body | `{ subcategory: { ...subcategory, _id } }` (201) | Validates parent category existence |
| `/api/subcategories/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID or slug) | `{ subcategory: { ...subcategory, _id } }` | Polymorphic UUID & slug lookup |
| `/api/subcategories/[id]` | `PUT` | Admin Only | App B | Subcategory JSON body | `{ subcategory: { ...subcategory, _id } }` | Updates subcategory fields |
| `/api/subcategories/[id]` | `DELETE` | Admin Only | App B | `id` (UUID or slug) | `{ message: "Subcategory deleted successfully" }` | Deletes subcategory record |

---

## 6. Homepage & Marketing Content

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/search` | `GET` | Public | Unified (A+B) | `?q=term` | `{ stores: [...], coupons: [...] }` | Live search across stores & coupons |
| `/api/sliders` | `GET` | Public | Unified (A+B) | `?status`, `?featured` | `{ sliders: [...] }` | Ordered by featured desc, createdAt desc |
| `/api/sliders` | `POST` | Admin Only | App B | Slider JSON body | `{ slider: { ...slider, _id } }` (201) | Supports logo & banner paths |
| `/api/sliders/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID) | `{ slider: { ...slider, _id } }` | Returns single slider |
| `/api/sliders/[id]` | `PUT` | Admin Only | App B | Slider JSON body | `{ slider: { ...slider, _id } }` | Cleans up previous images from Supabase |
| `/api/sliders/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "Slider deleted successfully" }` | Deletes slider & both storage images |
| `/api/badges` | `GET` | Public | Unified (A+B) | None | `{ badges: [...] }` | Ordered by name asc |
| `/api/badges` | `POST` | Admin Only | App B | Badge JSON body | `{ badge: { ...badge, _id } }` (201) | Requires name and image |
| `/api/badges/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID) | `{ badge: { ...badge, _id } }` | Returns single badge |
| `/api/badges/[id]` | `PUT` | Admin Only | App B | Badge JSON body | `{ badge: { ...badge, _id } }` | Replaces badge image |
| `/api/badges/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "Badge deleted successfully" }` | Deletes badge & storage image |
| `/api/promo-banners` | `GET` | Public | Unified (A+B) | `?status` | `{ promoBanners: [...] }` | Ordered by createdAt desc |
| `/api/promo-banners` | `POST` | Admin Only | App B | Banner JSON body | `{ promoBanner: { ...banner, _id } }` (201) | Heading, description, image required |
| `/api/promo-banners/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID) | `{ promoBanner: { ...banner, _id } }` | Returns single banner |
| `/api/promo-banners/[id]` | `PUT` | Admin Only | App B | Banner JSON body | `{ promoBanner: { ...banner, _id } }` | Cleans up previous image |
| `/api/promo-banners/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "Promo banner deleted successfully" }` | Deletes banner & storage image |
| `/api/blog` | `GET` | Public | Unified (A+B) | `?status` | `{ posts: [...] }` | Ordered by createdAt desc |
| `/api/blog` | `POST` | Admin Only | App B | Post JSON body | `{ post: { ...post, _id } }` (201) | Title, description, image required |
| `/api/blog/[id]` | `GET` | Public | Unified (A+B) | `id` (UUID or title) | `{ post: { ...post, _id } }` | Polymorphic UUID & title lookup |
| `/api/blog/[id]` | `PUT` | Admin Only | App B | Post JSON body | `{ post: { ...post, _id } }` | Updates post and cleans old image |
| `/api/blog/[id]` | `DELETE` | Admin Only | App B | `id` (UUID or title) | `{ message: "Blog post deleted successfully" }` | Deletes post & storage image |

---

## 7. Media & Storage

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/upload` | `POST` | Admin Only | App B | `multipart/form-data` (`file`, `bucket`) | `{ url, public_id, storagePath, bucket }` | 5MB max, whitelisted to `store-images` & `coupon-banners` |

---

## 8. User Management

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/users` | `GET` | Admin Only | App B | None | `{ users: [...] }` | Strictly strips passwordHash & password |
| `/api/users` | `POST` | Admin Only | App B | User JSON body | `{ user: { ...user, _id } }` (201) | Hashes password via `crypto.scrypt` |
| `/api/users/[id]` | `GET` | Admin Only | App B | `id` (UUID) | `{ user: { ...user, _id } }` | Strictly strips passwordHash & password |
| `/api/users/[id]` | `PUT` | Admin Only | App B | User JSON body | `{ user: { ...user, _id } }` | Optional password change re-hashes safely |
| `/api/users/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "User deleted successfully" }` | Removes user account |

---

## 9. Site Configuration & Localization

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/translations` | `GET` | Admin Only | App B | None | `{ translations: [{ key, source, value }] }` | Returns full key catalog with saved values |
| `/api/translations` | `PUT` | Admin Only | App B | `{ translations: [...] }` | `{ message: "Translations saved successfully." }` | Chunked upsert transaction (25 per chunk) |
| `/api/theme` | `GET` | Admin Only | App B | None | `{ theme: { ...defaults, ...saved, _id } }` | Returns colors, headers, logos |
| `/api/theme` | `PUT` | Admin Only | App B | Theme JSON body | `{ message: "Theme settings saved successfully.", theme }` | Hex validation on colors |
| `/api/settings` | `GET` | Admin Only | App B | None | `{ settings: { ...defaults, ...saved, _id, smtp } }` | Masked SMTP password |
| `/api/settings` | `PUT` | Admin Only | App B | Settings JSON body | `{ message: "Site settings saved successfully.", settings }` | Preserves existing SMTP password if omitted |
| `/api/email-templates` | `GET` | Admin Only | App B | None | `{ templates: [...] }` | Returns all 7 default templates with DB overrides |
| `/api/email-templates/[key]` | `GET` | Admin Only | App B | `key` (templateKey) | `{ template: {...} }` | Returns template by key |
| `/api/email-templates/[key]` | `PUT` | Admin Only | App B | Template JSON body | `{ message: "Email template saved successfully.", template }` | Upserts template by unique templateKey |

---

## 10. SEO Suite

| Path | Methods | Auth Level | Source Origin | Request / Query | Response Envelope / Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/seo/dashboard` | `GET` | Admin Only | New Unified | None | `{ globalSeo, pageSeoCount, activePageSeoCount, redirectCount, activeRedirectCount, sitemapEnabled }` | Aggregates all SEO entity metrics |
| `/api/seo/global` | `GET` | Public | App B | None | `{ settings: { ...settings, _id } }` | Exposes global site metadata |
| `/api/seo/global` | `POST` | Admin Only | App B | SEO JSON body | `{ message: "Global SEO settings saved successfully.", settings }` | Upserts singleton GlobalSeo record |
| `/api/seo/pages` | `GET` | Public | App B | None | `{ pages: [...] }` | Lists all page SEO definitions |
| `/api/seo/pages` | `POST` | Admin Only | App B | Page SEO JSON body | `{ message: "SEO page created successfully.", page }` (201) | Unique path validation |
| `/api/seo/pages/[id]` | `GET` | Public | App B | `id` (UUID) | `{ page: { ...page, _id } }` | Returns single page SEO record |
| `/api/seo/pages/[id]` | `PUT` | Admin Only | App B | Page SEO JSON body | `{ message: "SEO page updated successfully.", page }` | Updates page metadata |
| `/api/seo/pages/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "SEO page deleted successfully." }` | Deletes page metadata |
| `/api/seo/redirects` | `GET` | Public | App B | None | `{ redirects: [...] }` | Lists all redirects |
| `/api/seo/redirects` | `POST` | Admin Only | App B | Redirect JSON body | `{ message: "Redirect created successfully.", redirect }` (201) | 301, 302, 307, 308 validation |
| `/api/seo/redirects/[id]` | `GET` | Public | App B | `id` (UUID) | `{ redirect: { ...redirect, _id } }` | Returns single redirect |
| `/api/seo/redirects/[id]` | `PUT` | Admin Only | App B | Redirect JSON body | `{ message: "Redirect updated successfully.", redirect }` | Updates redirect rule |
| `/api/seo/redirects/[id]` | `DELETE` | Admin Only | App B | `id` (UUID) | `{ message: "Redirect deleted successfully." }` | Deletes redirect rule |
| `/api/seo/robots` | `GET` | Public | App B | None | `{ config: { ...config, _id } }` | JSON config for admin RobotsForm |
| `/api/seo/robots` | `POST` | Admin Only | App B | Robots JSON body | `{ message: "Robots configuration saved successfully.", config }` | Upserts singleton RobotsConfig |
| `/api/seo/sitemap` | `GET` | Public | App B | `?format=xml` or `Accept: application/xml` | `{ config: {...} }` (JSON default) or `application/xml` (XML) | Dual behavior: fixes SitemapForm & serves XML |
| `/api/seo/sitemap` | `POST` | Admin Only | App B | Sitemap JSON body | `{ message: "Sitemap configuration saved successfully.", config }` | Upserts singleton SitemapConfig |
