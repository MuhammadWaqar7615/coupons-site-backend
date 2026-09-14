import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeBadge } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await appCache.wrap(
      "badges",
      async () => {
        const badges = await prisma.badge.findMany({
          orderBy: { name: "asc" },
        });
        return { badges: badges.map(serializeBadge) };
      },
      3600,
      CACHE_TAGS.BADGES
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/badges Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!body.name?.trim() || !body.image?.trim()) {
      return NextResponse.json({ message: "Name and image are required." }, { status: 400 });
    }

    const badge = await prisma.badge.create({
      data: {
        name: body.name,
        image: body.image,
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BADGES);
    return NextResponse.json({ badge: serializeBadge(badge) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/badges Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
