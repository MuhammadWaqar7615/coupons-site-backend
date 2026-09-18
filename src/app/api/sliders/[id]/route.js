import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase, queueDeleteFromSupabase } from "@/lib/supabase";
import { serializeSlider } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";
import { normalizeSliderLink } from "@/lib/sliderLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `slider:${id}`,
      async () => {
        const slider = await prisma.slider.findUnique({
          where: { id },
        });
        if (!slider) return null;
        return { slider: serializeSlider(slider) };
      },
      3600,
      CACHE_TAGS.SLIDERS
    );

    if (!data) return NextResponse.json({ message: "Slider not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/sliders/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();
    if (!body.image?.trim() || !body.mobileImage?.trim()) {
      return NextResponse.json({ message: "Desktop and mobile images are required." }, { status: 400 });
    }

    const sliderLink = normalizeSliderLink(body.link ?? body.url);

    const currentSlider = await prisma.slider.findUnique({
      where: { id },
    });
    if (!currentSlider) return NextResponse.json({ message: "Slider not found" }, { status: 404 });

    // Clean up old image / logo in background if changed
    const oldImagePath = currentSlider.imageStoragePath || currentSlider.imagePublicId;
    const newImagePath = body.imageStoragePath || body.imagePublicId;
    if (oldImagePath && newImagePath && oldImagePath !== newImagePath) {
      queueDeleteFromSupabase("coupon-banners", oldImagePath);
    }

    const oldLogoPath = currentSlider.logoStoragePath || currentSlider.logoPublicId;
    const newLogoPath = body.logoStoragePath || body.logoPublicId;
    if (oldLogoPath && newLogoPath && oldLogoPath !== newLogoPath) {
      queueDeleteFromSupabase("store-images", oldLogoPath);
    }

    const oldMobileImagePath = currentSlider.mobileImageStoragePath || currentSlider.mobileImagePublicId;
    const newMobileImagePath = body.mobileImageStoragePath || body.mobileImagePublicId;
    if (oldMobileImagePath && newMobileImagePath && oldMobileImagePath !== newMobileImagePath) {
      queueDeleteFromSupabase("coupon-banners", oldMobileImagePath);
    }

    const updateData = {};
    updateData.title = "";
    updateData.description = null;
    updateData.discount = null;
    updateData.logo = "/images/placeholder.png";
    updateData.logoPublicId = null;
    updateData.logoStoragePath = null;
    updateData.link = sliderLink;
    updateData.featured = false;
    updateData.seoTitle = null;
    updateData.seoDescription = null;
    updateData.status = (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED";
    updateData.image = body.image.trim();
    updateData.imagePublicId = body.imagePublicId || null;
    updateData.imageStoragePath = newImagePath || null;
    updateData.mobileImage = body.mobileImage.trim();
    updateData.mobileImagePublicId = body.mobileImagePublicId || null;
    updateData.mobileImageStoragePath = newMobileImagePath || null;

    const slider = await prisma.slider.update({
      where: { id },
      data: updateData,
    });

    appCache.invalidateTag(CACHE_TAGS.SLIDERS);
    return NextResponse.json({ slider: serializeSlider(slider) });
  } catch (error) {
    console.error("PUT /api/sliders/[id] Error:", error);
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

    const slider = await prisma.slider.findUnique({
      where: { id },
    });
    if (!slider) return NextResponse.json({ message: "Slider not found" }, { status: 404 });

    // Clean up Supabase storage in background without blocking HTTP response
    const imagePath = slider.imageStoragePath || slider.imagePublicId;
    if (imagePath) {
      queueDeleteFromSupabase("coupon-banners", imagePath);
    }
    const mobileImagePath = slider.mobileImageStoragePath || slider.mobileImagePublicId;
    if (mobileImagePath) {
      queueDeleteFromSupabase("coupon-banners", mobileImagePath);
    }
    const logoPath = slider.logoStoragePath || slider.logoPublicId;
    if (logoPath) {
      queueDeleteFromSupabase("store-images", logoPath);
    }

    await prisma.slider.delete({
      where: { id },
    });

    appCache.invalidateTag(CACHE_TAGS.SLIDERS);
    return NextResponse.json({ message: "Slider deleted successfully" });

  } catch (error) {
    console.error("DELETE /api/sliders/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
