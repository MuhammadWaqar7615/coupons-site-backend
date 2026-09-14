import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaults = {
  allowCrawlers: true,
  sitemapUrl: "https://www.codicesconto.com/sitemap.xml",
  disallowPaths: ["/api/", "/dashboard/", "/account/"],
  additionalRules: "",
  isActive: true,
};

export async function GET() {
  try {
    const text = await appCache.wrap(
      "robots_txt",
      async () => {
        const dbConfig = await prisma.robotsConfig.findFirst();
        const config = dbConfig || defaults;

        if (!config.isActive) {
          return "User-agent: *\nDisallow: /\n";
        }

        const lines = ["User-agent: *"];

        if (!config.allowCrawlers) {
          lines.push("Disallow: /");
        } else {
          const disallows =
            Array.isArray(config.disallowPaths) && config.disallowPaths.length
              ? config.disallowPaths.map((path) => `Disallow: ${path}`)
              : ["Disallow: /api/", "Disallow: /dashboard/", "Disallow: /account/"];
          lines.push(...disallows);
        }

        if (config.sitemapUrl) {
          lines.push(`Sitemap: ${config.sitemapUrl}`);
        }

        if (config.additionalRules) {
          lines.push(config.additionalRules);
        }

        return `${lines.join("\n")}\n`;
      },
      3600,
      [CACHE_TAGS.ROBOTS, CACHE_TAGS.SEO]
    );

    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("GET /robots.txt Error:", error);
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
