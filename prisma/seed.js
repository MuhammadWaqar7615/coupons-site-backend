const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Load .env variables
try {
  require("dotenv").config();
} catch { }

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Resolve Supabase pooler host to IP if needed
const SUPABASE_POOLER_HOST = "aws-0-ap-southeast-2.pooler.supabase.com";
const SUPABASE_POOLER_IP = "3.106.102.114";
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes(SUPABASE_POOLER_HOST)) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replaceAll(
    SUPABASE_POOLER_HOST,
    SUPABASE_POOLER_IP
  );
}

const prisma = new PrismaClient();
const KEY_LENGTH = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || "123456").trim();
  const adminName = process.env.ADMIN_NAME || "Administrator";

  console.log("🌱 Seeding database...");
  console.log(`👤 Target Admin Email:    ${adminEmail}`);
  console.log(`🔑 Target Admin Password: ${adminPassword}`);

  const passwordHash = await hashPassword(adminPassword);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash,
      role: "ADMIN",
      status: "ENABLED",
      verified: true,
    },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      status: "ENABLED",
      verified: true,
      description: "Default System Administrator seeded via prisma/seed.js",
    },
  });

  console.log(`✅ Admin user seeded successfully!`);
  console.log(`   User ID:  ${adminUser.id}`);
  console.log(`   Email:    ${adminUser.email}`);
  console.log(`   Role:     ${adminUser.role}`);
  console.log(`   Status:   ${adminUser.status}`);

  // Seed default site settings if none exist
  const existingSettings = await prisma.siteSettings.findFirst();
  if (!existingSettings) {
    await prisma.siteSettings.create({
      data: {
        siteName: "Codice Sconto",
        siteUrl: "https://www.codicesconto.com",
        contactEmail: "info@codicesconto.com",
        description: "Best coupons and discounts online",
      },
    });
    console.log("✅ Default Site Settings seeded.");
  }

  // Seed default theme settings if none exist
  const existingTheme = await prisma.theme.findFirst();
  if (!existingTheme) {
    await prisma.theme.create({
      data: {
        primaryColor: "#1B2A4A",
        secondaryColor: "#243B6A",
      },
    });
    console.log("✅ Default Theme Settings seeded.");
  }

  console.log("✨ Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
