import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listUserSessions, revokeUserSession, touchUserSession } from "@/lib/session-store";

const touchSchema = z.object({
  userAgent: z.string().max(500).optional().default("")
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessions = await listUserSessions(session.user.id);
  return NextResponse.json({
    currentSid: session.user.sid || "",
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      userAgent: s.userAgent || "",
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt
    }))
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.sid) {
    return NextResponse.json({ error: "No session id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = touchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await touchUserSession({
    sessionId: session.user.sid,
    userId: session.user.id,
    userAgent: parsed.data.userAgent
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetSid = searchParams.get("sid") || "";
  if (!targetSid) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }
  if (!session.user.sid) {
    return NextResponse.json({ error: "No current session id" }, { status: 400 });
  }

  const result = await revokeUserSession(session.user.id, targetSid, session.user.sid);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
