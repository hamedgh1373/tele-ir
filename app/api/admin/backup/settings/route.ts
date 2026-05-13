import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getBackupSettings, saveBackupSettings } from "@/lib/backup";

const schema = z.object({
  enabled: z.boolean(),
  intervalHours: z.coerce.number().int().min(1).max(168),
  retainCount: z.coerce.number().int().min(1).max(200)
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

  const settings = await getBackupSettings();
  return NextResponse.json({
    backup: settings || {
      enabled: false,
      intervalHours: 6,
      retainCount: 12
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

  await saveBackupSettings({
    enabled: parsed.data.enabled,
    intervalHours: parsed.data.intervalHours,
    retainCount: parsed.data.retainCount,
    updatedAt: new Date().toISOString(),
    updatedBy: guard.session.user.email
  });

  return NextResponse.json({ ok: true });
}
