import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { buildUnreadUpdate, getDb } from "@/lib/chat";
import { decryptText, encryptText } from "@/lib/message-crypto";

const schema = z.object({
  sourceChatId: z.string().trim().min(1),
  targetChatId: z.string().trim().min(1),
  messageIds: z.array(z.string().trim().min(1)).min(1).max(100),
  hideSender: z.boolean().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const db = await getDb();
  const { sourceChatId, targetChatId, messageIds, hideSender } = parsed.data;
  const sourceChat = await db.collection("chats").findOne({ id: sourceChatId });
  const targetChat = await db.collection("chats").findOne({ id: targetChatId });
  if (!sourceChat || !sourceChat.participantIds?.includes(session.user.id)) return NextResponse.json({ error: "Source chat not found" }, { status: 404 });
  if (!targetChat || !targetChat.participantIds?.includes(session.user.id)) return NextResponse.json({ error: "Target chat not found" }, { status: 404 });
  if (targetChat.type === "channel" && !targetChat.adminIds?.includes(session.user.id)) return NextResponse.json({ error: "در این کانال فقط مدیر می‌تواند پیام فوروارد کند." }, { status: 403 });

  const sourceMessages = await db.collection("messages").find({ chatId: sourceChatId, id: { $in: messageIds }, deletedFor: { $ne: session.user.id } }).sort({ createdAt: 1 }).toArray();
  const nowBase = Date.now();
  const clonedFiles: Array<Record<string, any>> = [];
  const messages: Array<Record<string, any>> = [];

  for (let index = 0; index < sourceMessages.length; index += 1) {
    const sourceMessage = sourceMessages[index];
    const text = sourceMessage.textEnc ? decryptText(String(sourceMessage.textEnc)) : sourceMessage.text || "";
    const originalForwardInfo = hideSender ? null : (sourceMessage.forwardedFrom || {
      chatId: sourceChatId,
      messageId: sourceMessage.id,
      senderName: sourceMessage.senderName || "",
      senderEmail: sourceMessage.senderEmail || ""
    });

    let attachment = sourceMessage.attachment || undefined;
    if (sourceMessage.attachment?.fileId) {
      const sourceFile = await db.collection("files").findOne({ id: sourceMessage.attachment.fileId });
      if (sourceFile?.data) {
        const nextFileId = randomUUID();
        clonedFiles.push({
          ...sourceFile,
          _id: undefined,
          id: nextFileId,
          chatId: targetChatId,
          uploaderId: session.user.id,
          clonedFromFileId: sourceFile.id,
          createdAt: new Date(nowBase + index).toISOString()
        });
        attachment = {
          ...sourceMessage.attachment,
          fileId: nextFileId,
          url: `/api/files/${nextFileId}`
        };
      } else {
        attachment = undefined;
      }
    }

    messages.push({
      id: randomUUID(),
      chatId: targetChatId,
      senderId: session.user.id,
      senderName: session.user.name,
      senderEmail: session.user.email,
      text: "",
      textEnc: encryptText(text),
      attachment,
      forwardedFrom: originalForwardInfo,
      createdAt: new Date(nowBase + index).toISOString(),
      deliveredTo: [session.user.id],
      readBy: [session.user.id]
    });
  }

  if (messages.length === 0) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  const fileDocs = clonedFiles.map(({ _id, ...file }) => file);
  if (fileDocs.length > 0) await db.collection("files").insertMany(fileDocs);
  await db.collection("messages").insertMany(messages);
  const latest = messages[messages.length - 1];
  const latestText = latest.textEnc ? decryptText(String(latest.textEnc)) : "";
  await db.collection("chats").updateOne({ id: targetChatId }, { $set: { updatedAt: latest.createdAt, lastMessageAt: latest.createdAt, lastMessageText: "", lastMessageTextEnc: encryptText(latestText || (latest.attachment?.name ? `File: ${latest.attachment.name}` : "")), unreadCounts: buildUnreadUpdate(targetChat.participantIds, session.user.id, targetChat.unreadCounts) } });
  return NextResponse.json({ messages: messages.map((m) => ({ ...m, text: m.textEnc ? decryptText(String(m.textEnc)) : "" })) });
}
