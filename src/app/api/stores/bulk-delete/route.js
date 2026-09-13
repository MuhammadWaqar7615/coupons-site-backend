import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { handleAuthError } from "@/lib/api-errors";
import { deleteFromSupabase } from "@/lib/supabase";

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
        await deleteFromSupabase("store-images", path);
      }
    }

    const result = await prisma.store.deleteMany({
      where: { id: { in: data.storeIds } },
    });

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

