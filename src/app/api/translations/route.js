import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { translationDefaults } from "@/lib/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const saved = await prisma.translation.findMany({
      orderBy: { key: "asc" },
    });
    const savedByKey = new Map(saved.map((item) => [item.key, item]));
    const translations = translationDefaults.map(([key, source]) => ({
      key,
      source,
      value: savedByKey.get(key)?.value || "",
    }));

    return NextResponse.json({ translations });
  } catch (error) {
    console.error("GET /api/translations Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!Array.isArray(body.translations)) {
      return NextResponse.json({ message: "Translations must be an array." }, { status: 400 });
    }

    const allowed = new Map(translationDefaults);
    const validItems = body.translations.filter((item) => allowed.has(item.key));

    const chunkSize = 25;
    for (let i = 0; i < validItems.length; i += chunkSize) {
      const chunk = validItems.slice(i, i + chunkSize);
      await prisma.$transaction(
        chunk.map((item) =>
          prisma.translation.upsert({
            where: { key: item.key },
            create: {
              key: item.key,
              source: allowed.get(item.key),
              value: String(item.value || "").trim(),
            },
            update: {
              source: allowed.get(item.key),
              value: String(item.value || "").trim(),
            },
          })
        )
      );
    }

    return NextResponse.json({ message: "Translations saved successfully." });
  } catch (error) {
    console.error("PUT /api/translations Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
