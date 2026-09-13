import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSource(source) {
  const value = String(source || "").trim();
  if (!value) return "";
  if (!value.startsWith("/")) return `/${value}`;
  return value;
}

function normalizeTarget(target) {
  return String(target || "").trim();
}

function isValidTarget(value) {
  const target = normalizeTarget(value);
  if (!target) return false;
  if (target.startsWith("/")) return true;
  try {
    new URL(target);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const redirects = await prisma.redirect.findMany({
      orderBy: { source: "asc" },
    });

    return NextResponse.json({
      redirects: redirects.map((redirect) => ({
        ...redirect,
        _id: redirect.id,
      })),
    });
  } catch (error) {
    console.error("GET /api/seo/redirects Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();

    const source = normalizeSource(body.source);
    const target = normalizeTarget(body.target);

    if (!source) {
      return NextResponse.json({ message: "Source path is required." }, { status: 400 });
    }

    if (!target) {
      return NextResponse.json({ message: "Target is required." }, { status: 400 });
    }

    if (!source.startsWith("/")) {
      return NextResponse.json({ message: "Source path must start with /." }, { status: 400 });
    }

    if (!isValidTarget(target)) {
      return NextResponse.json({ message: "Target must be a valid internal path or absolute URL." }, { status: 400 });
    }

    if (source === target) {
      return NextResponse.json({ message: "Source and target cannot be the same." }, { status: 400 });
    }

    const statusCode = Number(body.statusCode || 301);
    if (![301, 302, 307, 308].includes(statusCode)) {
      return NextResponse.json({ message: "Status code must be one of 301, 302, 307, or 308." }, { status: 400 });
    }

    const existing = await prisma.redirect.findUnique({
      where: { source },
    });
    if (existing) {
      return NextResponse.json({ message: "A redirect for this source path already exists." }, { status: 409 });
    }

    const redirect = await prisma.redirect.create({
      data: {
        source,
        target,
        statusCode,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        notes: String(body.notes || "").trim(),
      },
    });

    return NextResponse.json({
      message: "Redirect created successfully.",
      redirect: { ...redirect, _id: redirect.id },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/seo/redirects Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
