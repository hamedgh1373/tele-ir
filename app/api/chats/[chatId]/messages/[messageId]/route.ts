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


const updateSchema = z.object({
  text: z.string().trim().min(1).max(4000)
});

async function refreshChatLastMessage(chatId: string) {
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  const latest = await db
    .collection("messages")
    .find({ chatId, deletedFor: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  const now = new Date().toISOString();
  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const unreadEntries = await Promise.all(
    participantIds.map(async (participantId: string) => {
      const count = await db.collection("messages").countDocuments({
        chatId,
        senderId: { $ne: participantId },
        readBy: { $nin: [participantId] }
      });
      return [participantId, count] as const;
    })
  );
  const unreadCounts = Object.fromEntries(unreadEntries);
  const latestText = latest?.textEnc
    ? decryptText(String(latest.textEnc))
    : latest?.text || "";

  await db.collection("chats").updateOne(
    { id: chatId },
    {
      $set: {
        updatedAt: now,
        lastMessageAt: latest?.createdAt || null,
        lastMessageText: "",
        lastMessageTextEnc: latest
          ? encryptText(latestText || (latest.attachment?.name ? `File: ${latest.attachment.name}` : ""))
          : "",
        unreadCounts
      }
    }
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId, messageId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
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

  const message = await db.collection("messages").findOne({ id: messageId, chatId });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (message.senderId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const editedAt = new Date().toISOString();
  await db.collection("messages").updateOne(
    { id: messageId, chatId },
    {
      $set: {
        text: "",
        textEnc: encryptText(parsed.data.text),
        editedAt
      }
    }
  );

  if (chat.lastMessageAt === message.createdAt) {
    await db.collection("chats").updateOne(
      { id: chatId },
      {
        $set: {
          updatedAt: editedAt,
          lastMessageText: "",
          lastMessageTextEnc: encryptText(parsed.data.text)
        }
      }
    );
  }

  const updated = await db.collection("messages").findOne({ id: messageId, chatId });
  const mapped = updated
    ? {
        ...updated,
        text: updated.textEnc ? decryptText(String(updated.textEnc)) : updated.text || ""
      }
    : null;
  return NextResponse.json({ message: mapped });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId, messageId } = await context.params;
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const message = await db.collection("messages").findOne({ id: messageId, chatId });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const body = await request.json().catch(() => null);
  const mode = body?.mode || url.searchParams.get("mode") || "everyone";

  if (mode === "me") {
    await db.collection("messages").updateOne(
      { id: messageId, chatId },
      { $addToSet: { deletedFor: session.user.id } }
    );
    return NextResponse.json({ ok: true });
  }

  if (message.senderId !== session.user.id && !chat.adminIds?.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteMessageFiles([message as Record<string, any>]);
  await db.collection("messages").deleteOne({ id: messageId, chatId });
  await refreshChatLastMessage(chatId);

  return NextResponse.json({ ok: true });
}
