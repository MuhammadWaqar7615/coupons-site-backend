import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase } from "@/lib/supabase";
import { serializeSlider } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

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
    if (!body.title?.trim()) return NextResponse.json({ message: "Title is required." }, { status: 400 });

    const currentSlider = await prisma.slider.findUnique({
      where: { id },
    });
    if (!currentSlider) return NextResponse.json({ message: "Slider not found" }, { status: 404 });

    // Clean up old image / logo if changed
    const oldImagePath = currentSlider.imageStoragePath || currentSlider.imagePublicId;
    const newImagePath = body.imageStoragePath || body.imagePublicId;
    if (oldImagePath && newImagePath && oldImagePath !== newImagePath) {
      await deleteFromSupabase("coupon-banners", oldImagePath);
    }

    const oldLogoPath = currentSlider.logoStoragePath || currentSlider.logoPublicId;
    const newLogoPath = body.logoStoragePath || body.logoPublicId;
    if (oldLogoPath && newLogoPath && oldLogoPath !== newLogoPath) {
      await deleteFromSupabase("store-images", oldLogoPath);
    }

    const updateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.discount !== undefined) updateData.discount = body.discount || null;
    if (body.logo !== undefined) updateData.logo = body.logo;
    if (newLogoPath !== undefined) {
      updateData.logoPublicId = body.logoPublicId || null;
      updateData.logoStoragePath = newLogoPath || null;
    }
    if (body.link !== undefined) updateData.link = body.link || "#";
    if (body.featured !== undefined) updateData.featured = Boolean(body.featured);
    if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle || null;
    if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription || null;
    if (body.status !== undefined) {
      updateData.status = (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED";
    }
    if (body.image !== undefined) updateData.image = body.image;
    if (newImagePath !== undefined) {
      updateData.imagePublicId = body.imagePublicId || null;
      updateData.imageStoragePath = newImagePath || null;
    }

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

    const imagePath = slider.imageStoragePath || slider.imagePublicId;
    if (imagePath) {
      await deleteFromSupabase("coupon-banners", imagePath);
    }
    const logoPath = slider.logoStoragePath || slider.logoPublicId;
    if (logoPath) {
      await deleteFromSupabase("store-images", logoPath);
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
