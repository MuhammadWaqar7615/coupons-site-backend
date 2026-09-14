import { getSession } from "./session";
import { ROLES } from "./roles";
import prisma from "@/lib/prisma";
import { verifyPassword } from "./password";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export function normalizeRole(role) {
  if (!role) return "editor";
  const roleMap = {
    admin: "administration",
    administration: "administration",
    editor: "editor",
    subscriber: "subscribor",
    subscribor: "subscribor",
  };
  return roleMap[String(role).toLowerCase()] || "editor";
}

export async function authenticateUser(email, password) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPassword = (password || "").trim();

  if (!cleanEmail || !cleanPassword) return null;

  console.log(`[AUTH] Login attempt for email: "${cleanEmail}" (pwd len: ${cleanPassword.length})`);

  try {
    const user = await appCache.wrap(
      `user_auth:${cleanEmail}`,
      async () => {
        console.log(`[AUTH] Checking database for user: "${cleanEmail}"...`);
        const found = await prisma.user.findUnique({
          where: { email: cleanEmail },
        });
        return found || null;
      },
      120,
      CACHE_TAGS.USERS
    );

    let activeUser = user;
    if (activeUser && activeUser.status === "ENABLED") {
      let isMatch = await verifyPassword(cleanPassword, activeUser.passwordHash);

      // If cached password check failed, fetch fresh record from DB in case password was changed/seeded
      if (!isMatch) {
        const freshUser = await prisma.user.findUnique({
          where: { email: cleanEmail },
        });
        if (freshUser && freshUser.status === "ENABLED") {
          isMatch = await verifyPassword(cleanPassword, freshUser.passwordHash);
          if (isMatch) {
            appCache.set(`user_auth:${cleanEmail}`, freshUser, 300, CACHE_TAGS.USERS);
            activeUser = freshUser;
          }
        }
      }

      if (isMatch) {
        console.log(`[AUTH] Database login SUCCESS for user: "${cleanEmail}"`);
        return {
          userId: activeUser.id,
          email: activeUser.email,
          role: normalizeRole(activeUser.role),
          name: activeUser.name,
        };
      }
    }
  } catch (dbErr) {
    console.warn(`[AUTH] Database query warning during login:`, dbErr?.message || dbErr);
  }

  console.warn(`[AUTH] Login FAILED for email: "${cleanEmail}"`);
  return null;
}

export async function checkAdminAuth() {
  const session = await getSession();
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 };
  }
  const role = (session.user.role || "").toLowerCase();
  if (role !== ROLES.ADMIN && role !== ROLES.ADMINISTRATION) {
    return { error: "Forbidden", status: 403 };
  }
  return null;
}

export async function requireAuth() {
  const session = await getSession();

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  return session.user;
}

export async function requireRole(allowedRoles) {
  const user = await requireAuth();

  const normalizedAllowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map((r) =>
    normalizeRole(r)
  );
  const currentRole = normalizeRole(user.role);

  const hasAccess = normalizedAllowed.includes(currentRole);

  if (!hasAccess) {
    throw new Error("Forbidden");
  }

  return user;
}
