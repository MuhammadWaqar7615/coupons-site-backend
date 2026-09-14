import { NextResponse } from "next/server";
import { dbMetrics } from "@/lib/prisma";
import { appCache } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dbStats = dbMetrics.getStats();

  const globalForHttp = globalThis;
  const httpStore = globalForHttp.__httpMetricsStore;

  const now = Date.now();
  const oneSecAgo = now - 1000;
  const oneMinAgo = now - 60000;

  const httpRequests = httpStore?.requests || [];
  const httpInLastSec = httpRequests.filter((r) => r.timestamp >= oneSecAgo);
  const httpInLastMin = httpRequests.filter((r) => r.timestamp >= oneMinAgo);

  // Group top paths in last minute
  const pathCounts = {};
  for (const r of httpInLastMin) {
    pathCounts[r.path] = (pathCounts[r.path] || 0) + 1;
  }
  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }));

  // Cache stats
  const cacheKeyCount = appCache.store?.size || 0;
  const cacheTagCount = appCache.tagIndex?.size || 0;

  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    metrics: {
      http: {
        totalRequests: httpStore?.totalRequests || 0,
        requestsPerSecond: httpInLastSec.length,
        requestsLastMinute: httpInLastMin.length,
        topPathsLastMinute: topPaths,
      },
      database: {
        totalQueries: dbStats.totalQueries,
        queriesPerSecond: dbStats.queriesPerSecond,
        queriesLastMinute: dbStats.queriesLastMinute,
        avgQueryDurationMs: dbStats.avgQueryDurationMs,
        slowQueriesCount: dbStats.slowQueriesCount,
        pooler: {
          host: dbStats.poolerHost,
          ip: dbStats.poolerIp,
        },
        recentQueries: dbStats.recentQueries,
        slowQueries: dbStats.slowQueries,
      },
      cache: {
        cachedEntries: cacheKeyCount,
        activeTags: cacheTagCount,
      },
      dns: {
        patchActive: Boolean(globalThis.__dnsPatchApplied),
      },
    },
  });
}
