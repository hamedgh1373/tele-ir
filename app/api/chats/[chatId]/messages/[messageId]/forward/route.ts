import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { buildUnreadUpdate, getDb } from "@/lib/chat";
import { decryptText, encryptText } from "@/lib/message-crypto";

const forwardSchema = z.object({
  targetChatId: z.string().trim().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId, messageId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = forwardSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const sourceChat = await db.collection("chats").findOne({ id: chatId });
  const targetChat = await db.collection("chats").findOne({ id: parsed.data.targetChatId });

  if (!sourceChat || !sourceChat.participantIds?.includes(session.user.id)) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (!targetChat || !targetChat.participantIds?.includes(session.user.id)) {
    return NextResponse.json({ error: "Target chat not found" }, { status: 404 });
  }

  if (targetChat.type === "channel" && !targetChat.adminIds?.includes(session.user.id)) {
    return NextResponse.json(
      { error: "در این کانال فقط مدیر می‌تواند پیام فوروارد کند." },
      { status: 403 }
    );
  }

  const sourceMessage = await db.collection("messages").findOne({ id: messageId, chatId });

  if (!sourceMessage) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const text = sourceMessage.textEnc
    ? decryptText(String(sourceMessage.textEnc))
    : sourceMessage.text || "";
  const preview = text || (sourceMessage.attachment?.name ? `File: ${sourceMessage.attachment.name}` : "");
  const now = new Date().toISOString();
  const encryptedText = encryptText(text);
  const unreadCounts = buildUnreadUpdate(
    targetChat.participantIds,
    session.user.id,
    targetChat.unreadCounts
  );
  const originalForwardInfo = sourceMessage.forwardedFrom || {
    chatId,
    messageId,
    senderName: sourceMessage.senderName || "",
    senderEmail: sourceMessage.senderEmail || ""
  };

  const message = {
    id: randomUUID(),
    chatId: targetChat.id,
    senderId: session.user.id,
    senderName: session.user.name,
    senderEmail: session.user.email,
    text: "",
    textEnc: encryptedText,
    attachment: sourceMessage.attachment,
    forwardedFrom: originalForwardInfo,
    createdAt: now,
    deliveredTo: [session.user.id],
    readBy: [session.user.id]
  };

  await db.collection("messages").insertOne(message);
  await db.collection("chats").updateOne(
    { id: targetChat.id },
    {
      $set: {
        updatedAt: now,
        lastMessageAt: now,
        lastMessageText: "",
        lastMessageTextEnc: encryptText(preview),
        unreadCounts
      }
    }
  );

  return NextResponse.json({
    message: {
      ...message,
      text
    }
  });
}
