import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const chats = await db.collection("chats").find({ participantIds: session.user.id }, { projection: { participantIds: 1 } }).toArray();
  const ids = Array.from(new Set(chats.flatMap((chat) => chat.participantIds || []))).filter((id) => id !== session.user.id);
  const rows = await db.collection("presence").find({ userId: { $in: ids } }).toArray();
  const now = Date.now();
  return NextResponse.json({ presence: Object.fromEntries(rows.map((row) => [row.userId, { lastSeenAt: row.lastSeenAt, isOnline: now - new Date(row.lastSeenAt).getTime() < 45000, typingInChatId: row.typingInChatId || "" }])) });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  await db.collection("presence").updateOne({ userId: session.user.id }, { $set: { userId: session.user.id, lastSeenAt: new Date().toISOString(), typingInChatId: typeof body.typingInChatId === "string" ? body.typingInChatId : "" } }, { upsert: true });
  return NextResponse.json({ ok: true });
}
