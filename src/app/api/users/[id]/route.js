import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { serializeUser } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "administration") return "ADMIN";
  if (r === "editor") return "EDITOR";
  return "SUBSCRIBER";
}

export async function GET(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const user = await appCache.wrap(
      `user:${id}`,
      async () => {
        const item = await prisma.user.findUnique({
          where: { id },
        });
        return item ? serializeUser(item) : null;
      },
      300,
      CACHE_TAGS.USERS
    );

    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("GET /api/users/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();

    const currentUser = await prisma.user.findUnique({
      where: { id },
    });
    if (!currentUser) return NextResponse.json({ message: "User not found" }, { status: 404 });

    if (body.email && body.email.trim().toLowerCase() !== currentUser.email) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: body.email.trim().toLowerCase() },
      });
      if (emailConflict) {
        return NextResponse.json({ message: "A user with this email already exists." }, { status: 409 });
      }
    }

    const updateData = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.email !== undefined) updateData.email = body.email.trim().toLowerCase();
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.role !== undefined) updateData.role = parseRole(body.role);
    if (body.verified !== undefined) updateData.verified = Boolean(body.verified);
    if (body.status !== undefined) {
      updateData.status = (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED";
    }
    if (body.password) {
      updateData.passwordHash = await hashPassword(body.password);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    appCache.invalidateTag(CACHE_TAGS.USERS);

    return NextResponse.json({ user: serializeUser(updatedUser) });
  } catch (error) {
    console.error("PUT /api/users/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;

    const userToDelete = await prisma.user.findUnique({
      where: { id },
    });
    if (!userToDelete) return NextResponse.json({ message: "User not found" }, { status: 404 });

    await prisma.user.delete({
      where: { id },
    });

    appCache.invalidateTag(CACHE_TAGS.USERS);

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/users/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
