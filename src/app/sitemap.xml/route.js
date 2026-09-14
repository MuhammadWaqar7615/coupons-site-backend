import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildUrlEntry(url, lastmod) {
  return `  <url>\n    <loc>${url}</loc>\n    ${
    lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ""
  }  </url>`;
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

export async function GET() {
  try {
    const xml = await appCache.wrap(
      "sitemap_xml",
      async () => {
        const dbConfig = await prisma.sitemapConfig.findFirst();
        const config = dbConfig || defaults;

        if (!config.isActive) {
          return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
        }

        const baseUrl = config.siteUrl.replace(/\/$/, "");
        const entries = [];

        if (config.includeHome) {
          entries.push(buildUrlEntry(`${baseUrl}/`, new Date().toISOString()));
        }

        // Parallelize all queries across tables
        const [stores, categories, subcategories, posts, seoPages] = await Promise.all([
          config.includeStores
            ? prisma.store.findMany({
                where: { isActive: true },
                select: { slug: true, updatedAt: true },
              })
            : Promise.resolve([]),
          config.includeCategories
            ? prisma.category.findMany({
                where: { status: "ENABLED" },
                select: { slug: true, updatedAt: true },
              })
            : Promise.resolve([]),
          config.includeSubcategories
            ? prisma.subcategory.findMany({
                where: { status: "ENABLED" },
                include: {
                  parentCategory: { select: { slug: true } },
                },
              })
            : Promise.resolve([]),
          config.includeBlog
            ? prisma.blogPost.findMany({
                where: { status: "ENABLED" },
                select: { title: true, updatedAt: true },
              })
            : Promise.resolve([]),
          config.includeSeoPages
            ? prisma.seoPage.findMany({
                where: { isActive: true },
                select: { path: true, updatedAt: true },
              })
            : Promise.resolve([]),
        ]);

        stores.forEach((store) =>
          entries.push(
            buildUrlEntry(
              `${baseUrl}/store/${store.slug}`,
              store.updatedAt ? new Date(store.updatedAt).toISOString() : undefined
            )
          )
        );

        categories.forEach((category) =>
          entries.push(
            buildUrlEntry(
              `${baseUrl}/offerte/${category.slug}`,
              category.updatedAt ? new Date(category.updatedAt).toISOString() : undefined
            )
          )
        );

        subcategories.forEach((subcategory) => {
          const parentSlug = subcategory.parentCategory?.slug || "offerte";
          entries.push(
            buildUrlEntry(
              `${baseUrl}/offerte/${parentSlug}/${subcategory.slug}`,
              subcategory.updatedAt ? new Date(subcategory.updatedAt).toISOString() : undefined
            )
          );
        });

        posts.forEach((post) => {
          const slug = String(post.title || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          entries.push(
            buildUrlEntry(
              `${baseUrl}/blog/${slug || "post"}`,
              post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined
            )
          );
        });

        seoPages.forEach((page) =>
          entries.push(
            buildUrlEntry(
              `${baseUrl}${page.path}`,
              page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined
            )
          )
        );

        return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join(
          "\n"
        )}\n</urlset>`;
      },
      3600,
      [CACHE_TAGS.SITEMAP, CACHE_TAGS.STORES, CACHE_TAGS.CATEGORIES, CACHE_TAGS.BLOG, CACHE_TAGS.SEO]
    );

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("GET /sitemap.xml Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
