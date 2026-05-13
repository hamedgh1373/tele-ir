import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { decryptText } from "@/lib/message-crypto";
import { getDb, getUsersByIds } from "@/lib/chat";

export async function GET(
  _request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId } = await context.params;
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !chat.participantIds?.includes(session.user.id))
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const users = await getUsersByIds(chat.participantIds || []);
  const media = await db
    .collection("messages")
    .find({
      chatId,
      attachment: { $exists: true },
      deletedFor: { $ne: session.user.id },
    })
    .sort({ createdAt: -1 })
    .limit(80)
    .toArray();
  const personalPinnedIds =
    chat.pinnedMessageIdsByUser?.[session.user.id] ||
    chat.pinnedMessageIds ||
    [];
  const pinned = personalPinnedIds.length
    ? await db
        .collection("messages")
        .find({ chatId, id: { $in: personalPinnedIds } })
        .toArray()
    : [];
  return NextResponse.json({
    chat,
    members: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin: chat.adminIds?.includes(user.id) || false,
    })),
    media: media.map((m) => ({
      id: m.id,
      text: m.textEnc ? decryptText(String(m.textEnc)) : m.text || "",
      attachment: m.attachment,
      createdAt: m.createdAt,
    })),
    pinned: pinned.map((m) => ({
      id: m.id,
      text: m.textEnc ? decryptText(String(m.textEnc)) : m.text || "",
      senderName: m.senderName,
      createdAt: m.createdAt,
    })),
  });
}
