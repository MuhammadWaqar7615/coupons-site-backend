import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeSubcategory } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `subcategory:${id}`,
      async () => {
        const subcategory = await prisma.subcategory.findFirst({
          where: {
            OR: [{ id }, { slug: id }],
          },
          include: {
            parentCategory: { select: { id: true, title: true, slug: true } },
          },
        });

        if (!subcategory) return null;
        return { subcategory: serializeSubcategory(subcategory) };
      },
      3600,
      CACHE_TAGS.SUBCATEGORIES
    );

    if (!data) return NextResponse.json({ message: "Subcategory not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/subcategories/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const currentSub = await prisma.subcategory.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });
    if (!currentSub) return NextResponse.json({ message: "Subcategory not found" }, { status: 404 });

    const body = await request.json();
    if (!body.title?.trim()) return NextResponse.json({ message: "Title is required." }, { status: 400 });

    const parentId = body.parentCategoryId || body.parentCategory;
    if (parentId) {
      const parentExists = await prisma.category.findUnique({
        where: { id: parentId },
      });
      if (!parentExists) {
        return NextResponse.json({ message: "A valid parent category is required." }, { status: 400 });
      }
    }

    const updateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (parentId !== undefined) updateData.parentCategoryId = parentId;
    if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle || null;
    if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription || null;
    if (body.status !== undefined) {
      updateData.status = (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED";
    }

    const subcategory = await prisma.subcategory.update({
      where: { id: currentSub.id },
      data: updateData,
      include: {
        parentCategory: { select: { id: true, title: true, slug: true } },
      },
    });

    appCache.invalidateTag(CACHE_TAGS.SUBCATEGORIES);
    return NextResponse.json({ subcategory: serializeSubcategory(subcategory) });
  } catch (error) {
    console.error("PUT /api/subcategories/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const subcategory = await prisma.subcategory.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });
    if (!subcategory) return NextResponse.json({ message: "Subcategory not found" }, { status: 404 });

    await prisma.subcategory.delete({
      where: { id: subcategory.id },
    });

    appCache.invalidateTag(CACHE_TAGS.SUBCATEGORIES);
    return NextResponse.json({ message: "Subcategory deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/subcategories/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
