import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await destroySession();

    const accept = request.headers.get("accept") || "";
    const contentType = request.headers.get("content-type") || "";
    if (
      accept.includes("application/json") ||
      contentType.includes("application/json")
    ) {
      return NextResponse.json(
        { success: true, message: "Logged out successfully" },
        { status: 200 }
      );
    }

    const referer = request.headers.get("referer");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "http";

    let redirectBase = request.url;
    if (referer) {
      try {
        redirectBase = new URL(referer).origin;
      } catch {}
    } else if (forwardedHost) {
      redirectBase = `${forwardedProto}://${forwardedHost}`;
    }

    return NextResponse.redirect(new URL("/account/login", redirectBase), {
      status: 303,
    });
  } catch (error) {
    console.error("Logout error:", error);
    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Logout failed" },
        { status: 500 }
      );
    }
    const referer = request.headers.get("referer");
    let redirectBase = request.url;
    if (referer) {
      try {
        redirectBase = new URL(referer).origin;
      } catch {}
    }
    return NextResponse.redirect(new URL("/account/login", redirectBase), {
      status: 303,
    });
  }
}
