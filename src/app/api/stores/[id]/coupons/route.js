import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, error: "Invalid Store ID" }, { status: 400 });
    }

    const coupons = await prisma.coupon.findMany({
      where: { storeId: id },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });

    const serializedCoupons = coupons.map((c) => ({
      ...c,
      _id: c.id,
    }));

    return NextResponse.json({ success: true, data: serializedCoupons });
  } catch (error) {
    console.error("Error fetching store coupons:", error);
    return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
  }
}
