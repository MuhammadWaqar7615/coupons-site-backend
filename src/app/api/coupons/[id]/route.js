import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase } from "@/lib/supabase";
import { serializeCoupon } from "@/lib/serializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/coupons/[id]
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        store: {
          select: { id: true, name: true, slug: true, logoPath: true, websiteUrl: true },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    const serialized = serializeCoupon(coupon);
    return NextResponse.json({ success: true, data: serialized, coupon: serialized });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
  }
}

// PUT /api/coupons/[id]
export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();

    const existingCoupon = await prisma.coupon.findUnique({
      where: { id },
    });
    if (!existingCoupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    const typeToCheck = body.type !== undefined ? body.type.toLowerCase() : existingCoupon.type.toLowerCase();
    if (typeToCheck === "code" && body.code !== undefined && !body.code) {
      return NextResponse.json({ success: false, error: "Coupon code is required for 'code' type" }, { status: 400 });
    }
    if (typeToCheck === "link" && body.couponUrl !== undefined && !body.couponUrl) {
      return NextResponse.json({ success: false, error: "Coupon URL is required for 'link' type" }, { status: 400 });
    }

    // Clean up old image if changed
    const oldPath = existingCoupon.imageStoragePath;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      await deleteFromSupabase("coupon-banners", oldPath);
    }

    const updateData = {};
    if (body.storeId !== undefined) updateData.storeId = body.storeId;
    if (body.type !== undefined) updateData.type = body.type.toUpperCase();
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.couponUrl !== undefined) updateData.couponUrl = body.couponUrl || null;
    if (body.discount !== undefined) updateData.discount = body.discount;
    if (body.terms !== undefined) updateData.terms = body.terms || null;
    if (body.labelTop !== undefined) updateData.labelTop = body.labelTop || null;
    if (body.labelBottom !== undefined) updateData.labelBottom = body.labelBottom || null;
    if (body.image !== undefined) updateData.image = body.image;
    if (newPath !== undefined) updateData.imageStoragePath = newPath || null;
    if (body.startsAt !== undefined) updateData.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.isFeatured !== undefined) updateData.isFeatured = Boolean(body.isFeatured);
    if (body.homepageSection !== undefined) updateData.homepageSection = body.homepageSection.toUpperCase();

    const updatedCoupon = await prisma.coupon.update({
      where: { id },
      data: updateData,
      include: {
        store: {
          select: { id: true, name: true, slug: true, logoPath: true, websiteUrl: true },
        },
      },
    });

    const serialized = serializeCoupon(updatedCoupon);
    return NextResponse.json({ success: true, data: serialized, coupon: serialized });
  } catch (error) {
    console.error("Error updating coupon:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message || "Server Error" }, { status: 500 });
  }
}

// DELETE /api/coupons/[id]
export async function DELETE(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!coupon) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    if (coupon.imageStoragePath) {
      await deleteFromSupabase("coupon-banners", coupon.imageStoragePath);
    }

    await prisma.coupon.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
  }
}
