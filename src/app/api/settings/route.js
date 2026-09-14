import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ROLES } from "@/lib/auth/roles";
import { appCache, CACHE_TAGS } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaults = {
  maintenanceMode: false,
  languageDirection: "ltr",
  currencySymbol: "€",
  currencyPosition: "before",
  decimalSeparator: ".",
  decimalNumber: 2,
  dateFormat: "DD/MM/YYYY",
  timeZone: "Europe/Rome",
  defaultPages: {},
  companyInfo: {},
  smtp: { encryption: "tls", port: 587 },
  googleAnalyticsCode: "",
  googleRecaptchaKey: "",
  googleRecaptchaSecret: "",
};

export async function GET() {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const data = await appCache.wrap(
      "site_settings",
      async () => {
        const settings = await prisma.siteSettings.findFirst();
        return {
          settings: {
            ...defaults,
            ...(settings || {}),
            _id: settings?.id,
            defaultPages: { ...defaults.defaultPages, ...(settings?.defaultPages || {}) },
            companyInfo: { ...defaults.companyInfo, ...(settings?.companyInfo || {}) },
            smtp: { ...defaults.smtp, ...(settings?.smtp || {}) },
          },
        };
      },
      3600,
      CACHE_TAGS.SETTINGS
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/settings Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    await requireRole([ROLES.ADMIN, ROLES.ADMINISTRATION]);

    const body = await request.json();
    const existing = await prisma.siteSettings.findFirst();

    const smtpPayload = { ...(body.smtp || {}) };
    if (!smtpPayload.password && existing?.smtp?.password) {
      smtpPayload.password = existing.smtp.password;
    }

    const payload = {
      maintenanceMode: Boolean(body.maintenanceMode),
      languageDirection: body.languageDirection === "rtl" ? "rtl" : "ltr",
      currencySymbol: body.currencySymbol || defaults.currencySymbol,
      currencyPosition: ["before", "after", "before-space", "after-space"].includes(body.currencyPosition)
        ? body.currencyPosition
        : "before",
      decimalSeparator: body.decimalSeparator === "," ? "," : ".",
      decimalNumber: Math.max(0, Math.min(6, Number(body.decimalNumber) || 0)),
      dateFormat: body.dateFormat || defaults.dateFormat,
      timeZone: body.timeZone || defaults.timeZone,
      defaultPages: body.defaultPages || {},
      companyInfo: body.companyInfo || {},
      smtp: smtpPayload,
      googleAnalyticsCode: body.googleAnalyticsCode || "",
      googleRecaptchaKey: body.googleRecaptchaKey || "",
      googleRecaptchaSecret: body.googleRecaptchaSecret || "",
    };

    let settings;
    if (existing) {
      settings = await prisma.siteSettings.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      settings = await prisma.siteSettings.create({
        data: payload,
      });
    }

    const safeSmtp = { ...(settings.smtp || {}), password: "" };

    appCache.invalidateTag(CACHE_TAGS.SETTINGS);

    return NextResponse.json({
      message: "Site settings saved successfully.",
      settings: {
        ...settings,
        _id: settings.id,
        smtp: safeSmtp,
      },
    });
  } catch (error) {
    console.error("PUT /api/settings Error:", error);
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return NextResponse.json({ message: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
