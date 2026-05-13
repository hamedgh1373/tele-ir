import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildUnreadUpdate, getDb, getUserById } from "@/lib/chat";
import { encryptText } from "@/lib/message-crypto";
import { writeTeleirLog } from "@/lib/logger";

const DEFAULT_UPLOAD_LIMIT_MB = 100;
const MONGODB_DOCUMENT_SAFE_LIMIT_MB = 12;
const BLOCKED_UPLOAD_TYPES = new Set([
  "application/javascript",
  "application/x-httpd-php",
  "application/x-msdownload",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "text/xml"
]);

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "file";
}

function getParticipantIds(chat: any): string[] {
  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const memberIds = Array.isArray(chat?.members) ? chat.members : [];
  return Array.from(new Set([...participantIds, ...memberIds].map(String).filter(Boolean)));
}

function isChatParticipant(chat: any, userId: string): boolean {
  return getParticipantIds(chat).includes(userId);
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
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });

  if (!chat || !isChatParticipant(chat, session.user.id)) {
    await writeTeleirLog("warn", "upload.POST", "chat not found or user not participant", {
      chatId,
      userId: session.user.id,
      chatExists: Boolean(chat),
      participantIds: getParticipantIds(chat)
    });
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.type === "channel" && !chat.adminIds?.includes(session.user.id)) {
    return NextResponse.json(
      { error: "فقط سازنده کانال فعلا می‌تواند فایل ارسال کند." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const uploaded = formData.get("file");
  const caption = String(formData.get("caption") || "").trim().slice(0, 4000);

  if (!(uploaded instanceof File)) {
    return NextResponse.json({ error: "فایلی انتخاب نشده است." }, { status: 400 });
  }

  const sender = await getUserById(session.user.id);
  const uploadLimitMb = sender?.uploadLimitMb ?? DEFAULT_UPLOAD_LIMIT_MB;
  const effectiveLimitMb = Math.min(uploadLimitMb, MONGODB_DOCUMENT_SAFE_LIMIT_MB);
  const maxBytes = effectiveLimitMb * 1024 * 1024;

  if (uploaded.size <= 0) {
    return NextResponse.json({ error: "فایل خالی است." }, { status: 400 });
  }

  if (BLOCKED_UPLOAD_TYPES.has((uploaded.type || "").toLowerCase())) {
    return NextResponse.json({ error: "این نوع فایل به دلایل امنیتی مجاز نیست." }, { status: 400 });
  }

  if (uploaded.size > maxBytes) {
    return NextResponse.json(
      { error: `حداکثر حجم مجاز برای ذخیره مستقیم در دیتابیس ${effectiveLimitMb} مگابایت است.` },
      { status: 413 }
    );
  }

  const fileId = randomUUID();
  const safeOriginalName = sanitizeName(uploaded.name || "file");
  const buffer = Buffer.from(await uploaded.arrayBuffer());
  const now = new Date().toISOString();
  const encryptedCaption = encryptText(caption);
  const encryptedPreview = encryptText(caption || `File: ${safeOriginalName}`);
  const participantIds = getParticipantIds(chat);
  const unreadCounts = buildUnreadUpdate(
    participantIds,
    session.user.id,
    chat.unreadCounts
  );

  const fileDoc = {
    id: fileId,
    chatId,
    uploaderId: session.user.id,
    originalName: safeOriginalName,
    mimeType: uploaded.type || "application/octet-stream",
    size: uploaded.size,
    data: buffer,
    storage: "mongodb",
    createdAt: now
  };

  const attachment = {
    fileId,
    name: fileDoc.originalName,
    mimeType: fileDoc.mimeType,
    size: fileDoc.size,
    isImage: fileDoc.mimeType.startsWith("image/"),
    url: `/api/files/${fileId}`
  };

  const message = {
    id: randomUUID(),
    chatId,
    senderId: session.user.id,
    senderName: session.user.name,
    senderEmail: session.user.email,
    text: "",
    textEnc: encryptedCaption,
    attachment,
    createdAt: now,
    deliveredTo: [session.user.id],
    readBy: [session.user.id]
  };

  try {
    await db.collection("files").insertOne(fileDoc);
    await db.collection("messages").insertOne(message);
  } catch (error) {
    await writeTeleirLog("error", "upload.POST", "failed to insert upload records", {
      chatId,
      userId: session.user.id,
      fileId,
      error: error instanceof Error ? error.message : String(error)
    });
    await db.collection("files").deleteOne({ id: fileId }).catch(() => undefined);
    return NextResponse.json({ error: "خطا در ذخیره اطلاعات فایل. لاگ ثبت شد." }, { status: 500 });
  }

  await db.collection("chats").updateOne(
    { id: chatId },
    {
      $set: {
        updatedAt: now,
        lastMessageAt: now,
        lastMessageText: "",
        lastMessageTextEnc: encryptedPreview,
        unreadCounts,
        participantIds
      }
    }
  );

  return NextResponse.json({
    message: {
      ...message,
      text: caption
    }
  });
}
