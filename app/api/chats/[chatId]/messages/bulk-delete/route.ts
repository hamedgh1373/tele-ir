import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { decryptText, encryptText } from "@/lib/message-crypto";

async function deleteMessageFiles(messages: Array<Record<string, any>>) {
  const db = await getDb();
  const fileIds = messages
    .map((message) => message.attachment?.fileId)
    .filter((fileId): fileId is string => typeof fileId === "string" && fileId.length > 0);
  if (fileIds.length > 0) {
    await db.collection("files").deleteMany({ id: { $in: fileIds } });
  }
}

const schema = z.object({
  messageIds: z.array(z.string().trim().min(1)).min(1).max(100),
  mode: z.enum(["me", "everyone"]).default("me")
});

async function refreshChatLastMessage(chatId: string) {
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  const latest = await db
    .collection("messages")
    .find({ chatId })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const unreadEntries = await Promise.all(
    participantIds.map(async (participantId: string) => {
      const count = await db.collection("messages").countDocuments({
        chatId,
        senderId: { $ne: participantId },
        readBy: { $nin: [participantId] },
        deletedFor: { $ne: participantId }
      });
      return [participantId, count] as const;
    })
  );

  const latestText = latest?.textEnc
    ? decryptText(String(latest.textEnc))
    : latest?.text || "";
  const preview = latestText || (latest?.attachment?.name ? `File: ${latest.attachment.name}` : "");
  const now = new Date().toISOString();

  await db.collection("chats").updateOne(
    { id: chatId },
    {
      $set: {
        updatedAt: now,
        lastMessageAt: latest?.createdAt || null,
        lastMessageText: "",
        lastMessageTextEnc: latest ? encryptText(preview) : "",
        unreadCounts: Object.fromEntries(unreadEntries)
      }
    }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const uniqueIds = Array.from(new Set(parsed.data.messageIds));
  const messages = (await db
    .collection("messages")
    .find({ chatId, id: { $in: uniqueIds }, deletedFor: { $ne: session.user.id } })
    .toArray()) as Array<Record<string, any>>;

  if (messages.length === 0) {
    return NextResponse.json({ deletedCount: 0, mode: parsed.data.mode });
  }

  if (parsed.data.mode === "me") {
    await db.collection("messages").updateMany(
      { chatId, id: { $in: messages.map((message: Record<string, any>) => message.id) } },
      { $addToSet: { deletedFor: session.user.id } }
    );
    return NextResponse.json({ deletedCount: messages.length, mode: "me" });
  }

  const canDeleteAll = messages.every(
    (message: Record<string, any>) => message.senderId === session.user.id || chat.adminIds?.includes(session.user.id)
  );
  if (!canDeleteAll) {
    return NextResponse.json(
      { error: "Only your messages or admin-managed messages can be deleted for everyone." },
      { status: 403 }
    );
  }

  await deleteMessageFiles(messages);
  const result = await db.collection("messages").deleteMany({
    chatId,
    id: { $in: messages.map((message: Record<string, any>) => message.id) }
  });
  await refreshChatLastMessage(chatId);

  return NextResponse.json({ deletedCount: result.deletedCount || 0, mode: "everyone" });
}
