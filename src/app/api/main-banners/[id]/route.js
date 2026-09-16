import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { queueDeleteFromSupabase } from "@/lib/supabase";
import { serializeMainBanner } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const mainBanner = await prisma.mainBanner.findUnique({ where: { id } });
    if (!mainBanner) return NextResponse.json({ message: "Main banner not found" }, { status: 404 });
    return NextResponse.json({ mainBanner: serializeMainBanner(mainBanner) });
  } catch (error) {
    console.error("GET /api/main-banners/[id] Error:", error);
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

    const currentBanner = await prisma.mainBanner.findUnique({ where: { id } });
    if (!currentBanner) return NextResponse.json({ message: "Main banner not found" }, { status: 404 });

    const oldPath = currentBanner.imageStoragePath || currentBanner.imagePublicId;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      queueDeleteFromSupabase("store-images", oldPath);
    }

    const mainBanner = await prisma.mainBanner.update({
      where: { id },
      data: {
        name: body.name.trim(),
        image: body.image.trim(),
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: newPath || null,
        link: body.link?.trim() || "#",
        altText: body.altText?.trim() || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BANNERS);
    return NextResponse.json({ mainBanner: serializeMainBanner(mainBanner) });
  } catch (error) {
    console.error("PUT /api/main-banners/[id] Error:", error);
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
    const mainBanner = await prisma.mainBanner.findUnique({ where: { id } });
    if (!mainBanner) return NextResponse.json({ message: "Main banner not found" }, { status: 404 });

    const path = mainBanner.imageStoragePath || mainBanner.imagePublicId;
    if (path) queueDeleteFromSupabase("store-images", path);

    await prisma.mainBanner.delete({ where: { id } });
    appCache.invalidateTag(CACHE_TAGS.BANNERS);
    return NextResponse.json({ message: "Main banner deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/main-banners/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
