import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeKeywords(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSocialLinks(value = {}) {
  return {
    facebook: String(value?.facebook || "").trim(),
    instagram: String(value?.instagram || "").trim(),
    linkedin: String(value?.linkedin || "").trim(),
    youtube: String(value?.youtube || "").trim(),
    twitter: String(value?.twitter || "").trim(),
  };
}

export async function GET() {
  try {
    const settings = await prisma.globalSeo.findFirst();

    return NextResponse.json({
      settings: settings
        ? {
            ...settings,
            _id: settings.id,
            defaultKeywords: settings.defaultKeywords || [],
            socialLinks: settings.socialLinks || {},
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/seo/global Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();

    if (!body.siteName?.trim()) {
      return NextResponse.json({ message: "Site name is required." }, { status: 400 });
    }

    if (!body.siteUrl?.trim()) {
      return NextResponse.json({ message: "Site URL is required." }, { status: 400 });
    }

    const payload = {
      siteName: body.siteName.trim(),
      siteUrl: body.siteUrl.trim(),
      defaultTitle: String(body.defaultTitle || "").trim(),
      titleTemplate: String(body.titleTemplate || "%s").trim() || "%s",
      defaultDescription: String(body.defaultDescription || "").trim(),
      defaultKeywords: normalizeKeywords(body.defaultKeywords),
      defaultOgImage: String(body.defaultOgImage || "").trim(),
      twitterHandle: String(body.twitterHandle || "").trim(),
      favicon: String(body.favicon || "").trim(),
      socialLinks: normalizeSocialLinks(body.socialLinks),
    };

    const existing = await prisma.globalSeo.findFirst();
    let settings;
    if (existing) {
      settings = await prisma.globalSeo.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      settings = await prisma.globalSeo.create({
        data: payload,
      });
    }

    return NextResponse.json({
      message: "Global SEO settings saved successfully.",
      settings: { ...settings, _id: settings.id },
    });
  } catch (error) {
    console.error("POST /api/seo/global Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
