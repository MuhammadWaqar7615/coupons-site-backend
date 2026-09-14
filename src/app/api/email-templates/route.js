import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { emailTemplateDefaults } from "@/lib/emailTemplates";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const templates = await appCache.wrap(
      "email-templates:all",
      async () => {
        const saved = await prisma.emailTemplate.findMany();
        const byKey = new Map(saved.map((template) => [template.templateKey, template]));

        return emailTemplateDefaults.map((template) => {
          const dbItem = byKey.get(template.templateKey);
          return {
            ...template,
            fromName: dbItem?.fromName || "CodiceSconto",
            sendAsPlainText: dbItem?.sendAsPlainText || false,
            status: dbItem?.status ? dbItem.status.toLowerCase() : "enabled",
            subject: dbItem?.subject || template.subject,
            message: dbItem?.message || template.message,
            _id: dbItem?.id || template.templateKey,
          };
        });
      },
      300,
      [CACHE_TAGS.EMAIL_TEMPLATES]
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("GET /api/email-templates Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
