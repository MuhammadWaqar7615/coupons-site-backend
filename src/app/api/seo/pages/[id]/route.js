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

function isValidUrl(value) {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const page = await prisma.seoPage.findUnique({
      where: { id },
    });

    if (!page) {
      return NextResponse.json({ message: "SEO page not found" }, { status: 404 });
    }

    return NextResponse.json({ page: { ...page, _id: page.id } });
  } catch (error) {
    console.error("GET /api/seo/pages/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { id } = await params;
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

    const conflict = await prisma.seoPage.findFirst({
      where: {
        path: normalizedPath,
        NOT: { id },
      },
    });
    if (conflict) {
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

    const page = await prisma.seoPage.update({
      where: { id },
      data: payload,
    });

    return NextResponse.json({
      message: "SEO page updated successfully.",
      page: { ...page, _id: page.id },
    });
  } catch (error) {
    console.error("PUT /api/seo/pages/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { id } = await params;

    const existing = await prisma.seoPage.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ message: "SEO page not found" }, { status: 404 });
    }

    await prisma.seoPage.delete({
      where: { id },
    });

    return NextResponse.json({ message: "SEO page deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/seo/pages/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
