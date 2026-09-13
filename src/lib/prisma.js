import { PrismaClient } from "@prisma/client";
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

const prismaClientSingleton = () => {
  const dbUrl = resolvePoolerUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    errorFormat: "pretty",
  });
};

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

