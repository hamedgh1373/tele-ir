import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

const schema = z.object({ action: z.enum(["promote", "demote", "remove"]) });

export async function PATCH(request: Request, context: { params: Promise<{ chatId: string; userId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId, userId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id)) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const isCreator = chat.createdByUserId === session.user.id;
  const isAdmin = chat.adminIds?.includes(session.user.id);
  const targetIsAdmin = chat.adminIds?.includes(userId);
  if (!isAdmin && !isCreator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (userId === chat.createdByUserId && parsed.data.action !== "promote") {
    return NextResponse.json({ error: "سازنده اصلی قابل حذف یا تنزل نیست." }, { status: 400 });
  }
  const now = new Date().toISOString();
  if (parsed.data.action === "promote") {
    if (!isCreator) return NextResponse.json({ error: "فقط سازنده می‌تواند ادمین تعیین کند." }, { status: 403 });
    await db.collection("chats").updateOne({ id: chatId }, { $addToSet: { adminIds: userId }, $set: { updatedAt: now } } as any);
  }
  if (parsed.data.action === "demote") {
    if (!isCreator) return NextResponse.json({ error: "فقط سازنده می‌تواند ادمین را حذف کند." }, { status: 403 });
    await db.collection("chats").updateOne({ id: chatId }, { $pull: { adminIds: userId }, $set: { updatedAt: now } } as any);
  }
  if (parsed.data.action === "remove") {
    if (!isCreator && targetIsAdmin) {
      return NextResponse.json({ error: "فقط سازنده می‌تواند ادمین‌ها را حذف کند." }, { status: 403 });
    }
    if (!isCreator && !targetIsAdmin && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.collection("chats").updateOne(
      { id: chatId },
      {
        $pull: { participantIds: userId, adminIds: userId },
        $unset: { [`unreadCounts.${userId}`]: "" },
        $set: { updatedAt: now }
      } as any
    );
  }
  return NextResponse.json({ ok: true });
}
