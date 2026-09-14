import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { deleteFromSupabase } from "@/lib/supabase";
import { serializePost } from "@/lib/serializer";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const data = await appCache.wrap(
      `post:${id}`,
      async () => {
        const post = await prisma.blogPost.findFirst({
          where: {
            OR: [{ id }, { title: id }],
          },
        });
        if (!post) return null;
        return { post: serializePost(post) };
      },
      3600,
      CACHE_TAGS.BLOG
    );

    if (!data) return NextResponse.json({ message: "Blog post not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/blog/[id] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { id } = await params;
    const body = await request.json();
    if (!body.title?.trim() || !body.description?.trim() || !body.image?.trim()) {
      return NextResponse.json({ message: "Title, description, and image are required." }, { status: 400 });
    }

    const currentPost = await prisma.blogPost.findFirst({
      where: {
        OR: [{ id }, { title: id }],
      },
    });
    if (!currentPost) return NextResponse.json({ message: "Blog post not found" }, { status: 404 });

    const oldPath = currentPost.imageStoragePath || currentPost.imagePublicId;
    const newPath = body.imageStoragePath || body.imagePublicId;
    if (oldPath && newPath && oldPath !== newPath) {
      await deleteFromSupabase("store-images", oldPath);
    }

    const post = await prisma.blogPost.update({
      where: { id: currentPost.id },
      data: {
        title: body.title,
        description: body.description,
        seoTitle: body.seoTitle || null,
        seoDescription: body.seoDescription || null,
        image: body.image,
        imagePublicId: body.imagePublicId || null,
        imageStoragePath: newPath || null,
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
      },
    });

    appCache.invalidateTag(CACHE_TAGS.BLOG);
    return NextResponse.json({ post: serializePost(post) });
  } catch (error) {
    console.error("PUT /api/blog/[id] Error:", error);
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

    const postToDelete = await prisma.blogPost.findFirst({
      where: {
        OR: [{ id }, { title: id }],
      },
    });
    if (!postToDelete) return NextResponse.json({ message: "Blog post not found" }, { status: 404 });

    const path = postToDelete.imageStoragePath || postToDelete.imagePublicId;
    if (path) {
      await deleteFromSupabase("store-images", path);
    }

    await prisma.blogPost.delete({
      where: { id: postToDelete.id },
    });

    appCache.invalidateTag(CACHE_TAGS.BLOG);
    return NextResponse.json({ message: "Blog post deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/blog/[id] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
