# Migration Pipeline: MongoDB & Cloudinary → PostgreSQL & Supabase Storage

A production-ready ETL pipeline designed to transfer all 18 collections from MongoDB Atlas to PostgreSQL via Prisma ORM, and migrate media assets from Cloudinary to Supabase Storage with automated referential integrity fixes and validation.

---

## Architecture Overview

- **Source Database**: MongoDB Atlas (`codice_sconto`)
- **Target Database**: PostgreSQL (`tutti_negozi_migration`)
- **Source Storage**: Cloudinary (folder prefix: `codicesconto_stores`)
- **Target Storage**: Supabase Storage (`store-images` and `coupon-banners` public buckets)
- **Data Layer**: Prisma ORM with normalized relations and cascades
- **Logging**: Dual console and persistent file logs (`migration.log`)

---

## 1. Prerequisites & Setup

### A. Local PostgreSQL
1. Ensure PostgreSQL 14+ is running locally.
2. Create the target database:
   ```sql
   CREATE DATABASE tutti_negozi_migration;
   ```
3. Verify connection:
   ```bash
   psql -U postgres -d tutti_negozi_migration -c "SELECT 1;"
   ```

### B. Supabase Storage
1. In your Supabase Project Dashboard, go to **Storage**.
2. Create two **Public** buckets:
   - `store-images` (for store logos, categories, badges)
   - `coupon-banners` (for coupons, promo banners, sliders)
3. Obtain your **Project URL** and **Service Role Key** from **Project Settings → API**.

### C. Cloudinary Credentials
From your Cloudinary Dashboard, ensure you have:
- Cloud Name
- API Key
- API Secret
- Folder prefix: `codicesconto_stores`

---

## 2. Environment Configuration

1. In `migration-scripts/`, copy the template:
   ```bash
   cp .env.example .env
   ```
2. Fill in your credentials:
   ```env
   MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.etu0ai0.mongodb.net/codice_sconto?appName=Cluster0"
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/tutti_negozi_migration?schema=public"
   SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
   CLOUDINARY_CLOUD_NAME="your_cloud_name"
   CLOUDINARY_API_KEY="your_cloudinary_api_key"
   CLOUDINARY_API_SECRET="your_cloudinary_api_secret"
   CLOUDINARY_FOLDER_PREFIX="codicesconto_stores"
   ```

---

## 3. Installation & Database Migration

Install dependencies and apply the Prisma schema to PostgreSQL:

```bash
cd migration-scripts
npm install

# Generate Prisma Client
npm run prisma:generate

# Apply migrations to create PostgreSQL tables
npm run prisma:migrate
```

---

## 4. Execution Workflow

### Step 1: Migrate Media Assets (`migrate-media.js`)

Downloads assets from Cloudinary and MongoDB image URLs, uploads them to appropriate Supabase Storage buckets, and creates `media-mapping.json`.

```bash
# 1. Test in Dry-Run mode (inspects files without uploading)
npm run migrate:media:dry

# 2. Execute Live Media Migration
npm run migrate:media
```

*Output:* `media-mapping.json` maps source URLs to Supabase public URLs and relative storage paths.

---

### Step 2: Migrate Database Records (`migrate-data.js`)

Extracts MongoDB documents, resolves IDs to UUIDs, remaps Cloudinary URLs using `media-mapping.json`, normalizes join tables, and inserts into PostgreSQL.

```bash
# 1. Test in Dry-Run mode with a limit of 5 records per collection
node migrate-data.js --dry-run --limit=5

# 2. Execute Live Migration
npm run migrate:data
```

#### CLI Options for `migrate-data.js`:
- `--dry-run`: Runs transformations and logs output without writing to PostgreSQL.
- `--limit=<N>`: Migrates a maximum of `N` records per collection (useful for quick verification).
- `--skip-orphans`: Skips orphaned subcategories instead of reassigning them to the fallback `"Uncategorised"` category.

---

### Step 3: Verify & Audit Migration (`validate.js`)

