import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const dbConfig = await prisma.robotsConfig.findFirst();
    const config = dbConfig || defaults;

    if (!config.isActive) {
      return new NextResponse("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
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

    return new NextResponse(`${lines.join("\n")}\n`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("GET /robots.txt Error:", error);
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
