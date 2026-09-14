import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase, queueDeleteFromSupabase } from "@/lib/supabase";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeCategory(c) {
  const subcategories = (c.subcategories || []).map((sub) => ({
    ...sub,
    _id: sub.id,
    status: sub.status ? sub.status.toLowerCase() : "enabled",
  }));

  const stores = (c.stores || []).map((s) => ({
    ...(s.store || s),
    _id: s.store?.id || s.storeId,
  }));

  return {
    ...c,
    _id: c.id,
    status: c.status ? c.status.toLowerCase() : "enabled",
    subcategories,
    subs: subcategories,
    stores,
  };
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `category:${id}`,
      async () => {
        const category = await prisma.category.findFirst({
          where: {
            OR: [{ id }, { slug: id }],
          },
          include: {
            subcategories: {
              orderBy: { title: "asc" },
            },
            stores: {
              include: {
                store: {
                  select: { id: true, name: true, slug: true, logoPath: true, isActive: true },
                },
              },
            },
          },
        });

        if (!category) return null;
        return { category: serializeCategory(category) };
      },
      3600,
      CACHE_TAGS.CATEGORIES
    );

    if (!data) return NextResponse.json({ message: "Category not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/categories/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const currentCategory = await prisma.category.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });
    if (!currentCategory) return NextResponse.json({ message: "Category not found" }, { status: 404 });

    const body = await request.json();

    // Check if image changed and delete old image from Supabase in background
    const oldPath = currentCategory.imageStoragePath || currentCategory.imagePublicId;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      queueDeleteFromSupabase("store-images", oldPath);
    }

    const updateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.icon !== undefined) updateData.icon = body.icon || null;
    if (body.showInMenu !== undefined) updateData.showInMenu = Boolean(body.showInMenu);
    if (body.featured !== undefined) updateData.featured = Boolean(body.featured);
    if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle || null;
    if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription || null;
    if (body.status !== undefined) {
      updateData.status = (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED";
    }
    if (body.image !== undefined) updateData.image = body.image;
    if (newPath !== undefined) {
      updateData.imagePublicId = body.imagePublicId || null;
      updateData.imageStoragePath = newPath || null;
    }

    const updated = await prisma.category.update({
      where: { id: currentCategory.id },
      data: updateData,
    });

    appCache.invalidateTag(CACHE_TAGS.CATEGORIES);
    return NextResponse.json({ category: serializeCategory(updated) });
  } catch (error) {
    console.error("PUT /api/categories/[id] Error:", error);
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

    const categoryToDelete = await prisma.category.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });
    if (!categoryToDelete) return NextResponse.json({ message: "Category not found" }, { status: 404 });

    // Clean up Supabase storage in background without blocking HTTP response
    const path = categoryToDelete.imageStoragePath || categoryToDelete.imagePublicId;
    if (path) {
      queueDeleteFromSupabase("store-images", path);
    }

    await prisma.category.delete({
      where: { id: categoryToDelete.id },
    });

    appCache.invalidateTag(CACHE_TAGS.CATEGORIES);
    return NextResponse.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/categories/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
