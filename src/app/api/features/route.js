import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await appCache.wrap(
      "features",
      async () => {
        const now = new Date();
        const coupons = await prisma.coupon.findMany({
          where: {
            isActive: true,
            isFeatured: true,
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
          },
          include: {
            store: {
              select: { id: true, name: true, slug: true, logoPath: true, websiteUrl: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        const features = coupons.map((c) => ({
          ...c,
          _id: c.id,
          type: c.type ? c.type.toLowerCase() : "code",
          homepageSection: c.homepageSection ? c.homepageSection.toLowerCase() : "featured",
          storeId: c.store ? { ...c.store, _id: c.store.id } : c.storeId,
          store: c.store ? { ...c.store, _id: c.store.id } : null,
        }));

        return { features };
      },
      3600,
      CACHE_TAGS.COUPONS
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/features Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
