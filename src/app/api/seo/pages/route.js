import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { appCache, CACHE_TAGS } from "@/lib/cache";

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

function isValidUrl(value) {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const data = await appCache.wrap(
      "seo:pages:all",
      async () => {
        const pages = await prisma.seoPage.findMany({
          orderBy: { pageName: "asc" },
        });

        return {
          pages: pages.map((page) => ({
            ...page,
            _id: page.id,
          })),
        };
      },
      300,
      CACHE_TAGS.SEO
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/seo/pages Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();

    if (!body.pageName?.trim()) {
      return NextResponse.json({ message: "Page name is required." }, { status: 400 });
    }

    if (!body.path?.trim()) {
      return NextResponse.json({ message: "Page path is required." }, { status: 400 });
    }

    const normalizedPath = String(body.path).trim().toLowerCase();
    if (!normalizedPath.startsWith("/")) {
      return NextResponse.json({ message: "Page path must start with /." }, { status: 400 });
    }

    if (body.isActive && !body.title?.trim()) {
      return NextResponse.json({ message: "SEO title is required when the page is active." }, { status: 400 });
    }

    if (body.canonicalUrl && !isValidUrl(body.canonicalUrl)) {
      return NextResponse.json({ message: "Canonical URL is invalid." }, { status: 400 });
    }

    const existing = await prisma.seoPage.findUnique({
      where: { path: normalizedPath },
    });
    if (existing) {
      return NextResponse.json({ message: "A page SEO record for this path already exists." }, { status: 409 });
    }

    const payload = {
      pageName: body.pageName.trim(),
      path: normalizedPath,
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      keywords: normalizeKeywords(body.keywords),
      canonicalUrl: String(body.canonicalUrl || "").trim(),
      robots: {
        index: Boolean(body.robots?.index ?? true),
        follow: Boolean(body.robots?.follow ?? true),
        noarchive: Boolean(body.robots?.noarchive ?? false),
        nosnippet: Boolean(body.robots?.nosnippet ?? false),
        noimageindex: Boolean(body.robots?.noimageindex ?? false),
      },
      openGraph: {
        title: String(body.openGraph?.title || "").trim(),
        description: String(body.openGraph?.description || "").trim(),
        image: String(body.openGraph?.image || "").trim(),
        type: String(body.openGraph?.type || "website").trim(),
      },
      twitter: {
        card: String(body.twitter?.card || "summary_large_image").trim(),
        title: String(body.twitter?.title || "").trim(),
        description: String(body.twitter?.description || "").trim(),
        image: String(body.twitter?.image || "").trim(),
      },
      schema: body.schema || {},
      isActive: Boolean(body.isActive ?? true),
    };

    const page = await prisma.seoPage.create({
      data: payload,
    });

    appCache.invalidateTag(CACHE_TAGS.SEO);
    appCache.invalidateTag(CACHE_TAGS.SITEMAP);

    return NextResponse.json({
      message: "SEO page created successfully.",
      page: { ...page, _id: page.id },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/seo/pages Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
