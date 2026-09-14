import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase, queueDeleteFromSupabase } from "@/lib/supabase";
import { serializeBadge } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `badge:${id}`,
      async () => {
        const badge = await prisma.badge.findUnique({
          where: { id },
        });
        if (!badge) return null;
        return { badge: serializeBadge(badge) };
      },
      3600,
      CACHE_TAGS.BADGES
    );

    if (!data) return NextResponse.json({ message: "Badge not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/badges/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();
    if (!body.name?.trim() || !body.image?.trim()) {
      return NextResponse.json({ message: "Name and image are required." }, { status: 400 });
    }

    const currentBadge = await prisma.badge.findUnique({
      where: { id },
    });
    if (!currentBadge) return NextResponse.json({ message: "Badge not found" }, { status: 404 });

    const oldPath = currentBadge.imageStoragePath || currentBadge.imagePublicId;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      queueDeleteFromSupabase("store-images", oldPath);
    }

    const badge = await prisma.badge.update({
      where: { id },
      data: {
        name: body.name.trim(),
        image: body.image.trim(),
        imageStoragePath: newPath || null,
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BADGES);
    return NextResponse.json({ badge: serializeBadge(badge) });
  } catch (error) {
    console.error("PUT /api/badges/[id] Error:", error);
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

    const badgeToDelete = await prisma.badge.findUnique({
      where: { id },
    });
    if (!badgeToDelete) return NextResponse.json({ message: "Badge not found" }, { status: 404 });

    const path = badgeToDelete.imageStoragePath || badgeToDelete.imagePublicId;
    if (path) {
      queueDeleteFromSupabase("store-images", path);
    }

    await prisma.badge.delete({
      where: { id },
    });


    appCache.invalidateTag(CACHE_TAGS.BADGES);
    return NextResponse.json({ message: "Badge deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/badges/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
