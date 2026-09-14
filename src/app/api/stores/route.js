import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { handleAuthError } from "@/lib/api-errors";
import { serializeStore } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") ?? searchParams.get("isActive");
    const search = searchParams.get("search");
    const letter = searchParams.get("letter");
    const featured = searchParams.get("featured");
    const category = searchParams.get("category");

    const cacheKey = `stores:${active ?? "all"}:${search || ""}:${letter || ""}:${featured || "all"}:${category || "all"}`;
    const data = await appCache.wrap(
      cacheKey,
      async () => {
        let where = {};
        if (active === "true") {
          where.isActive = true;
        } else if (active === "false") {
          where.isActive = false;
        }

        if (featured === "true") {
          where.coupons = {
            some: {
              isFeatured: true,
              isActive: true,
            },
          };
        }

        if (category) {
          where.categories = {
            some: {
              category: {
                OR: [{ slug: category }, { id: category }],
              },
            },
          };
        }

        if (search) {
          where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ];
        }

        if (letter) {
          if (letter === "#") {
            where.AND = "abcdefghijklmnopqrstuvwxyz".split("").map((char) => ({
              NOT: { name: { startsWith: char, mode: "insensitive" } },
            }));
          } else {
            where.name = { ...where.name, startsWith: letter, mode: "insensitive" };
          }
        }

        const stores = await prisma.store.findMany({
          where,
          orderBy: { name: "asc" },
          include: {
            categories: { include: { category: true } },
            subcategories: { select: { subcategoryId: true } },
            coupons: {
              where: { isActive: true },
            },
          },
        });

        const serializedStores = stores.map((s) => serializeStore(s));
        return { stores: serializedStores };
      },
      3600,
      CACHE_TAGS.STORES
    );

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("GET /api/stores Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const data = await request.json();

    if (!data.name || !data.slug || !data.logoPath) {
      return NextResponse.json(
        { message: "Name, slug, and logo are required." },
        { status: 400 }
      );
    }

    const existingStore = await prisma.store.findUnique({
      where: { slug: data.slug },
    });
    if (existingStore) {
      return NextResponse.json(
        { message: "A store with this slug already exists." },
        { status: 409 }
      );
    }

    const {
      categories = [],
      subcategories = [],
      id,
      _id,
      createdAt,
      updatedAt,
      ...storeFields
    } = data;

    const newStore = await prisma.store.create({
      data: {
        ...storeFields,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        logoStoragePath: data.logoStoragePath || data.logoPublicId || null,
        categories:
          categories.length > 0
            ? {
                create: categories.map((catId) => ({ categoryId: catId })),
              }
            : undefined,
        subcategories:
          subcategories.length > 0
            ? {
                create: subcategories.map((subId) => ({ subcategoryId: subId })),
              }
            : undefined,
      },
      include: {
        categories: { select: { categoryId: true } },
        subcategories: { select: { subcategoryId: true } },
      },
    });

    const serialized = serializeStore(newStore);

    // Optimistic cache update: append to stores:all:::all:all if cached
    const cachedStores = appCache.get("stores:all:::all:all");
    if (cachedStores && Array.isArray(cachedStores.stores)) {
      cachedStores.stores = [...cachedStores.stores, serialized].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
      appCache.set("stores:all:::all:all", cachedStores, 3600, CACHE_TAGS.STORES);
    } else {
      appCache.invalidateTag(CACHE_TAGS.STORES);
    }

    return NextResponse.json({ store: serialized }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("POST /api/stores Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
