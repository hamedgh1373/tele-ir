import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getSmsSettings, maskApiKey, saveSmsSettings } from "@/lib/sms";

const schema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().trim().optional().default(""),
  lineNumber: z.string().trim().optional().default(""),
  templateId: z.coerce.number().int().positive().optional(),
  templateVariable: z.string().trim().min(2).max(20).optional().default("OTP")
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (role !== "admin" && role !== "superadmin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) {
    return guard.error;
  }

  const sms = await getSmsSettings();
  return NextResponse.json({
    sms: sms
      ? {
          enabled: sms.enabled,
          lineNumber: sms.lineNumber || "",
          templateId: sms.templateId || null,
          templateVariable: sms.templateVariable || "OTP",
          hasApiKey: Boolean(sms.apiKey),
          apiKeyMasked: maskApiKey(sms.apiKey)
        }
      : {
          enabled: false,
          lineNumber: "",
          templateId: null,
          templateVariable: "OTP",
          hasApiKey: false,
          apiKeyMasked: ""
        }
  });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) {
    return guard.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const current = await getSmsSettings();
  const apiKey = parsed.data.apiKey || current?.apiKey || "";

  await saveSmsSettings({
    provider: "smsir",
    enabled: parsed.data.enabled,
    apiKey,
    lineNumber: parsed.data.lineNumber || undefined,
    templateId: parsed.data.templateId || undefined,
    templateVariable: parsed.data.templateVariable || "OTP",
    updatedAt: new Date().toISOString(),
    updatedBy: guard.session.user.email
  });

  return NextResponse.json({ ok: true });
}
