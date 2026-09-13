import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";

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
    const config = await prisma.robotsConfig.findFirst();

    return NextResponse.json({
      config: config
        ? { ...config, _id: config.id }
        : defaults,
    });
  } catch (error) {
    console.error("GET /api/seo/robots Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();

    const payload = {
      allowCrawlers: Boolean(body.allowCrawlers ?? true),
      sitemapUrl: String(body.sitemapUrl || "https://www.codicesconto.com/sitemap.xml").trim(),
      disallowPaths: Array.isArray(body.disallowPaths)
        ? body.disallowPaths.map((path) => String(path).trim()).filter(Boolean)
        : defaults.disallowPaths,
      additionalRules: String(body.additionalRules || "").trim(),
      isActive: Boolean(body.isActive ?? true),
    };

    const existing = await prisma.robotsConfig.findFirst();
    let config;
    if (existing) {
      config = await prisma.robotsConfig.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      config = await prisma.robotsConfig.create({
        data: payload,
      });
    }

    return NextResponse.json({
      message: "Robots configuration saved successfully.",
      config: { ...config, _id: config.id },
    });
  } catch (error) {
    console.error("POST /api/seo/robots Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
