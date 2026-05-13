import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";

const schema = z.object({
  fileName: z.string().trim().min(5).max(200)
});

function isAdmin(role?: string) {
  return role === "admin" || role === "superadmin";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  await restoreBackup(parsed.data.fileName, session.user.email);
  return NextResponse.json({ ok: true });
}
