import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { emailTemplateDefaults } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const saved = await prisma.emailTemplate.findMany();
    const byKey = new Map(saved.map((template) => [template.templateKey, template]));

    const templates = emailTemplateDefaults.map((template) => {
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

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("GET /api/email-templates Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
