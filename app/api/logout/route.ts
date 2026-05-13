import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { revokeCurrentSession } from "@/lib/session-store";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: true });
  }
  if (session.user.sid) {
    await revokeCurrentSession(session.user.id, session.user.sid);
  }
  return NextResponse.json({ ok: true });
}
