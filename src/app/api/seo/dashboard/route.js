import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const [globalSeo, pageSeoCount, activePageSeoCount, redirectCount, activeRedirectCount] = await Promise.all([
      prisma.globalSeo.findFirst(),
      prisma.seoPage.count(),
      prisma.seoPage.count({ where: { isActive: true } }),
      prisma.redirect.count(),
      prisma.redirect.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      globalSeo: Boolean(globalSeo),
      pageSeoCount,
      activePageSeoCount,
      redirectCount,
      activeRedirectCount,
      sitemapEnabled: true,
    });
  } catch (error) {
    console.error("GET /api/seo/dashboard Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
