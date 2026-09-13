import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { log, logError } from "./lib/logger.js";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Parse command line args
const isDryRun = process.argv.includes("--dry-run");
const skipOrphans = process.argv.includes("--skip-orphans");

let limitArg = null;
const limitMatch = process.argv.find((arg) => arg.startsWith("--limit="));
if (limitMatch) {
  limitArg = parseInt(limitMatch.split("=")[1], 10);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_URL = process.env.DATABASE_URL;

const MEDIA_MAPPING_FILE = path.join(__dirname, "media-mapping.json");
const ID_MAPPING_FILE = path.join(__dirname, "mongo-id-mapping.json");

// Load media mapping if available
function loadMediaMapping() {
  if (fs.existsSync(MEDIA_MAPPING_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEDIA_MAPPING_FILE, "utf8"));
    } catch (e) {
      log("Could not parse media-mapping.json, proceeding without media remapping.", "WARN");
    }
  }
  return {};
}

// In-memory Mongo ObjectId -> Postgres UUID map
const idMap = {
  categories: new Map(),
  subcategories: new Map(),
  stores: new Map(),
  coupons: new Map(),
  users: new Map(),
  badges: new Map(),
  blogPosts: new Map(),
  sliders: new Map(),
  promoBanners: new Map(),
  translations: new Map(),
  themes: new Map(),
  globalSeo: new Map(),
  seoPages: new Map(),
  redirects: new Map(),
  robotsConfig: new Map(),
  sitemapConfig: new Map(),
  emailTemplates: new Map(),
  siteSettings: new Map(),
};

function getOrCreateUUID(collectionKey, mongoIdStr) {
  if (!idMap[collectionKey]) {
    idMap[collectionKey] = new Map();
  }
  if (!idMap[collectionKey].has(mongoIdStr)) {
    idMap[collectionKey].set(mongoIdStr, uuidv4());
  }
  return idMap[collectionKey].get(mongoIdStr);
}

// Enum conversion helpers
function mapRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "administration") return "ADMIN";
  if (r === "editor") return "EDITOR";
  return "SUBSCRIBER";
}

function mapStatus(status) {
  return (status || "").toLowerCase() === "disabled" ? "DISABLED" : "ENABLED";
}

function mapCouponType(type) {
  return (type || "").toLowerCase() === "link" ? "LINK" : "CODE";
}

function mapHomepageSection(section) {
  const s = (section || "").toLowerCase();
  if (s === "secondary") return "SECONDARY";
  if (s === "new") return "NEW";
  if (s === "expiring") return "EXPIRING";
  return "FEATURED";
}

function mapDate(d) {
  if (!d) return null;
  const dateObj = new Date(d);
  return isNaN(dateObj.getTime()) ? null : dateObj;
}

// Remap media URL using media-mapping.json
function resolveMedia(urlOrPublicId, mediaMapping) {
  if (!urlOrPublicId || urlOrPublicId === "/images/placeholder.png") {
    return { url: urlOrPublicId || "/images/placeholder.png", storagePath: null };
  }
  if (mediaMapping[urlOrPublicId]) {
    return {
      url: mediaMapping[urlOrPublicId].supabaseUrl || urlOrPublicId,
      storagePath: mediaMapping[urlOrPublicId].storagePath || null,
    };
  }
  return { url: urlOrPublicId, storagePath: null };
}

