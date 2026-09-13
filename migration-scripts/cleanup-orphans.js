import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const isDryRun = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const prisma = new PrismaClient();

function log(msg, type = "INFO") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${msg}`);
}

async function listAllBucketFiles(bucket, prefix = "") {
  let allFiles = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error(`Failed to list files in ${bucket}/${prefix}: ${error.message}`);
  }

  for (const item of data || []) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      // It is a directory, recurse
      const nested = await listAllBucketFiles(bucket, fullPath);
      allFiles = allFiles.concat(nested);
    } else {
      allFiles.push({ ...item, fullPath, bucket });
    }
  }

  return allFiles;
}

async function moveFileAcrossBuckets(sourceBucket, destBucket, filePath, maxRetries = 3) {
  log(`Moving "${filePath}" from "${sourceBucket}" to "${destBucket}"...`);
  if (isDryRun) {
    log(`[DRY RUN] Would move ${filePath} from ${sourceBucket} to ${destBucket}`);
    return true;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Download from source
      const { data: blob, error: downloadErr } = await supabase.storage.from(sourceBucket).download(filePath);
      if (downloadErr) throw downloadErr;

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = blob.type || "image/jpeg";

      // Upload to dest
      const { error: uploadErr } = await supabase.storage.from(destBucket).upload(filePath, buffer, {
        contentType,
        upsert: true,
      });
      if (uploadErr) throw uploadErr;

      // Remove from source
      const { error: removeErr } = await supabase.storage.from(sourceBucket).remove([filePath]);
      if (removeErr) {
        log(`Warning: Failed to delete original ${filePath} from ${sourceBucket}: ${removeErr.message}`, "WARN");
      }

      log(`Successfully moved "${filePath}" to "${destBucket}"`, "SUCCESS");
      return true;
    } catch (err) {
      log(`Attempt ${attempt}/${maxRetries} failed for ${filePath}: ${err.message}`, attempt === maxRetries ? "ERROR" : "WARN");
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  return false;
}

async function deleteFileFromBucket(bucket, filePath) {
  log(`Deleting orphaned file "${filePath}" from "${bucket}"...`);
  if (isDryRun) {
    log(`[DRY RUN] Would delete ${filePath} from ${bucket}`);
    return true;
  }

  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) {
    log(`Failed to delete ${filePath} from ${bucket}: ${error.message}`, "ERROR");
    return false;
  }

  log(`Deleted "${filePath}" from "${bucket}"`, "SUCCESS");
  return true;
}

async function runCleanup() {
  const startTime = Date.now();
  log(`================================================================`);
  log(`Starting Storage Orphan Cleanup & Rebucket ${isDryRun ? "[DRY-RUN MODE]" : "[LIVE MODE]"}`);
  log(`Supabase URL: ${SUPABASE_URL}`);
  log(`================================================================`);

  try {
    // 1. Fetch all files from storage buckets
    log("Fetching all files in 'store-images' bucket...");
    const storeImageFiles = await listAllBucketFiles("store-images");
    log(`Found ${storeImageFiles.length} files in 'store-images'`);

    log("Fetching all files in 'coupon-banners' bucket...");
    const couponBannerFiles = await listAllBucketFiles("coupon-banners");
    log(`Found ${couponBannerFiles.length} files in 'coupon-banners'`);

    const storeImageMap = new Map(storeImageFiles.map((f) => [f.fullPath, f]));
    const couponBannerMap = new Map(couponBannerFiles.map((f) => [f.fullPath, f]));

    // 2. Fetch all media references from DB
    log("Querying database media references...");
    const stores = await prisma.store.findMany({ select: { id: true, logoStoragePath: true, logoPath: true } });
    const categories = await prisma.category.findMany({ select: { id: true, imageStoragePath: true, image: true } });
    const badges = await prisma.badge.findMany({ select: { id: true, imageStoragePath: true, image: true } });
    const blogPosts = await prisma.blogPost.findMany({ select: { id: true, imageStoragePath: true, image: true } });
    const sliders = await prisma.slider.findMany({
      select: { id: true, imageStoragePath: true, image: true, logoStoragePath: true, logo: true },
    });
    const promoBanners = await prisma.promoBanner.findMany({
      select: { id: true, imageStoragePath: true, image: true },
    });
    const coupons = await prisma.coupon.findMany({ select: { id: true, imageStoragePath: true, image: true } });

    // Expected bucket mappings
    // store-images: stores.logoStoragePath, categories.imageStoragePath, badges.imageStoragePath, blogPosts.imageStoragePath, sliders.logoStoragePath
    const expectedStoreImages = new Set();
    stores.forEach((s) => s.logoStoragePath && expectedStoreImages.add(s.logoStoragePath));
    categories.forEach((c) => c.imageStoragePath && expectedStoreImages.add(c.imageStoragePath));
    badges.forEach((b) => b.imageStoragePath && expectedStoreImages.add(b.imageStoragePath));
    blogPosts.forEach((b) => b.imageStoragePath && expectedStoreImages.add(b.imageStoragePath));
    sliders.forEach((s) => s.logoStoragePath && expectedStoreImages.add(s.logoStoragePath));

    // coupon-banners: coupons.imageStoragePath, sliders.imageStoragePath, promoBanners.imageStoragePath
    const expectedCouponBanners = new Set();
    coupons.forEach((c) => c.imageStoragePath && expectedCouponBanners.add(c.imageStoragePath));
    sliders.forEach((s) => s.imageStoragePath && expectedCouponBanners.add(s.imageStoragePath));
    promoBanners.forEach((p) => p.imageStoragePath && expectedCouponBanners.add(p.imageStoragePath));

    log(`Total expected 'store-images' files: ${expectedStoreImages.size}`);
    log(`Total expected 'coupon-banners' files: ${expectedCouponBanners.size}`);

    // 3. Detect files that are in store-images but belong in coupon-banners
    const filesToMoveToCouponBanners = [];
    for (const path of expectedCouponBanners) {
      if (storeImageMap.has(path) && !couponBannerMap.has(path)) {
        filesToMoveToCouponBanners.push(path);
      }
    }

    log(`Found ${filesToMoveToCouponBanners.length} files currently in 'store-images' that belong in 'coupon-banners'`);

    // 4. Move mislocated files to coupon-banners and update DB URLs
    for (const filePath of filesToMoveToCouponBanners) {
      const moved = await moveFileAcrossBuckets("store-images", "coupon-banners", filePath);
      if (moved) {
        // Update DB URLs where image contains /store-images/ to /coupon-banners/
        if (!isDryRun) {
          // Coupons
          await prisma.coupon.updateMany({
            where: { imageStoragePath: filePath },
            data: {
              image: `${SUPABASE_URL}/storage/v1/object/public/coupon-banners/${filePath}`,
            },
          });
          // Sliders
          await prisma.slider.updateMany({
            where: { imageStoragePath: filePath },
            data: {
              image: `${SUPABASE_URL}/storage/v1/object/public/coupon-banners/${filePath}`,
            },
          });
          // Promo Banners
          await prisma.promoBanner.updateMany({
            where: { imageStoragePath: filePath },
            data: {
              image: `${SUPABASE_URL}/storage/v1/object/public/coupon-banners/${filePath}`,
            },
          });
          log(`Updated DB URLs for "${filePath}" to point to coupon-banners bucket`);
        }
        // Update local maps
        storeImageMap.delete(filePath);
        couponBannerMap.set(filePath, { fullPath: filePath, bucket: "coupon-banners" });
      }
    }

    // 5. Detect and delete orphans in store-images
    const orphanStoreImages = [];
    for (const [fullPath, fileObj] of storeImageMap.entries()) {
      if (!expectedStoreImages.has(fullPath) && !expectedCouponBanners.has(fullPath)) {
        orphanStoreImages.push(fullPath);
      }
    }
    log(`Found ${orphanStoreImages.length} unreferenced orphan files in 'store-images'`);
    for (const orphan of orphanStoreImages) {
      await deleteFileFromBucket("store-images", orphan);
    }

    // 6. Detect and delete orphans in coupon-banners
    const orphanCouponBanners = [];
    for (const [fullPath, fileObj] of couponBannerMap.entries()) {
      if (!expectedCouponBanners.has(fullPath)) {
        orphanCouponBanners.push(fullPath);
      }
    }
    log(`Found ${orphanCouponBanners.length} unreferenced orphan files in 'coupon-banners'`);
    for (const orphan of orphanCouponBanners) {
      await deleteFileFromBucket("coupon-banners", orphan);
    }

    log(`================================================================`);
    log(`Cleanup Complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    log(`Moved to coupon-banners: ${filesToMoveToCouponBanners.length}`);
    log(`Deleted store-images orphans: ${orphanStoreImages.length}`);
    log(`Deleted coupon-banners orphans: ${orphanCouponBanners.length}`);
    log(`================================================================`);
  } catch (error) {
    log(`Cleanup error: ${error.message}`, "ERROR");
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup();
