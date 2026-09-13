# Migration Rollback & Disaster Recovery Procedures

This document provides step-by-step instructions for rolling back the MongoDB & Cloudinary to PostgreSQL & Supabase migration in the event of an issue during staging or production cutover.

---

## 1. Rollback Scenarios

| Scenario | Impact | Recommended Action |
|---|---|---|
| **A. Abort during dry-run** | None | No cleanup required. No database writes or storage uploads occurred. |
| **B. Failure during live media migration (`migrate-media.js`)** | Partial files uploaded to Supabase Storage | Run Storage Cleanup Script or purge uploaded buckets using `media-mapping.json`. |
| **C. Failure during live data migration (`migrate-data.js`)** | Partial data written to PostgreSQL | Run PostgreSQL Truncate / Rollback procedure (Section 2). |
| **D. Post-cutover critical bug in Application** | Application running on PostgreSQL needs to revert to MongoDB | Switch application `.env` back to MongoDB configuration (Section 4). |

---

## 2. Rolling Back PostgreSQL Database

If you need to reset the PostgreSQL database to a clean state before re-running migration:

### Option A: Complete Table Truncation (Preserves Schema)
Connect to the database via `psql` or Prisma and truncate all tables with `CASCADE`:

```sql
TRUNCATE TABLE 
    public.store_subcategories,
    public.store_categories,
    public.coupons,
    public.stores,
    public.subcategories,
    public.categories,
    public.badges,
    public.blog_posts,
    public.sliders,
    public.promo_banners,
    public.themes,
    public.global_seos,
    public.robots_configs,
    public.sitemap_configs,
    public.redirects,
    public.email_templates,
    public.site_settings,
    public.seo_pages,
    public.users,
    public.translations
CASCADE;
```

### Option B: Drop and Re-create Schema
```bash
# Connect to PostgreSQL and recreate database
psql -U postgres -h localhost -c "DROP DATABASE tutti_negozi_migration;"
psql -U postgres -h localhost -c "CREATE DATABASE tutti_negozi_migration;"

# Re-apply Prisma schema from scratch
cd migration-scripts
npx prisma migrate deploy
```

### Option C: Restore from Pre-Migration Backup Dump
If you generated a backup or wish to restore the verified snapshot:
```bash
# Plain SQL format
psql -U postgres -d tutti_negozi_migration -f tutti_negozi_migrated_data.sql

# Or Custom binary format
pg_restore -U postgres -d tutti_negozi_migration --clean tutti_negozi_migrated.dump
```

---

## 3. Rolling Back Supabase Storage Uploads

When `migrate-media.js` runs, it generates `media-mapping.json` recording every uploaded file and its `storagePath`.

To delete uploaded files from Supabase Storage without affecting other files:

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function rollbackStorage() {
  if (!fs.existsSync("media-mapping.json")) {
    console.log("No media-mapping.json found.");
    return;
  }
  const mapping = JSON.parse(fs.readFileSync("media-mapping.json", "utf8"));
  
  const filesByBucket = {};
  for (const [srcUrl, target] of Object.entries(mapping)) {
    if (!target.storagePath) continue;
    const bucket = target.bucket || "store-images";
    if (!filesByBucket[bucket]) filesByBucket[bucket] = [];
    filesByBucket[bucket].push(target.storagePath);
  }

  for (const [bucket, files] of Object.entries(filesByBucket)) {
    console.log(`Deleting ${files.length} files from bucket "${bucket}"...`);
    // Supabase allows deleting in batches of 100
    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) console.error(`Error deleting batch:`, error.message);
    }
  }
  console.log("Storage rollback complete.");
}

rollbackStorage();
'
```

---

## 4. Reverting Application to MongoDB & Cloudinary

If you need to temporarily switch the Next.js admin application back to the legacy MongoDB stack:

1. **Restore MongoDB Environment Variables** in root `.env`:
   ```env
   MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.etu0ai0.mongodb.net/codice_sconto?appName=Cluster0"
   CLOUDINARY_CLOUD_NAME="your_cloud_name"
   CLOUDINARY_API_KEY="your_cloudinary_api_key"
   CLOUDINARY_API_SECRET="your_cloudinary_api_secret"
   ```

2. **Restore Mongoose Models**:
   The legacy Mongoose model definitions are preserved under:
   `src/models/_backup/`
   Copy them back into `src/models/` if needed.

3. **Re-install Mongoose and Cloudinary** (if previously uninstalled):
   ```bash
   npm install mongoose cloudinary
   ```

---

## 5. Verification After Rollback

1. Verify PostgreSQL database is empty or restored:
   ```bash
   psql -U postgres -d tutti_negozi_migration -c "SELECT count(*) FROM stores;"
   ```
2. Verify MongoDB source is untouched:
   ```bash
   node -e '
   const { MongoClient } = require("mongodb");
   require("dotenv").config({ path: "migration-scripts/.env" });
   (async () => {
     const client = new MongoClient(process.env.MONGODB_URI);
     await client.connect();
     const count = await client.db().collection("stores").countDocuments();
     console.log("MongoDB stores count:", count);
     await client.close();
   })();
   '
   ```
