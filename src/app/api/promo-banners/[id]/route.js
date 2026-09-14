import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase } from "@/lib/supabase";
import { serializeBanner } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `banner:${id}`,
      async () => {
        const promoBanner = await prisma.promoBanner.findUnique({
          where: { id },
        });
        if (!promoBanner) return null;
        return { promoBanner: serializeBanner(promoBanner) };
      },
      3600,
      CACHE_TAGS.BANNERS
    );

    if (!data) return NextResponse.json({ message: "Promo banner not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/promo-banners/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();
    if (!body.heading?.trim() || !body.description?.trim() || !body.image?.trim()) {
      return NextResponse.json({ message: "Heading, description, and image are required." }, { status: 400 });
    }

    const currentBanner = await prisma.promoBanner.findUnique({
      where: { id },
    });
    if (!currentBanner) return NextResponse.json({ message: "Promo banner not found" }, { status: 404 });

    const oldPath = currentBanner.imageStoragePath || currentBanner.imagePublicId;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      await deleteFromSupabase("store-images", oldPath);
    }

    const promoBanner = await prisma.promoBanner.update({
      where: { id },
      data: {
        heading: body.heading,
        description: body.description,
        image: body.image,
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: newPath || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BANNERS);
    return NextResponse.json({ promoBanner: serializeBanner(promoBanner) });
  } catch (error) {
    console.error("PUT /api/promo-banners/[id] Error:", error);
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

    const bannerToDelete = await prisma.promoBanner.findUnique({
      where: { id },
    });
    if (!bannerToDelete) return NextResponse.json({ message: "Promo banner not found" }, { status: 404 });

    const path = bannerToDelete.imageStoragePath || bannerToDelete.imagePublicId;
    if (path) {
      await deleteFromSupabase("store-images", path);
    }

    await prisma.promoBanner.delete({
      where: { id },
    });

    appCache.invalidateTag(CACHE_TAGS.BANNERS);
    return NextResponse.json({ message: "Promo banner deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/promo-banners/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
