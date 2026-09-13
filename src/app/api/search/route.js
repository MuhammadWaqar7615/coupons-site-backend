import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ stores: [], coupons: [] });
    }

    const query = q.trim();

    const [stores, coupons] = await Promise.all([
      prisma.store.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
          isActive: true,
        },
        include: {
          categories: { include: { category: true } },
        },
        take: 5,
      }),
      prisma.coupon.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
          isActive: true,
        },
        include: {
          store: {
            select: { id: true, name: true, slug: true, logoPath: true },
          },
        },
        take: 5,
      }),
    ]);

    const serializedStores = stores.map((s) => ({
      ...s,
      _id: s.id,
      categories: s.categories.map((c) => ({ ...c.category, _id: c.category.id })),
    }));

    const serializedCoupons = coupons.map((c) => ({
      ...c,
      id: c.id,
      _id: c.id,
      type: c.type ? c.type.toLowerCase() : "code",
      storeId: c.store ? { ...c.store, _id: c.store.id } : null,
      store: c.store ? { ...c.store, _id: c.store.id } : null,
    }));

    return NextResponse.json({ stores: serializedStores, coupons: serializedCoupons });
  } catch (error) {
    console.error("Live Search API error:", error);
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
