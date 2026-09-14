import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeBanner } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const cacheKey = `banners:${status || "all"}`;
    const data = await appCache.wrap(
      cacheKey,
      async () => {
        const where = {};
        if (["enabled", "disabled"].includes(status?.toLowerCase())) {
          where.status = status.toUpperCase();
        }

        const promoBanners = await prisma.promoBanner.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });

        return {
          promoBanners: promoBanners.map(serializeBanner),
        };
      },
      3600,
      CACHE_TAGS.BANNERS
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/promo-banners Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!body.heading?.trim() || !body.description?.trim() || !body.image?.trim()) {
      return NextResponse.json({ message: "Heading, description, and image are required." }, { status: 400 });
    }

    const promoBanner = await prisma.promoBanner.create({
      data: {
        heading: body.heading,
        description: body.description,
        image: body.image,
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BANNERS);
    return NextResponse.json({ promoBanner: serializeBanner(promoBanner) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/promo-banners Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
