import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeCategory(c) {
  const subcategories = (c.subcategories || []).map((sub) => ({
    ...sub,
    _id: sub.id,
    status: sub.status ? sub.status.toLowerCase() : "enabled",
  }));

  const stores = (c.stores || []).map((s) => ({
    ...(s.store || s),
    _id: s.store?.id || s.storeId,
  }));

  return {
    ...c,
    _id: c.id,
    status: c.status ? c.status.toLowerCase() : "enabled",
    subcategories,
    subs: subcategories,
    stores,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const showInMenu = searchParams.get("showInMenu");
    const featured = searchParams.get("featured");
    const slug = searchParams.get("slug");
    const where = {};

    if (["enabled", "disabled"].includes(status?.toLowerCase())) {
      where.status = status.toUpperCase();
    }
    if (showInMenu === "true" || showInMenu === "false") {
      where.showInMenu = showInMenu === "true";
    }
    if (featured === "true" || featured === "false") {
      where.featured = featured === "true";
    }
    if (slug) {
      where.slug = slug;
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { title: "asc" },
      include: {
        subcategories: {
          orderBy: { title: "asc" },
        },
        stores: {
          include: {
            store: {
              select: { id: true, name: true, slug: true, logoPath: true, isActive: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      categories: categories.map(serializeCategory),
    });
  } catch (error) {
    console.error("GET /api/categories Error:", error);
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

    const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const existingCategory = await prisma.category.findUnique({
      where: { slug },
    });
    if (existingCategory) {
      return NextResponse.json({ message: "Category with this slug already exists." }, { status: 409 });
    }

    const category = await prisma.category.create({
      data: {
        title: body.title,
        slug,
        description: body.description || null,
        icon: body.icon || null,
        showInMenu: body.showInMenu !== undefined ? Boolean(body.showInMenu) : true,
        featured: body.featured !== undefined ? Boolean(body.featured) : false,
        seoTitle: body.seoTitle || null,
        seoDescription: body.seoDescription || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
        image: body.image || "/images/placeholder.png",
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: body.imageStoragePath || body.imagePublicId || null,
      },
    });

    return NextResponse.json({ category: serializeCategory(category) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
