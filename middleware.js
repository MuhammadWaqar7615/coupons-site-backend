import { NextResponse } from "next/server";

// Global in-memory request metrics store
const globalForHttp = globalThis;
if (!globalForHttp.__httpMetricsStore) {
  globalForHttp.__httpMetricsStore = {
    totalRequests: 0,
    requests: [], // { timestamp, path, method }
  };
}

export function middleware(request) {
  const store = globalForHttp.__httpMetricsStore;
  if (store) {
    const now = Date.now();
    store.totalRequests++;
    store.requests.push({
      timestamp: now,
      path: request.nextUrl.pathname,
      method: request.method,
    });
    // Keep only last 200 requests
    if (store.requests.length > 200) {
      store.requests.shift();
    }
  }

  const rawOrigin = request.headers.get("origin");
  const origin = rawOrigin ? rawOrigin.trim().replace(/\/$/, "") : null;
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";
  const allowedOrigins = allowedOriginsEnv
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  let isAllowedOrigin = false;
  if (origin) {
    if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
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

