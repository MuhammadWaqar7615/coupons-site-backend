import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const dbConfig = await prisma.sitemapConfig.findFirst();
    const config = dbConfig || defaults;

    if (!config.isActive) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`,
        {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
          },
        }
      );
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
        entries.push(
          buildUrlEntry(
            `${baseUrl}/store/${store.slug}`,
            store.updatedAt ? new Date(store.updatedAt).toISOString() : undefined
          )
        )
      );
    }

    if (config.includeCategories) {
      const categories = await prisma.category.findMany({
        where: { status: "ENABLED" },
        select: { slug: true, updatedAt: true },
      });
      categories.forEach((category) =>
        entries.push(
          buildUrlEntry(
            `${baseUrl}/offerte/${category.slug}`,
            category.updatedAt ? new Date(category.updatedAt).toISOString() : undefined
          )
        )
      );
    }

    if (config.includeSubcategories) {
      const subcategories = await prisma.subcategory.findMany({
        where: { status: "ENABLED" },
        include: {
          parentCategory: { select: { slug: true } },
        },
      });
      subcategories.forEach((subcategory) => {
        const parentSlug = subcategory.parentCategory?.slug || "offerte";
        entries.push(
          buildUrlEntry(
            `${baseUrl}/offerte/${parentSlug}/${subcategory.slug}`,
            subcategory.updatedAt ? new Date(subcategory.updatedAt).toISOString() : undefined
          )
        );
      });
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
        entries.push(
          buildUrlEntry(
            `${baseUrl}/blog/${slug || "post"}`,
            post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined
          )
        );
      });
    }

    if (config.includeSeoPages) {
      const seoPages = await prisma.seoPage.findMany({
        where: { isActive: true },
        select: { path: true, updatedAt: true },
      });
      seoPages.forEach((page) =>
        entries.push(
          buildUrlEntry(
            `${baseUrl}${page.path}`,
            page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined
          )
        )
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join(
      "\n"
    )}\n</urlset>`;

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
