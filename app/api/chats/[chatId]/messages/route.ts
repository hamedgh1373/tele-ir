import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { buildUnreadUpdate, clearUnreadForUser, getDb, listMessages } from "@/lib/chat";
import { encryptText } from "@/lib/message-crypto";
import { writeTeleirLog } from "@/lib/logger";

const messageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  replyTo: z.object({
    messageId: z.string().trim().min(1),
    senderName: z.string().trim().optional(),
    text: z.string().trim().optional()
  }).optional()
});

function getParticipantIds(chat: any): string[] {
  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const memberIds = Array.isArray(chat?.members) ? chat.members : [];
  return Array.from(new Set([...participantIds, ...memberIds].map(String).filter(Boolean)));
}

function isChatParticipant(chat: any, userId: string): boolean {
  return getParticipantIds(chat).includes(userId);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });

  if (!chat || !isChatParticipant(chat, session.user.id)) {
    await writeTeleirLog("warn", "messages.GET", "chat not found or user not participant", {
      chatId,
      userId: session.user.id,
      chatExists: Boolean(chat),
      participantIds: getParticipantIds(chat)
    });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const participantIds = getParticipantIds(chat);
  const nextUnreadCounts = clearUnreadForUser(
    participantIds,
    session.user.id,
    chat.unreadCounts
  );
  const unreadChanged = (chat.unreadCounts?.[session.user.id] ?? 0) > 0;

  if (unreadChanged) {
    await db.collection("chats").updateOne(
      { id: chatId },
      {
        $set: {
          unreadCounts: nextUnreadCounts
        }
      }
    );
  }

  await db.collection("messages").updateMany(
    {
      chatId,
      senderId: { $ne: session.user.id }
    },
    {
      $addToSet: {
        deliveredTo: session.user.id,
        readBy: session.user.id
      }
    }
  );

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 80);
  const before = url.searchParams.get("before") || undefined;
  const messages = await listMessages(chatId, session.user.id, limit, before);
  return NextResponse.json({
    chat: {
      ...chat,
      unreadCounts: nextUnreadCounts
    },
    messages
  });
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
  const body = await request.json().catch(() => null);
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    await writeTeleirLog("warn", "messages.POST", "invalid request body", {
      chatId,
      userId: session.user.id,
      issues: parsed.error.issues
    });
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });

  if (!chat || !isChatParticipant(chat, session.user.id)) {
    await writeTeleirLog("warn", "messages.POST", "chat not found or user not participant", {
      chatId,
      userId: session.user.id,
      chatExists: Boolean(chat),
      participantIds: getParticipantIds(chat)
    });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.type === "channel" && !chat.adminIds?.includes(session.user.id)) {
    return NextResponse.json(
      { error: "فقط سازنده کانال فعلا می‌تواند پیام ارسال کند." },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const encryptedText = encryptText(parsed.data.text);
  const participantIds = getParticipantIds(chat);
  const unreadCounts = buildUnreadUpdate(
    participantIds,
    session.user.id,
    chat.unreadCounts
  );
  const message = {
    id: crypto.randomUUID(),
    chatId,
    senderId: session.user.id,
    senderName: session.user.name,
    senderEmail: session.user.email,
    text: "",
    textEnc: encryptedText,
    createdAt: now,
    deliveredTo: [session.user.id],
    readBy: [session.user.id],
    replyTo: parsed.data.replyTo || null
  };

  try {
    await db.collection("messages").insertOne(message);
  } catch (error) {
    await writeTeleirLog("error", "messages.POST", "failed to insert message", {
      chatId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "خطا در ذخیره پیام. لاگ ثبت شد." }, { status: 500 });
  }

  await db.collection("chats").updateOne(
    { id: chatId },
    {
      $set: {
        updatedAt: now,
        lastMessageAt: now,
        lastMessageText: "",
        lastMessageTextEnc: encryptedText,
        unreadCounts,
        participantIds
      }
    }
  );

  return NextResponse.json({
    message: {
      ...message,
      text: parsed.data.text
    }
  });
}
