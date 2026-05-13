import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

const schema = z.object({ emoji: z.string().trim().min(1).max(16) });

export async function POST(request: Request, context: { params: Promise<{ chatId: string; messageId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId, messageId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id)) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const key = `reactions.${parsed.data.emoji}`;
  const message = await db.collection("messages").findOne({ id: messageId, chatId });
  const current = message?.reactions?.[parsed.data.emoji] || [];
  const update = current.includes(session.user.id)
    ? { $pull: { [key]: session.user.id } }
    : { $addToSet: { [key]: session.user.id } };
  await db.collection("messages").updateOne({ id: messageId, chatId }, update as any);
  const updated = await db.collection("messages").findOne({ id: messageId, chatId });
  return NextResponse.json({ reactions: updated?.reactions || {} });
}
