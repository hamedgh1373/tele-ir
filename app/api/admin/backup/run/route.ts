import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { createBackups } from "@/lib/backup";

function isAdmin(role?: string) {
  return role === "admin" || role === "superadmin";
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const files = await createBackups(session.user.email, "manual");
  return NextResponse.json({ ok: true, files });
}
