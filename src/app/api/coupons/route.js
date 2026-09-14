import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { handleAuthError } from "@/lib/api-errors";
import { serializeCoupon } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    const cacheKey = `coupons:${storeId || "all"}`;
    const data = await appCache.wrap(
      cacheKey,
      async () => {
        let where = {};
        if (storeId) {
          where.storeId = storeId;
        }

        const coupons = await prisma.coupon.findMany({
          where,
          include: {
            store: {
              select: { id: true, name: true, slug: true, logoPath: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return {
          success: true,
          data: coupons.map((c) => serializeCoupon(c)),
        };
      },
      3600,
      CACHE_TAGS.COUPONS
    );

    return NextResponse.json(data);
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("Error fetching coupons:", error);
    return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();

    const normalizedType = (body.type || "code").toLowerCase();
    if (normalizedType === "code" && !body.code) {
      return NextResponse.json(
        { success: false, error: "Coupon code is required for 'code' type" },
        { status: 400 }
      );
    }
    if (normalizedType === "link" && !body.couponUrl) {
      return NextResponse.json(
        { success: false, error: "Coupon URL is required for 'link' type" },
        { status: 400 }
      );
    }

    const newCoupon = await prisma.coupon.create({
      data: {
        storeId: body.storeId,
        type: normalizedType === "link" ? "LINK" : "CODE",
        title: body.title,
        description: body.description || "",
        code: body.code || null,
        couponUrl: body.couponUrl || null,
        discount: body.discount || "",
        terms: body.terms || null,
        labelTop: body.labelTop || null,
        labelBottom: body.labelBottom || null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : false,
        homepageSection: (body.homepageSection || "featured").toUpperCase(),
        image: body.image || "/images/placeholder.png",
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
      },
      include: {
        store: {
          select: { id: true, name: true, slug: true, logoPath: true },
        },
      },
    });

    appCache.invalidateTag(CACHE_TAGS.COUPONS);
    appCache.invalidateTag(CACHE_TAGS.STORES);

    return NextResponse.json(
      { success: true, data: serializeCoupon(newCoupon) },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    console.error("Error creating coupon:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Server Error" },
      { status: 500 }
    );
  }
}
