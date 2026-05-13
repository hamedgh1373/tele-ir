import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listBackups } from "@/lib/backup";

function isAdmin(role?: string) {
  return role === "admin" || role === "superadmin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const backups = await listBackups();
  return NextResponse.json({ backups });
}
