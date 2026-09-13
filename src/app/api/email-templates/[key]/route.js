import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { emailTemplateDefaults } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);
    const { key } = await params;
    const defaultTemplate = emailTemplateDefaults.find((template) => template.templateKey === key);
    if (!defaultTemplate) {
      return NextResponse.json({ message: "Email template not found." }, { status: 404 });
    }

    const dbItem = await prisma.emailTemplate.findUnique({ where: { templateKey: key } });
    return NextResponse.json({
      template: {
        ...defaultTemplate,
        fromName: dbItem?.fromName || "CodiceSconto",
        sendAsPlainText: dbItem?.sendAsPlainText || false,
        status: dbItem?.status ? dbItem.status.toLowerCase() : "enabled",
        subject: dbItem?.subject || defaultTemplate.subject,
        message: dbItem?.message || defaultTemplate.message,
        _id: dbItem?.id || defaultTemplate.templateKey,
      },
    });
  } catch (error) {
    console.error("GET /api/email-templates/[key] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const { key } = await params;
    const defaultTemplate = emailTemplateDefaults.find((template) => template.templateKey === key);
    if (!defaultTemplate) {
      return NextResponse.json({ message: "Email template not found." }, { status: 404 });
    }

    const body = await request.json();
    if (!body.subject?.trim() || !body.message?.trim()) {
      return NextResponse.json({ message: "Subject and message are required." }, { status: 400 });
    }

    const template = await prisma.emailTemplate.upsert({
      where: { templateKey: key },
      create: {
        templateKey: key,
        title: defaultTemplate.title,
        fromName: String(body.fromName || "CodiceSconto").trim(),
        sendAsPlainText: Boolean(body.sendAsPlainText),
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
        subject: body.subject.trim(),
        message: body.message,
      },
      update: {
        title: defaultTemplate.title,
        fromName: String(body.fromName || "CodiceSconto").trim(),
        sendAsPlainText: Boolean(body.sendAsPlainText),
        status: (body.status || "enabled").toUpperCase() === "DISABLED" ? "DISABLED" : "ENABLED",
        subject: body.subject.trim(),
        message: body.message,
      },
    });

    return NextResponse.json({
      message: "Email template saved successfully.",
      template: {
        ...template,
        _id: template.id,
        status: template.status.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("PUT /api/email-templates/[key] Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
