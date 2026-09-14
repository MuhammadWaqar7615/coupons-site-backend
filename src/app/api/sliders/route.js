import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeSlider } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const featured = searchParams.get("featured");

    const cacheKey = `sliders:${status || "all"}:${featured || "all"}`;
    const data = await appCache.wrap(
      cacheKey,
      async () => {
        const where = {};
        if (["enabled", "disabled"].includes(status?.toLowerCase())) {
          where.status = status.toUpperCase();
        }
        if (featured === "true" || featured === "false") {
          where.featured = featured === "true";
        }

        const sliders = await prisma.slider.findMany({
          where,
          orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
        });

        return { sliders: sliders.map(serializeSlider) };
      },
      3600,
      CACHE_TAGS.SLIDERS
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/sliders Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ message: "Title is required." }, { status: 400 });
    }

    const slider = await prisma.slider.create({
      data: {
        title: body.title,
        description: body.description || null,
        discount: body.discount || null,
        logo: body.logo || "/images/placeholder.png",
        logoPublicId: body.logoPublicId || null,
        logoStoragePath: body.logoStoragePath || body.logoPublicId || null,
        link: body.link || "#",
        featured: body.featured !== undefined ? Boolean(body.featured) : false,
        seoTitle: body.seoTitle || null,
        seoDescription: body.seoDescription || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
        image: body.image || "/images/placeholder.png",
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
      },
    });

    appCache.invalidateTag(CACHE_TAGS.SLIDERS);
    return NextResponse.json({ slider: serializeSlider(slider) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sliders Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
