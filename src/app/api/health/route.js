import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startTime = Date.now();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get("deep") === "1";

  try {
    // 1. Lightweight DB Ping
    await prisma.$queryRaw`SELECT 1;`;

    let storageStatus = "untested";
    if (deep) {
      if (supabase) {
        const { error } = await supabase.storage.listBuckets();
        if (error) {
          throw new Error(`Storage check failed: ${error.message}`);
        }
        storageStatus = "accessible";
      } else {
        storageStatus = "unconfigured";
      }
    }

    return NextResponse.json(
      {
        ok: true,
        service: "codice-sconto-backend",
        version: "1.0.0",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        db: "connected",
        storage: storageStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Health check failure:", error);
    return NextResponse.json(
      {
        ok: false,
        service: "codice-sconto-backend",
        version: "1.0.0",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        db: "disconnected",
        error: error.message,
      },
      { status: 503 }
    );
  }
}
