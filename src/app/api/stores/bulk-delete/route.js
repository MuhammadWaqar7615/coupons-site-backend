import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { handleAuthError } from "@/lib/api-errors";
import { deleteFromSupabase, queueDeleteFromSupabase } from "@/lib/supabase";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const data = await request.json();

    if (!data.storeIds || !Array.isArray(data.storeIds) || data.storeIds.length === 0) {
      return NextResponse.json({ message: "Invalid or empty storeIds array." }, { status: 400 });
    }

    const storesToDelete = await prisma.store.findMany({
      where: { id: { in: data.storeIds } },
      select: { logoStoragePath: true, logoPublicId: true },
    });

    for (const store of storesToDelete) {
      const path = store.logoStoragePath || store.logoPublicId;
      if (path) {
        queueDeleteFromSupabase("store-images", path);
      }
    }

    const result = await prisma.store.deleteMany({
      where: { id: { in: data.storeIds } },
    });

    const deletedSet = new Set(data.storeIds);
    const cachedStores = appCache.get("stores:all:::all:all");
    if (cachedStores && Array.isArray(cachedStores.stores)) {
      cachedStores.stores = cachedStores.stores.filter(
        (s) => !deletedSet.has(s._id) && !deletedSet.has(s.id)
      );
      appCache.set("stores:all:::all:all", cachedStores, 3600, CACHE_TAGS.STORES);
    } else {
      appCache.invalidateTag(CACHE_TAGS.STORES);
    }
    appCache.invalidateTag(CACHE_TAGS.COUPONS);

    return NextResponse.json(
      { message: `Successfully deleted ${result.count} stores.`, count: result.count },
      { status: 200 }
    );

  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("POST /api/stores/bulk-delete Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

