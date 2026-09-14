import { PrismaClient } from "@prisma/client";
import "./dnsPatch.js";
import "./env.js";

const SUPABASE_POOLER_HOST = "aws-0-ap-southeast-2.pooler.supabase.com";
const SUPABASE_POOLER_IP = "3.106.102.114";

function resolvePoolerUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.includes(SUPABASE_POOLER_HOST)) {
    return url.replaceAll(SUPABASE_POOLER_HOST, SUPABASE_POOLER_IP);
  }
  return url;
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvePoolerUrl(process.env.DATABASE_URL);
}
if (process.env.DIRECT_URL) {
  process.env.DIRECT_URL = resolvePoolerUrl(process.env.DIRECT_URL);
}

// Global live metrics tracker
const globalForMetrics = globalThis;
if (!globalForMetrics.__dbMetricsStore) {
  globalForMetrics.__dbMetricsStore = {
    totalQueries: 0,
    queryLog: [], // { timestamp, duration, query }
    slowQueries: [],
    lastHeartbeat: null,
  };
}
const metricsStore = globalForMetrics.__dbMetricsStore;

export const dbMetrics = {
  recordQuery(query, duration) {
    const now = Date.now();
    metricsStore.totalQueries++;
    const entry = {
      timestamp: now,
      duration: typeof duration === "number" ? duration : 0,
      query: (query || "").substring(0, 160).replace(/\s+/g, " "),
    };

    metricsStore.queryLog.push(entry);
    // Keep only last 200 entries or 60 seconds
    if (metricsStore.queryLog.length > 200) {
      metricsStore.queryLog.shift();
    }

    if (entry.duration >= 300) {
      metricsStore.slowQueries.push(entry);
      if (metricsStore.slowQueries.length > 20) {
        metricsStore.slowQueries.shift();
      }
    }
  },

  getStats() {
    const now = Date.now();
    const oneSecAgo = now - 1000;
    const oneMinAgo = now - 60000;

    // Filter active windows
    const inLastSec = metricsStore.queryLog.filter((q) => q.timestamp >= oneSecAgo);
    const inLastMin = metricsStore.queryLog.filter((q) => q.timestamp >= oneMinAgo);

    const totalDuration = inLastMin.reduce((sum, q) => sum + q.duration, 0);
    const avgDuration = inLastMin.length > 0 ? Math.round(totalDuration / inLastMin.length) : 0;

    return {
      totalQueries: metricsStore.totalQueries,
      queriesPerSecond: inLastSec.length,
      queriesLastMinute: inLastMin.length,
      avgQueryDurationMs: avgDuration,
      slowQueriesCount: metricsStore.slowQueries.length,
      recentQueries: metricsStore.queryLog.slice(-8).reverse(),
      slowQueries: metricsStore.slowQueries.slice(-5).reverse(),
      poolerHost: SUPABASE_POOLER_HOST,
      poolerIp: SUPABASE_POOLER_IP,
    };
  },
};

const prismaClientSingleton = () => {
  const dbUrl = resolvePoolerUrl(process.env.DATABASE_URL);
  const client = new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: [
      { level: "query", emit: "event" },
      { level: "warn", emit: "stdout" },
      { level: "error", emit: "stdout" },
    ],
    errorFormat: "pretty",
  });

  client.$on("query", (e) => {
    dbMetrics.recordQuery(e.query, e.duration);
  });

  return client;
};

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Lightweight background keep-alive to keep remote PostgreSQL pool connection warm
// Prevents the 2+ second TCP/TLS reconnect penalty after idle periods
if (!globalForPrisma.__prismaHeartbeatStarted) {
  globalForPrisma.__prismaHeartbeatStarted = true;
  const heartbeatInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1;`;
      metricsStore.lastHeartbeat = new Date().toISOString();
    } catch {
      // Ignore background heartbeat hiccups
    }
  }, 45 * 1000);
  if (heartbeatInterval?.unref) {
    heartbeatInterval.unref();
  }

  // Trigger background proactive cache warming
  import("./warmup.js")
    .then(({ triggerWarmup }) => triggerWarmup())
    .catch(() => {});
}

export default prisma;


