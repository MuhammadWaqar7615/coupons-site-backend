import { NextResponse } from "next/server";

export function middleware(request) {
  const origin = request.headers.get("origin");
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";
  const allowedOrigins = allowedOriginsEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  let isAllowedOrigin = false;
  if (origin) {
    if (allowedOrigins.length === 0) {
      isAllowedOrigin = true;
    } else if (allowedOrigins.includes(origin)) {
      isAllowedOrigin = true;
    }
  }

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin && origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Cookie, Accept, X-Requested-With"
      );
      response.headers.set("Access-Control-Max-Age", "86400");
    }
    return response;
  }

  // Handle standard requests
  const response = NextResponse.next();
  if (isAllowedOrigin && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/robots.txt", "/sitemap.xml"],
};
