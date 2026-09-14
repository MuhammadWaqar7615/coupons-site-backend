import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeSubcategory } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const parentCategory = searchParams.get("parentCategory") || searchParams.get("categoryId");

    const cacheKey = `subcategories:${status || "all"}:${parentCategory || "all"}`;
    const data = await appCache.wrap(
      cacheKey,
      async () => {
        const where = {};
        if (["enabled", "disabled"].includes(status?.toLowerCase())) {
          where.status = status.toUpperCase();
        }
        if (parentCategory) {
          where.parentCategoryId = parentCategory;
        }

        const subcategories = await prisma.subcategory.findMany({
          where,
          include: {
            parentCategory: { select: { id: true, title: true, slug: true } },
          },
          orderBy: { title: "asc" },
        });

        return {
          subcategories: subcategories.map(serializeSubcategory),
        };
      },
      3600,
      CACHE_TAGS.SUBCATEGORIES
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/subcategories Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ message: "Title is required." }, { status: 400 });
    }

    const parentId = body.parentCategoryId || body.parentCategory;
    if (!parentId) {
      return NextResponse.json({ message: "A valid parent category is required." }, { status: 400 });
    }

    const parentExists = await prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parentExists) {
      return NextResponse.json({ message: "Parent category not found." }, { status: 400 });
    }

    const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const existingSub = await prisma.subcategory.findUnique({
      where: { slug },
    });
    if (existingSub) {
      return NextResponse.json({ message: "Subcategory with this slug already exists." }, { status: 409 });
    }

    const subcategory = await prisma.subcategory.create({
      data: {
        title: body.title,
        slug,
        description: body.description || null,
        parentCategoryId: parentId,
        seoTitle: body.seoTitle || null,
        seoDescription: body.seoDescription || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
      include: {
        parentCategory: { select: { id: true, title: true, slug: true } },
      },
    });

    appCache.invalidateTag(CACHE_TAGS.SUBCATEGORIES);
    return NextResponse.json({ subcategory: serializeSubcategory(subcategory) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/subcategories Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
