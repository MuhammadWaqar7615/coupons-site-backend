import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildUrlEntry(url, lastmod) {
  return `  <url>\n    <loc>${url}</loc>\n    ${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ""}  </url>`;
}

const defaults = {
  siteUrl: "https://www.codicesconto.com",
  includeHome: true,
  includeStores: true,
  includeCategories: true,
  includeSubcategories: true,
  includeBlog: true,
  includeSeoPages: true,
  isActive: true,
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const accept = request.headers.get("accept") || "";

    const config = await appCache.wrap(
      "seo:sitemap:config",
      async () => {
        const dbConfig = await prisma.sitemapConfig.findFirst();
        return dbConfig || defaults;
      },
      300,
      CACHE_TAGS.SEO
    );

    const wantsXml = format === "xml" || (accept.includes("application/xml") && !accept.includes("application/json"));

    // If client does not explicitly want XML (e.g. SitemapForm.jsx fetching JSON settings), return JSON config
    if (!wantsXml) {
      return NextResponse.json({
        config: config ? { ...config, _id: config.id } : defaults,
      });
    }

    if (!config.isActive) {
      return NextResponse.json({ message: "Sitemap generation is disabled." }, { status: 403 });
    }

    const baseUrl = config.siteUrl.replace(/\/$/, "");
    const entries = [];

    if (config.includeHome) {
      entries.push(buildUrlEntry(`${baseUrl}/`, new Date().toISOString()));
    }

    if (config.includeStores) {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      });
      stores.forEach((store) =>
        entries.push(buildUrlEntry(`${baseUrl}/negozi/${store.slug}`, store.updatedAt ? new Date(store.updatedAt).toISOString() : undefined))
      );
    }

    if (config.includeCategories) {
      const categories = await prisma.category.findMany({
        where: { status: "ENABLED" },
        select: { slug: true, updatedAt: true },
      });
      categories.forEach((category) =>
        entries.push(buildUrlEntry(`${baseUrl}/categorie/${category.slug}`, category.updatedAt ? new Date(category.updatedAt).toISOString() : undefined))
      );
    }

    if (config.includeSubcategories) {
      const subcategories = await prisma.subcategory.findMany({
        where: { status: "ENABLED" },
        select: { slug: true, updatedAt: true },
      });
      subcategories.forEach((subcategory) =>
        entries.push(buildUrlEntry(`${baseUrl}/categorie/${subcategory.slug}`, subcategory.updatedAt ? new Date(subcategory.updatedAt).toISOString() : undefined))
      );
    }

    if (config.includeBlog) {
      const posts = await prisma.blogPost.findMany({
        where: { status: "ENABLED" },
        select: { title: true, updatedAt: true },
      });
      posts.forEach((post) => {
        const slug = String(post.title || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        entries.push(buildUrlEntry(`${baseUrl}/blog/${slug || "post"}`, post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined));
      });
    }

    if (config.includeSeoPages) {
      const seoPages = await prisma.seoPage.findMany({
        where: { isActive: true },
        select: { path: true, updatedAt: true },
      });
      seoPages.forEach((page) =>
        entries.push(buildUrlEntry(`${baseUrl}${page.path}`, page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined))
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/seo/sitemap Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    const payload = {
      siteUrl: String(body.siteUrl || defaults.siteUrl).trim(),
      includeHome: Boolean(body.includeHome ?? true),
      includeStores: Boolean(body.includeStores ?? true),
      includeCategories: Boolean(body.includeCategories ?? true),
      includeSubcategories: Boolean(body.includeSubcategories ?? true),
      includeBlog: Boolean(body.includeBlog ?? true),
      includeSeoPages: Boolean(body.includeSeoPages ?? true),
      isActive: Boolean(body.isActive ?? true),
    };

    const existing = await prisma.sitemapConfig.findFirst();
    let config;
    if (existing) {
      config = await prisma.sitemapConfig.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      config = await prisma.sitemapConfig.create({
        data: payload,
      });
    }

    appCache.invalidateTag(CACHE_TAGS.SEO);
    appCache.invalidateTag(CACHE_TAGS.SITEMAP);

    return NextResponse.json({
      message: "Sitemap configuration saved successfully.",
      config: { ...config, _id: config.id },
    });
  } catch (error) {
    console.error("POST /api/seo/sitemap Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
