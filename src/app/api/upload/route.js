import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = ["store-images", "coupon-banners"];

export async function POST(request) {
  try {
    // Only Admin can upload images
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const formData = await request.formData();
    const file = formData.get("file");
    const requestedBucket = formData.get("bucket");

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    // Check if it is an image
    if (!file.type || !file.type.startsWith("image/")) {
      return NextResponse.json({ message: "File must be an image" }, { status: 400 });
    }

    // High-resolution slider artwork may be larger than regular site images.
    const MAX_SIZE = requestedBucket === "coupon-banners" ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ message: `File size exceeds ${MAX_SIZE / (1024 * 1024)}MB limit` }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine target bucket
    let bucket = "store-images";
    if (requestedBucket && ALLOWED_BUCKETS.includes(requestedBucket)) {
      bucket = requestedBucket;
    }

    const sanitizedName = file.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, "_") : "image.png";
    const storagePath = `uploads/${Date.now()}_${sanitizedName}`;

    if (!supabase) {
      return NextResponse.json(
        { message: "Supabase storage is not configured" },
        { status: 500 }
      );
    }

    // Upload to Supabase Storage with 10s timeout guard
    const uploadPromise = supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    const uploadTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Supabase storage upload timed out after 10 seconds")), 10000)
    );

    const { data: uploadData, error: uploadError } = await Promise.race([
      uploadPromise,
      uploadTimeout,
    ]);

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return NextResponse.json(
        { message: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Retrieve public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    return NextResponse.json(
      {
        url: urlData.publicUrl,
        public_id: storagePath,
        storagePath: storagePath,
        bucket: bucket,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/upload Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
