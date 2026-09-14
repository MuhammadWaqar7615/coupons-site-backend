/**
 * Ultra-fast zero-dependency In-Memory Cache for Next.js API Routes.
 * Supports TTL expiration, tag-based group invalidation, and global singleton persistence.
 */

export const CACHE_TAGS = {
  SLIDERS: "sliders",
  STORES: "stores",
  COUPONS: "coupons",
  CATEGORIES: "categories",
  SUBCATEGORIES: "subcategories",
  THEME: "theme",
  SETTINGS: "settings",
  BADGES: "badges",
  BANNERS: "banners",
  BLOG: "blog",
  SEO: "seo",
  SITEMAP: "sitemap",
  ROBOTS: "robots",
  TRANSLATIONS: "translations",
  EMAIL_TEMPLATES: "email_templates",
  USERS: "users",
};

class MemoryCache {
  constructor() {
    this.store = new Map();
    this.tagIndex = new Map(); // tag -> Set of keys

    // Periodically prune expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      const timer = setInterval(() => this.pruneExpired(), 5 * 60 * 1000);
      if (timer.unref) timer.unref();
    }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlSeconds = 300, tags = []) {
    // Delete existing entry if any to maintain tag index
    if (this.store.has(key)) {
      this.delete(key);
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    const tagList = Array.isArray(tags) ? tags : [tags];

    this.store.set(key, {
      value,
      expiresAt,
      tags: tagList,
    });

    for (const tag of tagList) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag).add(key);
    }

    return value;
  }

  delete(key) {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(key);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }

    return this.store.delete(key);
  }

  invalidateTag(tag) {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;

    for (const key of Array.from(keys)) {
      this.store.delete(key);
    }
    this.tagIndex.delete(tag);
  }

  invalidateTags(tags) {
    for (const tag of tags) {
      this.invalidateTag(tag);
    }
  }

  clear() {
    this.store.clear();
    this.tagIndex.clear();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
      }
    }
  }

  /**
   * Helper to get cached data or execute fetcher and store result.
   */
  async wrap(key, fetcher, ttlSeconds = 300, tags = []) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      this.set(key, fresh, ttlSeconds, tags);
    }
    return fresh;
  }
}

// Global singleton to survive dev hot-reloads and module re-evaluations
const globalForCache = globalThis;
export const appCache = globalForCache.__appCache ?? new MemoryCache();

if (process.env.NODE_ENV !== "production") {
  globalForCache.__appCache = appCache;
}

export default appCache;
