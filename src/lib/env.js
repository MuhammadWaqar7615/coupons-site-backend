export function validateEnv() {
  const missing = [];

  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (!process.env.SESSION_SECRET) {
    missing.push("SESSION_SECRET");
  }

  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    console.error(
      `[FATAL] Missing strictly mandatory environment variables: ${missing.join(", ")}`
    );
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing mandatory environment variables: ${missing.join(", ")}`);
    }
  }
}

validateEnv();

