import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json({ features });
  } catch (error) {
    console.error("GET /api/features Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
