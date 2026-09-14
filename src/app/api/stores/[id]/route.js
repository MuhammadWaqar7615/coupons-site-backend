import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { handleAuthError } from "@/lib/api-errors";
import { deleteFromSupabase } from "@/lib/supabase";
import { serializeStore } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const data = await appCache.wrap(
      `store:${id}`,
      async () => {
        const store = await prisma.store.findFirst({
          where: {
            OR: [{ id }, { slug: id }],
          },
          include: {
            categories: { include: { category: true } },
            subcategories: { include: { subcategory: true } },
            coupons: {
              where: { isActive: true },
              orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
            },
          },
        });

        if (!store) return null;
        return { store: serializeStore(store) };
      },
      3600,
      CACHE_TAGS.STORES
    );

    if (!data) {
      return NextResponse.json({ message: "Store not found" }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("GET /api/stores/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { id } = await params;
    const data = await request.json();

    const currentStore = await prisma.store.findUnique({
      where: { id },
    });
    if (!currentStore) {
      return NextResponse.json({ message: "Store not found" }, { status: 404 });
    }

    if (data.slug && data.slug !== currentStore.slug) {
      const existingStore = await prisma.store.findFirst({
        where: {
          slug: data.slug,
          NOT: { id },
        },
      });
      if (existingStore) {
        return NextResponse.json(
          { message: "A store with this slug already exists." },
          { status: 409 }
        );
      }
    }

    const oldLogoPath = currentStore.logoStoragePath || currentStore.logoPublicId;
    const newLogoPath = data.logoStoragePath || data.logoPublicId;
    if (oldLogoPath && newLogoPath && oldLogoPath !== newLogoPath) {
      await deleteFromSupabase("store-images", oldLogoPath);
    }

    const {
      categories,
      subcategories,
      id: _bodyId,
      _id,
      createdAt,
      updatedAt,
      coupons,
      ...storeFields
    } = data;

    const updatedStore = await prisma.$transaction(
      async (tx) => {
        if (Array.isArray(categories)) {
          await tx.storeCategory.deleteMany({ where: { storeId: id } });
          if (categories.length > 0) {
            await tx.storeCategory.createMany({
              data: categories.map((catId) => ({ storeId: id, categoryId: catId })),
            });
          }
        }

        if (Array.isArray(subcategories)) {
          await tx.storeSubcategory.deleteMany({ where: { storeId: id } });
          if (subcategories.length > 0) {
            await tx.storeSubcategory.createMany({
              data: subcategories.map((subId) => ({ storeId: id, subcategoryId: subId })),
            });
          }
        }

        return tx.store.update({
          where: { id },
          data: {
            ...storeFields,
            logoStoragePath: newLogoPath || currentStore.logoStoragePath,
          },
          include: {
            categories: { select: { categoryId: true } },
            subcategories: { select: { subcategoryId: true } },
          },
        });
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    appCache.invalidateTag(CACHE_TAGS.STORES);
    appCache.invalidateTag(CACHE_TAGS.COUPONS);
    return NextResponse.json({ store: serializeStore(updatedStore) }, { status: 200 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("PUT /api/stores/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { id } = await params;

    const storeToDelete = await prisma.store.findUnique({
      where: { id },
    });

    if (!storeToDelete) {
      return NextResponse.json({ message: "Store not found" }, { status: 404 });
    }

    const logoPath = storeToDelete.logoStoragePath || storeToDelete.logoPublicId;
    if (logoPath) {
      await deleteFromSupabase("store-images", logoPath);
    }

    await prisma.store.delete({
      where: { id },
    });

    appCache.invalidateTag(CACHE_TAGS.STORES);
    appCache.invalidateTag(CACHE_TAGS.COUPONS);
    return NextResponse.json({ message: "Store deleted successfully" }, { status: 200 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/stores/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