Performs a 4-point automated audit:
1. **Row Count Audit**: Compares MongoDB document count vs PostgreSQL row count for all 18 collections.
2. **Relational Integrity Audit**: Executes strict SQL queries checking for **0 orphaned foreign keys**:
   - `coupons` → `stores`
   - `subcategories` → `categories`
   - `store_categories` join table
   - `store_subcategories` join table
3. **Data Spot-Check**: Inspects sample records to verify transformed field values.
4. **Media Probe**: Sends HTTP HEAD requests to Supabase URLs to verify they return HTTP 200.

```bash
npm run validate
```

---

## 5. Database Dump & Backup Artifacts

The migration pipeline includes pre-generated, verified PostgreSQL database dumps located in `migration-scripts/`:

| File | Format | Description |
|---|---|---|
| `tutti_negozi_migrated_data.sql` | Plain SQL (`--data-only --inserts`) | Portable SQL INSERT statements containing all migrated data |
| `tutti_negozi_migrated.dump` | PostgreSQL Custom Binary (`pg_dump -Fc`) | High-performance binary dump for fast restore with `pg_restore` |
| `media-mapping.json` | JSON | Complete mapping of Cloudinary/Mongo image URLs to Supabase public URLs |
| `mongo-id-mapping.json` | JSON | Complete mapping of legacy MongoDB 24-hex ObjectIds to PostgreSQL UUIDs |

### Restoring to Another Database / Staging / Production:
```bash
# Option A: Restore plain SQL data
psql -U postgres -d your_target_db -f migration-scripts/tutti_negozi_migrated_data.sql

# Option B: Restore custom binary dump
pg_restore -U postgres -d your_target_db --clean migration-scripts/tutti_negozi_migrated.dump
```

---

## 6. Architectural Fixes Applied During Migration

| Issue | MongoDB Root Cause | PostgreSQL Fix in Migration |
|---|---|---|
| **Orphaned Subcategory** | Subcategory `kj` pointed to deleted category `6a90838aac7bd88d7ef1e132` | Automatically creates and reassigns to fallback category `"Uncategorised"` so foreign keys never fail |
| **Role Enum Mismatch** | Mongo used `"administration"`, env used `"admin"` | Unified to PostgreSQL enum `ADMIN`, `EDITOR`, `SUBSCRIBER` (mapping `"administration"` → `ADMIN`, `"subscribor"` → `SUBSCRIBER`) |
| **Missing Cascade on Store Deletion** | Deleting a store left coupons with stale `storeId` | `Coupon` relation to `Store` uses `onDelete: Cascade` |
| **Coupon Cloudinary Leaks** | Coupons lacked `imagePublicId` | Records `imageStoragePath` (e.g. `coupons/<id>.png`) in PostgreSQL for clean future deletion |
| **Singleton Duplication** | Multiple reads could duplicate configs | `Theme`, `GlobalSeo`, `SiteSettings`, etc. use `upsert` / single-record enforcement |
| **Zero-Document Collections** | Empty collections (`seopages`, `sitesettings`, `users`) could crash queries | Explicit zero-check handling with informative logging |

---

## 7. Operational Guides & Runbooks

- **[Rollback & Disaster Recovery Guide](ROLLBACK.md)**: Detailed step-by-step instructions for resetting PostgreSQL tables, purging Supabase storage, or reverting Next.js to MongoDB.
- **[ID Mapping Documentation](ID_MAPPING.md)**: Complete guide on how MongoDB ObjectIds map to PostgreSQL UUIDs and how to look up legacy entities.

---

## 8. Troubleshooting

- **`FATAL: password authentication failed for user "postgres"`**:
  Verify the password in `DATABASE_URL` matches your local PostgreSQL configuration.
- **`Connection refused to MongoDB`**:
  Ensure your current public IP is whitelisted in MongoDB Atlas Network Access.
- **`Supabase 403 Forbidden on upload`**:
  Ensure you are using the `SUPABASE_SERVICE_ROLE_KEY` (secret key), not the public `anon` key.
- **Review Detailed Logs**:
  All operations are logged to `migration-scripts/migration.log`.

