import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeUser } from "@/lib/serializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "administration") return "ADMIN";
  if (r === "editor") return "EDITOR";
  return "SUBSCRIBER";
}

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users: users.map(serializeUser) });
  } catch (error) {
    console.error("GET /api/users Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      return NextResponse.json({ message: "Name, email, and password are required." }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return NextResponse.json({ message: "A user with this email already exists." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        description: body.description || null,
        passwordHash: await hashPassword(body.password),
        role: parseRole(body.role),
        verified: Boolean(body.verified),
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
    });

    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
