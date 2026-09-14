import { prisma } from "./prisma";
import { appCache, CACHE_TAGS } from "./cache";
import {
  serializeStore,
  serializeCoupon,
  serializeCategory,
  serializeSubcategory,
  serializeSlider,
  serializeBanner,
  serializeBadge,
  serializePost,
  serializeUser,
} from "./serializer";
import { translationDefaults } from "./translations";
import { emailTemplateDefaults } from "./emailTemplates";

let isWarming = false;

export async function prewarmCoreCache() {
  if (isWarming) return;
  isWarming = true;

  try {
    // 1. Pre-warm Stores
    try {
      const stores = await prisma.store.findMany({
        orderBy: { name: "asc" },
        include: {
          categories: { include: { category: true } },
          subcategories: { select: { subcategoryId: true } },
          coupons: { where: { isActive: true } },
        },
      });
      appCache.set(
        "stores:all:::all:all",
        { stores: stores.map(serializeStore) },
        3600,
        CACHE_TAGS.STORES
      );
    } catch (e) {
      // non-blocking
    }

    // 2. Pre-warm Coupons
    try {
      const coupons = await prisma.coupon.findMany({
        include: {
          store: {
            select: { id: true, name: true, slug: true, logoPath: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      appCache.set(
        "coupons:all",
        { success: true, data: coupons.map(serializeCoupon) },
        3600,
        CACHE_TAGS.COUPONS
      );
    } catch (e) {
      // non-blocking
    }

    // 3. Pre-warm Categories & Subcategories
    try {
      const categories = await prisma.category.findMany({
        orderBy: { title: "asc" },
        include: {
          subcategories: true,
          stores: {
            include: {
              store: {
                include: {
                  coupons: { where: { isActive: true } },
                },
              },
            },
          },
        },
      });
      appCache.set(
        "categories:all:null",
        { categories: categories.map(serializeCategory) },
        3600,
        CACHE_TAGS.CATEGORIES
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const subcategories = await prisma.subcategory.findMany({
        orderBy: { title: "asc" },
        include: { parentCategory: true },
      });
      appCache.set(
        "subcategories:all:null",
        { subcategories: subcategories.map(serializeSubcategory) },
        3600,
        CACHE_TAGS.SUBCATEGORIES
      );
    } catch (e) {
      // non-blocking
    }

    // 4. Pre-warm UI Assets: Sliders, Badges, Banners, Blog
    try {
      const sliders = await prisma.slider.findMany({
        orderBy: { createdAt: "asc" },
      });
      appCache.set(
        "sliders:all",
        { sliders: sliders.map(serializeSlider) },
        3600,
        CACHE_TAGS.SLIDERS
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const badges = await prisma.badge.findMany({
        orderBy: { createdAt: "desc" },
      });
      appCache.set(
        "badges:all",
        { badges: badges.map(serializeBadge) },
        3600,
        CACHE_TAGS.BADGES
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const banners = await prisma.promoBanner.findMany({
        orderBy: { createdAt: "desc" },
      });
      appCache.set(
        "banners:all",
        { banners: banners.map(serializeBanner) },
        3600,
        CACHE_TAGS.BANNERS
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const posts = await prisma.blogPost.findMany({
        orderBy: { createdAt: "desc" },
      });
      appCache.set(
        "blog:all:1:100",
        { posts: posts.map(serializePost), total: posts.length },
        3600,
        CACHE_TAGS.BLOG
      );
    } catch (e) {
      // non-blocking
    }

    // 5. Pre-warm Site Settings & Theme
    try {
      const theme = await prisma.theme.findFirst();
      if (theme) {
        appCache.set("theme:active", { theme: { ...theme, _id: theme.id } }, 3600, CACHE_TAGS.THEME);
      }
    } catch (e) {
      // non-blocking
    }

    try {
      const settings = await prisma.siteSettings.findFirst();
      if (settings) {
        appCache.set(
          "settings:global",
          { settings: { ...settings, _id: settings.id } },
          3600,
          CACHE_TAGS.SETTINGS
        );
      }
    } catch (e) {
      // non-blocking
    }

    // 6. Pre-warm Admin Dashboard Elements: SEO, Translations, Email Templates, Users
    try {
      const globalSeo = await prisma.globalSeo.findFirst();
      const pageSeoCount = await prisma.seoPage.count();
      const activePageSeoCount = await prisma.seoPage.count({ where: { isActive: true } });
      const redirectCount = await prisma.redirect.count();
      const activeRedirectCount = await prisma.redirect.count({ where: { isActive: true } });

      appCache.set(
        "seo_dashboard",
        {
          globalSeo: Boolean(globalSeo),
          pageSeoCount,
          activePageSeoCount,
          redirectCount,
          activeRedirectCount,
          sitemapEnabled: true,
        },
        3600,
        CACHE_TAGS.SEO
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const saved = await prisma.translation.findMany({ orderBy: { key: "asc" } });
      const savedByKey = new Map(saved.map((item) => [item.key, item]));
      const translations = translationDefaults.map(([key, source]) => ({
        key,
        source,
        value: savedByKey.get(key)?.value || "",
      }));
      appCache.set("translations:all", { translations }, 3600, CACHE_TAGS.TRANSLATIONS);
    } catch (e) {
      // non-blocking
    }

    try {
      const savedTemplates = await prisma.emailTemplate.findMany();
      const byKey = new Map(savedTemplates.map((template) => [template.templateKey, template]));
      const templates = emailTemplateDefaults.map((template) => {
        const dbItem = byKey.get(template.templateKey);
        return {
          ...template,
          fromName: dbItem?.fromName || "CodiceSconto",
          sendAsPlainText: dbItem?.sendAsPlainText || false,
          status: dbItem?.status ? dbItem.status.toLowerCase() : "enabled",
          subject: dbItem?.subject || template.subject,
          message: dbItem?.message || template.message,
          _id: dbItem?.id || template.templateKey,
        };
      });
      appCache.set("email-templates:all", { templates }, 3600, CACHE_TAGS.EMAIL_TEMPLATES);
    } catch (e) {
      // non-blocking
    }

    try {
      const userList = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
      appCache.set("users:all", userList.map(serializeUser), 3600, CACHE_TAGS.USERS);
      for (const u of userList) {
        appCache.set(`user_auth:${u.email.toLowerCase()}`, u, 3600, CACHE_TAGS.USERS);
        appCache.set(`user:${u.id}`, serializeUser(u), 3600, CACHE_TAGS.USERS);
      }
    } catch (e) {
      // non-blocking
    }

    try {
      const seoPages = await prisma.seoPage.findMany({ orderBy: { pageName: "asc" } });
      appCache.set(
        "seo:pages:all",
        { pages: seoPages.map((page) => ({ ...page, _id: page.id })) },
        3600,
        CACHE_TAGS.SEO
      );
    } catch (e) {
      // non-blocking
    }

    try {
      const redirects = await prisma.redirect.findMany({ orderBy: { source: "asc" } });
      appCache.set(
        "seo:redirects:all",
        { redirects: redirects.map((redirect) => ({ ...redirect, _id: redirect.id })) },
        3600,
        CACHE_TAGS.SEO
      );
    } catch (e) {
      // non-blocking
    }

    console.log("[CACHE WARMUP] All core collections successfully pre-warmed into memory.");
  } catch (err) {
    console.warn("[CACHE WARMUP] Background pre-warm encountered an error:", err?.message || err);
  } finally {
    isWarming = false;
  }
}

export function triggerWarmup() {
  if (globalThis.__cachePrewarmScheduled) return;
  globalThis.__cachePrewarmScheduled = true;

  // Run in next event tick without blocking request thread
  setTimeout(() => {
    prewarmCoreCache().catch(() => {});
  }, 100);
}
