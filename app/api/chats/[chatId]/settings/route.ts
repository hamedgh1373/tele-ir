import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

const schema = z.object({
  action: z.enum([
    "mute",
    "unmute",
    "archive",
    "unarchive",
    "pin",
    "unpin",
    "pinChat",
    "unpinChat",
    "rename",
    "clearHistory",
    "leave",
    "deleteChat",
  ]),
  messageId: z.string().trim().optional(),
  title: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 },
    );
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id))
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const now = new Date().toISOString();
  const action = parsed.data.action;
  if (action === "mute")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $addToSet: { mutedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "unmute")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $pull: { mutedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "archive")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $addToSet: { archivedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "unarchive")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $pull: { archivedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "pin") {
    if (!parsed.data.messageId)
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 },
      );
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $addToSet: {
          [`pinnedMessageIdsByUser.${session.user.id}`]: parsed.data.messageId,
        },
        $set: { updatedAt: now },
      } as any);
  }
  if (action === "unpin") {
    if (parsed.data.messageId) {
      await db
        .collection("chats")
        .updateOne({ id: chatId }, {
          $pull: {
            [`pinnedMessageIdsByUser.${session.user.id}`]:
              parsed.data.messageId,
          },
          $set: { updatedAt: now },
        } as any);
    } else {
      await db
        .collection("chats")
        .updateOne(
          { id: chatId },
          {
            $set: {
              [`pinnedMessageIdsByUser.${session.user.id}`]: [],
              updatedAt: now,
            },
          },
        );
    }
  }
  if (action === "pinChat")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $addToSet: { pinnedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "unpinChat")
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $pull: { pinnedFor: session.user.id },
        $set: { updatedAt: now },
      } as any);
  if (action === "rename") {
    if (!chat.adminIds?.includes(session.user.id))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await db
      .collection("chats")
      .updateOne(
        { id: chatId },
        { $set: { title: parsed.data.title, updatedAt: now } },
      );
  }
  if (action === "clearHistory") {
    await db
      .collection("messages")
      .updateMany({ chatId }, {
        $addToSet: { deletedFor: session.user.id },
      } as any);
  }
  if (action === "leave") {
    if (chat.type === "saved")
      return NextResponse.json(
        { error: "Saved Messages cannot be left" },
        { status: 400 },
      );
    await db
      .collection("chats")
      .updateOne({ id: chatId }, {
        $pull: { participantIds: session.user.id, adminIds: session.user.id },
        $set: { updatedAt: now },
      } as any);
  }
  if (action === "deleteChat") {
    if (chat.createdByUserId !== session.user.id) {
      return NextResponse.json({ error: "فقط سازنده می‌تواند گروه یا کانال را حذف کند." }, { status: 403 });
    }
    const messages = await db.collection("messages").find({ chatId }, { projection: { "attachment.fileId": 1 } }).toArray();
    const fileIds = messages.map((message: any) => message.attachment?.fileId).filter(Boolean);
    if (fileIds.length) {
      await db.collection("files").deleteMany({ id: { $in: fileIds } });
    }
    await db.collection("messages").deleteMany({ chatId });
    await db.collection("chats").deleteOne({ id: chatId });
    return NextResponse.json({ ok: true, deleted: true });
  }
  const updated = await db.collection("chats").findOne({ id: chatId });
  return NextResponse.json({ ok: true, chat: updated });
}
