import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { log, logError } from "./lib/logger.js";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Parse command line args
const isDryRun = process.argv.includes("--dry-run");

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER_PREFIX || "codicesconto_stores";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

const MAPPING_FILE_PATH = path.join(__dirname, "media-mapping.json");

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Helper to load or initialize media mapping
function loadMediaMapping() {
  if (fs.existsSync(MAPPING_FILE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MAPPING_FILE_PATH, "utf8"));
    } catch (e) {
      log(`Could not parse existing ${MAPPING_FILE_PATH}, starting fresh.`, "WARN");
    }
  }
  return {};
}

function saveMediaMapping(mapping) {
  fs.writeFileSync(MAPPING_FILE_PATH, JSON.stringify(mapping, null, 2), "utf8");
}

// Download image buffer via fetch
async function downloadFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function runMediaMigration() {
  const startTime = Date.now();
  log(`================================================================`);
  log(`Starting Media Migration ${isDryRun ? "[DRY-RUN MODE]" : "[LIVE MODE]"}`);
  log(`Cloudinary Cloud: ${CLOUDINARY_CLOUD_NAME || "MISSING"}`);
  log(`Supabase URL: ${SUPABASE_URL || "MISSING"}`);
  log(`================================================================`);

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Missing Cloudinary credentials in .env");
  }

  let supabase = null;
  if (!isDryRun) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) in .env for live migration.");
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  const mediaMapping = loadMediaMapping();
  const tasks = []; // { sourceUrl, publicId, bucket, storagePath, type }

  // 1. Fetch Cloudinary assets under the folder prefix
  log(`Querying Cloudinary resources with prefix: "${CLOUDINARY_FOLDER}"...`);
  try {
    let nextCursor = null;
    do {
      const res = await cloudinary.api.resources({
        type: "upload",
        prefix: CLOUDINARY_FOLDER,
        max_results: 100,
        next_cursor: nextCursor,
      });

      for (const resItem of res.resources) {
        const publicId = resItem.public_id;
        const format = resItem.format || "jpg";
        const secureUrl = resItem.secure_url;
        const filename = `${path.basename(publicId)}.${format}`;

        // By default, assign to store-images unless identified as coupon/banner
        let bucket = "store-images";
        let storagePath = `stores/${filename}`;

        tasks.push({
          sourceUrl: secureUrl,
          publicId,
          bucket,
          storagePath,
          sourceType: "cloudinary",
        });
      }

      nextCursor = res.next_cursor;
    } while (nextCursor);
    log(`Found ${tasks.length} resources in Cloudinary prefix "${CLOUDINARY_FOLDER}".`);
  } catch (err) {
    logError("Error querying Cloudinary API:", err);
    throw err;
  }

  // 2. Scan MongoDB coupons and promo banners for images that need deterministic paths
  if (MONGODB_URI) {
    log("Scanning MongoDB collections for coupon and banner image references...");
    const mongoClient = new MongoClient(MONGODB_URI);
    try {
      await mongoClient.connect();
      const db = mongoClient.db();

      // Coupons
      const coupons = await db.collection("coupons").find({ image: { $exists: true, $ne: "" } }).toArray();
      for (const coupon of coupons) {
        const imgUrl = coupon.image;
        if (!imgUrl || imgUrl === "/images/placeholder.png") continue;

        // Extract format extension from URL
        let ext = "png";
        const matchExt = imgUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
        if (matchExt) ext = matchExt[1];

        const storagePath = `coupons/${coupon._id.toString()}.${ext}`;
        tasks.push({
          sourceUrl: imgUrl,
          publicId: `coupon_${coupon._id.toString()}`,
          bucket: "coupon-banners",
          storagePath,
          sourceType: "coupon",
          documentId: coupon._id.toString(),
        });
      }

      // Promo Banners
      const banners = await db.collection("promobanners").find({ image: { $exists: true, $ne: "" } }).toArray();
      for (const banner of banners) {
        const imgUrl = banner.image;
        if (!imgUrl || imgUrl === "/images/placeholder.png") continue;
        let ext = "png";
        const matchExt = imgUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
        if (matchExt) ext = matchExt[1];

        const storagePath = `banners/${banner._id.toString()}.${ext}`;
        tasks.push({
          sourceUrl: imgUrl,
          publicId: `banner_${banner._id.toString()}`,
          bucket: "coupon-banners",
          storagePath,
          sourceType: "banner",
          documentId: banner._id.toString(),
        });
      }

      // Sliders
      const sliders = await db.collection("sliders").find({}).toArray();
      for (const slider of sliders) {
        if (slider.image && slider.image !== "/images/placeholder.png") {
          let ext = "png";
          const matchExt = slider.image.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
          if (matchExt) ext = matchExt[1];
          tasks.push({
            sourceUrl: slider.image,
            publicId: `slider_${slider._id.toString()}`,
            bucket: "coupon-banners",
            storagePath: `sliders/${slider._id.toString()}.${ext}`,
            sourceType: "slider",
          });
        }
        if (slider.logo && slider.logo !== "/images/placeholder.png") {
          let ext = "png";
          const matchExt = slider.logo.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
          if (matchExt) ext = matchExt[1];
          tasks.push({
            sourceUrl: slider.logo,
            publicId: `slider_logo_${slider._id.toString()}`,
            bucket: "store-images",
            storagePath: `sliders/logos/${slider._id.toString()}.${ext}`,
            sourceType: "slider_logo",
          });
        }
      }

      log(`Total unique media tasks compiled: ${tasks.length}`);
    } catch (err) {
      logError("Error querying MongoDB for media URLs:", err);
    } finally {
      await mongoClient.close();
    }
  }

  // Deduplicate tasks by sourceUrl
  const uniqueTasksMap = new Map();
  for (const t of tasks) {
    if (!uniqueTasksMap.has(t.sourceUrl)) {
      uniqueTasksMap.set(t.sourceUrl, t);
    }
  }
  const uniqueTasks = Array.from(uniqueTasksMap.values());
  log(`Deduplicated media tasks count: ${uniqueTasks.length}`);

  let uploadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < uniqueTasks.length; i++) {
    const task = uniqueTasks[i];
    const { sourceUrl, bucket, storagePath } = task;

    // Check if already migrated
    if (mediaMapping[sourceUrl]) {
      log(`[${i + 1}/${uniqueTasks.length}] Skipping already mapped: ${sourceUrl}`);
      skippedCount++;
      continue;
    }

    log(`[${i + 1}/${uniqueTasks.length}] Processing [${task.sourceType}]: ${sourceUrl} -> ${bucket}/${storagePath}`);

    if (isDryRun) {
      log(`  [DRY-RUN] Would download from ${sourceUrl} and upload to Supabase bucket: ${bucket}, path: ${storagePath}`);
      uploadedCount++;
      continue;
    }

    try {
      // 1. Download buffer
      const { buffer, contentType } = await downloadFile(sourceUrl);

      // 2. Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });

      if (error) {
        throw new Error(`Supabase upload error: ${error.message}`);
      }

      // 3. Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      const supabaseUrl = publicUrlData.publicUrl;

      // 4. Update mapping
      mediaMapping[sourceUrl] = {
        sourceUrl,
        supabaseUrl,
        bucket,
        storagePath,
        migratedAt: new Date().toISOString(),
      };

      // Also map by publicId if available
      if (task.publicId) {
        mediaMapping[task.publicId] = mediaMapping[sourceUrl];
      }

      saveMediaMapping(mediaMapping);
      log(`  -> SUCCESS: Uploaded to ${supabaseUrl}`, "SUCCESS");
      uploadedCount++;
    } catch (err) {
      logError(`  -> FAILED processing ${sourceUrl}:`, err);
      failedCount++;
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`================================================================`);
  log(`Media Migration Completed in ${durationSec}s`);
  log(`Total: ${uniqueTasks.length} | Uploaded: ${uploadedCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`);
  log(`Media mapping file saved to: ${MAPPING_FILE_PATH}`);
  log(`================================================================`);
}

runMediaMigration().catch((err) => {
  logError("Fatal error during media migration:", err);
  process.exit(1);
});
