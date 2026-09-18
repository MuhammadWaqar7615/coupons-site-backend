import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeSlider } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";
import { normalizeSliderLink } from "@/lib/sliderLink";

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
    if (!body.image?.trim() || !body.mobileImage?.trim()) {
      return NextResponse.json({ message: "Desktop and mobile images are required." }, { status: 400 });
    }

    const sliderLink = normalizeSliderLink(body.link ?? body.url);

    const slider = await prisma.slider.create({
      data: {
        title: body.title?.trim() || "",
        description: null,
        discount: null,
        logo: "/images/placeholder.png",
        logoPublicId: null,
        logoStoragePath: null,
        link: sliderLink,
        featured: false,
        seoTitle: null,
        seoDescription: null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
        image: body.image.trim(),
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
        mobileImage: body.mobileImage.trim(),
        mobileImagePublicId: body.mobileImagePublicId || null,
        mobileImageStoragePath: body.mobileImageStoragePath || body.mobileImagePublicId || null,
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