async function runDataMigration() {
  const startTime = Date.now();
  log(`================================================================`);
  log(`Starting Data Migration ${isDryRun ? "[DRY-RUN MODE]" : "[LIVE MODE]"}`);
  if (limitArg) log(`Record limit per collection: ${limitArg}`);
  log(`MongoDB URI: ${MONGODB_URI ? "Configured" : "MISSING"}`);
  log(`Database URL: ${DATABASE_URL ? "Configured" : "MISSING"}`);
  log(`================================================================`);

  if (!MONGODB_URI) throw new Error("Missing MONGODB_URI in .env");
  if (!DATABASE_URL && !isDryRun) throw new Error("Missing DATABASE_URL in .env");

  const mediaMapping = loadMediaMapping();
  const mongoClient = new MongoClient(MONGODB_URI);
  let prisma = null;

  if (!isDryRun) {
    prisma = new PrismaClient();
    await prisma.$connect();
  }

  await mongoClient.connect();
  const db = mongoClient.db();

  const report = {};

  try {
    // -------------------------------------------------------------
    // 1. Translations (Key-Value)
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Translations...");
      let query = db.collection("translations").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      if (docs.length === 0) {
        log("  -> 0 translations found (skipped).");
        report.translations = 0;
      } else {
        let inserted = 0;
        for (const doc of docs) {
          const id = getOrCreateUUID("translations", doc._id.toString());
          const record = {
            id,
            key: doc.key,
            source: doc.source || "",
            value: doc.value || "",
            createdAt: mapDate(doc.createdAt) || new Date(),
            updatedAt: mapDate(doc.updatedAt) || new Date(),
          };

          if (!isDryRun) {
            await prisma.translation.upsert({
              where: { key: record.key },
              update: record,
              create: record,
            });
          }
          inserted++;
        }
        report.translations = inserted;
        const dur = ((Date.now() - colStart) / 1000).toFixed(2);
        log(`  -> Migrated ${inserted} translations in ${dur}s`, "SUCCESS");
      }
    }

    // -------------------------------------------------------------
    // 2. Users
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Users...");
      let query = db.collection("users").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      if (docs.length === 0) {
        log("  -> 0 users found in collection (gracefully handled).");
        report.users = 0;
      } else {
        let inserted = 0;
        for (const doc of docs) {
          const id = getOrCreateUUID("users", doc._id.toString());
          const record = {
            id,
            name: doc.name || "User",
            email: (doc.email || "").toLowerCase(),
            description: doc.description || null,
            passwordHash: doc.passwordHash || "",
            role: mapRole(doc.role),
            verified: Boolean(doc.verified),
            status: mapStatus(doc.status),
            createdAt: mapDate(doc.createdAt) || new Date(),
            updatedAt: mapDate(doc.updatedAt) || new Date(),
          };

          if (!isDryRun) {
            await prisma.user.upsert({
              where: { email: record.email },
              update: record,
              create: record,
            });
          }
          inserted++;
        }
        report.users = inserted;
        const dur = ((Date.now() - colStart) / 1000).toFixed(2);
        log(`  -> Migrated ${inserted} users in ${dur}s`, "SUCCESS");
      }
    }

    // -------------------------------------------------------------
    // 3. Categories (ensuring "Uncategorised" fallback exists)
    // -------------------------------------------------------------
    let uncategorisedCategoryId = null;
    {
      const colStart = Date.now();
      log("Processing Categories...");
      let query = db.collection("categories").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      let inserted = 0;
      for (const doc of docs) {
        const id = getOrCreateUUID("categories", doc._id.toString());
        const resolvedImage = resolveMedia(doc.image, mediaMapping);

        const record = {
          id,
          title: doc.title || "Untitled Category",
          slug: doc.slug || `category-${id.slice(0, 8)}`,
          description: doc.description || null,
          icon: doc.icon || null,
          showInMenu: doc.showInMenu !== false,
          featured: Boolean(doc.featured),
          seoTitle: doc.seoTitle || null,
          seoDescription: doc.seoDescription || null,
          status: mapStatus(doc.status),
          image: resolvedImage.url,
          imagePublicId: doc.imagePublicId || null,
          imageStoragePath: resolvedImage.storagePath,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };

        if (!isDryRun) {
          await prisma.category.upsert({
            where: { slug: record.slug },
            update: record,
            create: record,
          });
        }
        inserted++;
      }

      // Ensure fallback "Uncategorised" category exists for orphaned subcategories
      uncategorisedCategoryId = uuidv4();
      const fallbackCategory = {
        id: uncategorisedCategoryId,
        title: "Uncategorised",
        slug: "uncategorised",
        description: "Default fallback category for orphaned items",
        showInMenu: false,
        featured: false,
        status: "ENABLED",
        image: "/images/placeholder.png",
      };

      if (!isDryRun) {
        const existingFallback = await prisma.category.findUnique({ where: { slug: "uncategorised" } });
        if (existingFallback) {
          uncategorisedCategoryId = existingFallback.id;
        } else {
          const createdFallback = await prisma.category.create({ data: fallbackCategory });
          uncategorisedCategoryId = createdFallback.id;
          log("  -> Created fallback category 'Uncategorised'", "SUCCESS");
        }
      }

      report.categories = inserted;
      const dur = ((Date.now() - colStart) / 1000).toFixed(2);
      log(`  -> Migrated ${inserted} categories in ${dur}s`, "SUCCESS");
    }

    // -------------------------------------------------------------
    // 4. Subcategories (Handling orphaned references)
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Subcategories...");
      let query = db.collection("subcategories").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      let inserted = 0;
      let orphanedCount = 0;

      for (const doc of docs) {
        const id = getOrCreateUUID("subcategories", doc._id.toString());
        const rawParentId = doc.parentCategory ? doc.parentCategory.toString() : null;

        let parentCategoryId = rawParentId ? idMap.categories.get(rawParentId) : null;

        if (!parentCategoryId) {
          orphanedCount++;
          if (skipOrphans) {
            log(`  [WARN] Skipping orphaned subcategory '${doc.title}' (${doc._id}) with missing parent ${rawParentId}`, "WARN");
            continue;
          } else {
            log(`  [FIX] Reassigning orphaned subcategory '${doc.title}' (${doc._id}) to 'Uncategorised' category (${uncategorisedCategoryId})`, "WARN");
            parentCategoryId = uncategorisedCategoryId;
          }
        }

        const record = {
          id,
          title: doc.title || "Untitled Subcategory",
          slug: doc.slug || `subcategory-${id.slice(0, 8)}`,
          description: doc.description || null,
          parentCategoryId,
          seoTitle: doc.seoTitle || null,
          seoDescription: doc.seoDescription || null,
          status: mapStatus(doc.status),
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };

        if (!isDryRun) {
          await prisma.subcategory.upsert({
            where: { slug: record.slug },
            update: record,
            create: record,
          });
        }
        inserted++;
      }

      report.subcategories = inserted;
      report.orphanedSubcategoriesHandled = orphanedCount;
      const dur = ((Date.now() - colStart) / 1000).toFixed(2);
      log(`  -> Migrated ${inserted} subcategories (${orphanedCount} orphaned resolved) in ${dur}s`, "SUCCESS");
    }

    // -------------------------------------------------------------
    // 5. Stores + Join Tables (StoreCategory, StoreSubcategory)
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Stores and Category associations...");
      let query = db.collection("stores").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      let insertedStores = 0;
      let storeCategoryJoins = 0;
      let storeSubcategoryJoins = 0;

      for (const doc of docs) {
        const storeId = getOrCreateUUID("stores", doc._id.toString());
        const resolvedLogo = resolveMedia(doc.logoPath, mediaMapping);

        const storeRecord = {
          id: storeId,
          name: doc.name || "Untitled Store",
          slug: doc.slug || `store-${storeId.slice(0, 8)}`,
          logoPath: resolvedLogo.url,
          logoPublicId: doc.logoPublicId || null,
          logoStoragePath: resolvedLogo.storagePath,
          description: doc.description || null,
          seoTitle: doc.seoTitle || null,
          seoDescription: doc.seoDescription || null,
          websiteUrl: doc.websiteUrl || null,
          isActive: doc.isActive !== false,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };

        if (!isDryRun) {
          await prisma.store.upsert({
            where: { slug: storeRecord.slug },
            update: storeRecord,
            create: storeRecord,
          });
        }
        insertedStores++;

        // Process categories array
        if (Array.isArray(doc.categories)) {
          for (const rawCatId of doc.categories) {
            const catIdStr = rawCatId?.toString();
            const targetCatUUID = catIdStr ? idMap.categories.get(catIdStr) : null;
            if (targetCatUUID) {
              if (!isDryRun) {
                await prisma.storeCategory.upsert({
                  where: { storeId_categoryId: { storeId, categoryId: targetCatUUID } },
                  update: {},
                  create: { storeId, categoryId: targetCatUUID },
                });
              }
              storeCategoryJoins++;
            }
          }
        }

        // Process subcategories array
        if (Array.isArray(doc.subcategories)) {
          for (const rawSubId of doc.subcategories) {
            const subIdStr = rawSubId?.toString();
            const targetSubUUID = subIdStr ? idMap.subcategories.get(subIdStr) : null;
            if (targetSubUUID) {
              if (!isDryRun) {
                await prisma.storeSubcategory.upsert({
                  where: { storeId_subcategoryId: { storeId, subcategoryId: targetSubUUID } },
                  update: {},
                  create: { storeId, subcategoryId: targetSubUUID },
                });
              }
              storeSubcategoryJoins++;
            }
          }
        }
      }

      report.stores = insertedStores;
      report.storeCategories = storeCategoryJoins;
      report.storeSubcategories = storeSubcategoryJoins;
      const dur = ((Date.now() - colStart) / 1000).toFixed(2);
      log(`  -> Migrated ${insertedStores} stores, ${storeCategoryJoins} store-categories, ${storeSubcategoryJoins} store-subcategories in ${dur}s`, "SUCCESS");
    }

    // -------------------------------------------------------------
    // 6. Coupons (Remap images & verify Store FK)
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Coupons...");
      let query = db.collection("coupons").find({});
      if (limitArg) query = query.limit(limitArg);
      const docs = await query.toArray();

      let inserted = 0;
      let skippedOrphans = 0;

      for (const doc of docs) {
        const id = getOrCreateUUID("coupons", doc._id.toString());
        const rawStoreId = doc.storeId ? doc.storeId.toString() : null;
        const targetStoreUUID = rawStoreId ? idMap.stores.get(rawStoreId) : null;

        if (!targetStoreUUID) {
          log(`  [WARN] Skipping coupon '${doc.title}' (${doc._id}): referenced store ${rawStoreId} not found!`, "WARN");
          skippedOrphans++;
          continue;
        }

        const resolvedImage = resolveMedia(doc.image, mediaMapping);

        const record = {
          id,
          storeId: targetStoreUUID,
          type: mapCouponType(doc.type),
          title: doc.title || "Untitled Coupon",
          description: doc.description || "",
          code: doc.code || null,
          couponUrl: doc.couponUrl || null,
          discount: doc.discount || "Deal",
          terms: doc.terms || null,
          startsAt: mapDate(doc.startsAt),
          expiresAt: mapDate(doc.expiresAt),
          isActive: doc.isActive !== false,
          isFeatured: Boolean(doc.isFeatured),
          homepageSection: mapHomepageSection(doc.homepageSection),
          image: resolvedImage.url,
          imageStoragePath: resolvedImage.storagePath,
          labelTop: doc.labelTop || null,
          labelBottom: doc.labelBottom || null,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };

        if (!isDryRun) {
          await prisma.coupon.upsert({
            where: { id: record.id },
            update: record,
            create: record,
          });
        }
        inserted++;
      }

      report.coupons = inserted;
      report.skippedCouponOrphans = skippedOrphans;
      const dur = ((Date.now() - colStart) / 1000).toFixed(2);
      log(`  -> Migrated ${inserted} coupons in ${dur}s`, "SUCCESS");
    }

    // -------------------------------------------------------------
    // 7. Badges, BlogPosts, Sliders, PromoBanners
    // -------------------------------------------------------------
    {
      const colStart = Date.now();
      log("Processing Badges...");
      const badges = await db.collection("badges").find({}).toArray();
      let badgeCount = 0;
      for (const doc of badges) {
        const id = getOrCreateUUID("badges", doc._id.toString());
        const resolvedImage = resolveMedia(doc.image, mediaMapping);
        const record = {
          id,
          name: doc.name || "Badge",
          image: resolvedImage.url,
          imagePublicId: doc.imagePublicId || null,
          imageStoragePath: resolvedImage.storagePath,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.badge.upsert({ where: { id }, update: record, create: record });
        }
        badgeCount++;
      }
      report.badges = badgeCount;
      log(`  -> Migrated ${badgeCount} badges`, "SUCCESS");

      log("Processing Blog Posts...");
      const blogPosts = await db.collection("blogposts").find({}).toArray();
      let blogCount = 0;
      for (const doc of blogPosts) {
        const id = getOrCreateUUID("blogPosts", doc._id.toString());
        const resolvedImage = resolveMedia(doc.image, mediaMapping);
        const record = {
          id,
          title: doc.title || "Blog Post",
          description: doc.description || "",
          seoTitle: doc.seoTitle || null,
          seoDescription: doc.seoDescription || null,
          image: resolvedImage.url,
          imagePublicId: doc.imagePublicId || null,
          imageStoragePath: resolvedImage.storagePath,
          status: mapStatus(doc.status),
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.blogPost.upsert({ where: { id }, update: record, create: record });
        }
        blogCount++;
      }
      report.blogPosts = blogCount;
      log(`  -> Migrated ${blogCount} blog posts`, "SUCCESS");

      log("Processing Sliders...");
      const sliders = await db.collection("sliders").find({}).toArray();
      let sliderCount = 0;
      for (const doc of sliders) {
        const id = getOrCreateUUID("sliders", doc._id.toString());
        const resolvedImage = resolveMedia(doc.image, mediaMapping);
        const resolvedLogo = resolveMedia(doc.logo, mediaMapping);
        const record = {
          id,
          title: doc.title || "Slider",
          description: doc.description || null,
          discount: doc.discount || null,
          logo: resolvedLogo.url,
          logoPublicId: doc.logoPublicId || null,
          logoStoragePath: resolvedLogo.storagePath,
          link: doc.link || "#",
          featured: Boolean(doc.featured),
          seoTitle: doc.seoTitle || null,
          seoDescription: doc.seoDescription || null,
          status: mapStatus(doc.status),
          image: resolvedImage.url,
          imagePublicId: doc.imagePublicId || null,
          imageStoragePath: resolvedImage.storagePath,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.slider.upsert({ where: { id }, update: record, create: record });
        }
        sliderCount++;
      }
      report.sliders = sliderCount;
      log(`  -> Migrated ${sliderCount} sliders`, "SUCCESS");

      log("Processing Promo Banners...");
      const banners = await db.collection("promobanners").find({}).toArray();
      let bannerCount = 0;
      for (const doc of banners) {
        const id = getOrCreateUUID("promoBanners", doc._id.toString());
        const resolvedImage = resolveMedia(doc.image, mediaMapping);
        const record = {
          id,
          heading: doc.heading || "Promo",
          description: doc.description || "",
          image: resolvedImage.url,
          imagePublicId: doc.imagePublicId || null,
          imageStoragePath: resolvedImage.storagePath,
          status: mapStatus(doc.status),
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.promoBanner.upsert({ where: { id }, update: record, create: record });
        }
        bannerCount++;
      }
      report.promoBanners = bannerCount;
      log(`  -> Migrated ${bannerCount} promo banners`, "SUCCESS");
    }

    // -------------------------------------------------------------
    // 8. Singletons & Configs (Upsert to prevent duplicates)
    // -------------------------------------------------------------
    {
      log("Processing Singletons (Theme, SEO, Configs)...");

      // Theme
      const themeDoc = await db.collection("themes").findOne({});
      if (themeDoc) {
        const id = getOrCreateUUID("themes", themeDoc._id.toString());
        const record = {
          id,
          primaryColor: themeDoc.primaryColor || "#1B2A4A",
          secondaryColor: themeDoc.secondaryColor || "#243B6A",
          layoutHeader: themeDoc.layoutHeader || "style-1",
          mobileHeader: themeDoc.mobileHeader || "style-1",
          headerStyle: themeDoc.headerStyle || "style-1",
          homeStyle: themeDoc.homeStyle || "home-1",
          logo: themeDoc.logo || "",
          transparentLogo: themeDoc.transparentLogo || "",
          favicon: themeDoc.favicon || "",
          homeBackgroundImage: themeDoc.homeBackgroundImage || "",
          createdAt: mapDate(themeDoc.createdAt) || new Date(),
          updatedAt: mapDate(themeDoc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          const first = await prisma.theme.findFirst();
          if (first) {
            await prisma.theme.update({ where: { id: first.id }, data: record });
          } else {
            await prisma.theme.create({ data: record });
          }
        }
        report.themes = 1;
        log("  -> Theme singleton migrated", "SUCCESS");
      } else {
        report.themes = 0;
      }

      // Global SEO
      const seoDoc = await db.collection("globalseos").findOne({});
      if (seoDoc) {
        const id = getOrCreateUUID("globalSeo", seoDoc._id.toString());
        const record = {
          id,
          siteName: seoDoc.siteName || "",
          siteUrl: seoDoc.siteUrl || "",
          defaultTitle: seoDoc.defaultTitle || "",
          titleTemplate: seoDoc.titleTemplate || "%s",
          defaultDescription: seoDoc.defaultDescription || "",
          defaultKeywords: Array.isArray(seoDoc.defaultKeywords) ? seoDoc.defaultKeywords : [],
          defaultOgImage: seoDoc.defaultOgImage || "",
          twitterHandle: seoDoc.twitterHandle || "",
          favicon: seoDoc.favicon || "",
          socialLinks: seoDoc.socialLinks || {},
          createdAt: mapDate(seoDoc.createdAt) || new Date(),
          updatedAt: mapDate(seoDoc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          const first = await prisma.globalSeo.findFirst();
          if (first) {
            await prisma.globalSeo.update({ where: { id: first.id }, data: record });
          } else {
            await prisma.globalSeo.create({ data: record });
          }
        }
        report.globalSeo = 1;
        log("  -> GlobalSeo singleton migrated", "SUCCESS");
      } else {
        report.globalSeo = 0;
      }

      // RobotsConfig
      const robotsDoc = await db.collection("robotsconfigs").findOne({});
      if (robotsDoc) {
        const id = getOrCreateUUID("robotsConfig", robotsDoc._id.toString());
        const record = {
          id,
          allowCrawlers: robotsDoc.allowCrawlers !== false,
          sitemapUrl: robotsDoc.sitemapUrl || "https://www.codicesconto.com/sitemap.xml",
          disallowPaths: Array.isArray(robotsDoc.disallowPaths) ? robotsDoc.disallowPaths : [],
          additionalRules: robotsDoc.additionalRules || "",
          isActive: robotsDoc.isActive !== false,
          createdAt: mapDate(robotsDoc.createdAt) || new Date(),
          updatedAt: mapDate(robotsDoc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          const first = await prisma.robotsConfig.findFirst();
          if (first) {
            await prisma.robotsConfig.update({ where: { id: first.id }, data: record });
          } else {
            await prisma.robotsConfig.create({ data: record });
          }
        }
        report.robotsConfig = 1;
        log("  -> RobotsConfig singleton migrated", "SUCCESS");
      } else {
        report.robotsConfig = 0;
      }

      // SitemapConfig
      const sitemapDoc = await db.collection("sitemapconfigs").findOne({});
      if (sitemapDoc) {
        const id = getOrCreateUUID("sitemapConfig", sitemapDoc._id.toString());
        const record = {
          id,
          siteUrl: sitemapDoc.siteUrl || "https://www.codicesconto.com",
          includeHome: sitemapDoc.includeHome !== false,
          includeStores: sitemapDoc.includeStores !== false,
          includeCategories: sitemapDoc.includeCategories !== false,
          includeSubcategories: sitemapDoc.includeSubcategories !== false,
          includeBlog: sitemapDoc.includeBlog !== false,
          includeSeoPages: sitemapDoc.includeSeoPages !== false,
          isActive: sitemapDoc.isActive !== false,
          createdAt: mapDate(sitemapDoc.createdAt) || new Date(),
          updatedAt: mapDate(sitemapDoc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          const first = await prisma.sitemapConfig.findFirst();
          if (first) {
            await prisma.sitemapConfig.update({ where: { id: first.id }, data: record });
          } else {
            await prisma.sitemapConfig.create({ data: record });
          }
        }
        report.sitemapConfig = 1;
        log("  -> SitemapConfig singleton migrated", "SUCCESS");
      } else {
        report.sitemapConfig = 0;
      }

      // Redirects
      const redirects = await db.collection("redirects").find({}).toArray();
      let redirectCount = 0;
      for (const doc of redirects) {
        const id = getOrCreateUUID("redirects", doc._id.toString());
        const record = {
          id,
          source: doc.source,
          target: doc.target,
          statusCode: parseInt(doc.statusCode, 10) || 301,
          isActive: doc.isActive !== false,
          notes: doc.notes || "",
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.redirect.upsert({
            where: { source: record.source },
            update: record,
            create: record,
          });
        }
        redirectCount++;
      }
      report.redirects = redirectCount;
      log(`  -> Migrated ${redirectCount} redirects`, "SUCCESS");

      // EmailTemplates
      const emailTemplates = await db.collection("emailtemplates").find({}).toArray();
      let emailTemplateCount = 0;
      for (const doc of emailTemplates) {
        const id = getOrCreateUUID("emailTemplates", doc._id.toString());
        const record = {
          id,
          templateKey: doc.templateKey,
          title: doc.title || "Template",
          fromName: doc.fromName || "CodiceSconto",
          sendAsPlainText: Boolean(doc.sendAsPlainText),
          status: mapStatus(doc.status),
          subject: doc.subject || "",
          message: doc.message || "",
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.emailTemplate.upsert({
            where: { templateKey: record.templateKey },
            update: record,
            create: record,
          });
        }
        emailTemplateCount++;
      }
      report.emailTemplates = emailTemplateCount;
      log(`  -> Migrated ${emailTemplateCount} email templates`, "SUCCESS");

      // SiteSettings (Zero docs currently in Atlas)
      const siteSettingsDoc = await db.collection("sitesettings").findOne({});
      if (siteSettingsDoc) {
        const id = getOrCreateUUID("siteSettings", siteSettingsDoc._id.toString());
        const record = {
          id,
          maintenanceMode: Boolean(siteSettingsDoc.maintenanceMode),
          languageDirection: siteSettingsDoc.languageDirection || "ltr",
          currencySymbol: siteSettingsDoc.currencySymbol || "€",
          currencyPosition: siteSettingsDoc.currencyPosition || "before",
          decimalSeparator: siteSettingsDoc.decimalSeparator || ".",
          decimalNumber: siteSettingsDoc.decimalNumber || 2,
          dateFormat: siteSettingsDoc.dateFormat || "DD/MM/YYYY",
          timeZone: siteSettingsDoc.timeZone || "Europe/Rome",
          defaultPages: siteSettingsDoc.defaultPages || {},
          companyInfo: siteSettingsDoc.companyInfo || {},
          smtp: siteSettingsDoc.smtp || {},
          googleAnalyticsCode: siteSettingsDoc.googleAnalyticsCode || "",
          googleRecaptchaKey: siteSettingsDoc.googleRecaptchaKey || "",
          googleRecaptchaSecret: siteSettingsDoc.googleRecaptchaSecret || "",
          createdAt: mapDate(siteSettingsDoc.createdAt) || new Date(),
          updatedAt: mapDate(siteSettingsDoc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          const first = await prisma.siteSettings.findFirst();
          if (first) {
            await prisma.siteSettings.update({ where: { id: first.id }, data: record });
          } else {
            await prisma.siteSettings.create({ data: record });
          }
        }
        report.siteSettings = 1;
        log("  -> SiteSettings singleton migrated", "SUCCESS");
      } else {
        report.siteSettings = 0;
        log("  -> 0 site settings documents found (gracefully skipped)");
      }

      // SeoPages (Zero docs currently in Atlas)
      const seoPages = await db.collection("seopages").find({}).toArray();
      let seoPagesCount = 0;
      for (const doc of seoPages) {
        const id = getOrCreateUUID("seoPages", doc._id.toString());
        const record = {
          id,
          pageName: doc.pageName || "",
          path: doc.path,
          title: doc.title || "",
          description: doc.description || "",
          keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
          canonicalUrl: doc.canonicalUrl || "",
          robots: doc.robots || {},
          openGraph: doc.openGraph || {},
          twitter: doc.twitter || {},
          schema: doc.schema || {},
          isActive: doc.isActive !== false,
          createdAt: mapDate(doc.createdAt) || new Date(),
          updatedAt: mapDate(doc.updatedAt) || new Date(),
        };
        if (!isDryRun) {
          await prisma.seoPage.upsert({
            where: { path: record.path },
            update: record,
            create: record,
          });
        }
        seoPagesCount++;
      }
      report.seoPages = seoPagesCount;
      log(`  -> Migrated ${seoPagesCount} SEO pages (0 expected)`, "SUCCESS");
    }

    // Persist ID mapping
    const serializedIdMap = {};
    for (const [key, mapInstance] of Object.entries(idMap)) {
      serializedIdMap[key] = Object.fromEntries(mapInstance);
    }
    fs.writeFileSync(ID_MAPPING_FILE, JSON.stringify(serializedIdMap, null, 2), "utf8");

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`================================================================`);
    log(`Data Migration Completed in ${totalDuration}s`, "SUCCESS");
    log(`Report Summary: ${JSON.stringify(report, null, 2)}`);
    log(`ID Mapping stored in: ${ID_MAPPING_FILE}`);
    log(`================================================================`);
  } catch (err) {
    logError("Data migration failed:", err);
    throw err;
  } finally {
    await mongoClient.close();
    if (prisma) await prisma.$disconnect();
  }
}

runDataMigration().catch((err) => {
  logError("Fatal error in migrate-data.js:", err);
  process.exit(1);
});
