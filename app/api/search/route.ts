import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb, listChatsForUser } from "@/lib/chat";
import { decryptText } from "@/lib/message-crypto";

function includesText(value: unknown, query: string) {
  return String(value || "").toLowerCase().includes(query);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") || "").trim();

  if (!rawQuery) {
    return NextResponse.json({ chats: [], contacts: [], messages: [] });
  }

  const q = rawQuery.toLowerCase();
  const db = await getDb();
  const chats = await listChatsForUser(session.user.id, { includeArchived: true });
  const matchingChats = chats
    .filter((chat: any) =>
      includesText(chat.title, q) ||
      includesText(chat.subtitle, q) ||
      includesText(chat.lastMessageText, q) ||
      includesText(chat.type, q)
    )
    .slice(0, 20)
    .map((chat: any) => ({
      id: chat.id,
      type: chat.type,
      title: chat.title || "بدون عنوان",
      subtitle: chat.subtitle || chat.lastMessageText || chat.type,
    }));

  const chatIds = chats.map((chat: any) => chat.id);
  const contacts = await db
    .collection("user_contacts")
    .find({ ownerId: session.user.id, matchedUserId: { $exists: true, $ne: null } })
    .limit(300)
    .toArray();
  const contactUserIds = contacts.map((contact: any) => String(contact.matchedUserId || "")).filter(Boolean);
  const contactUsers = contactUserIds.length
    ? await db.collection("users").find({ id: { $in: contactUserIds } }).limit(80).toArray()
    : [];
  const contactRows = contactUsers
    .filter((user: any) =>
      includesText(user.name, q) ||
      includesText(user.email, q) ||
      includesText(user.phone, q) ||
      includesText(user.mobile, q)
    )
    .slice(0, 20)
    .map((user: any) => ({
      id: String(user.id),
      name: String(user.name || user.email || user.phone || "مخاطب"),
      email: String(user.email || ""),
      phone: String(user.phone || user.mobile || ""),
    }))
    .filter((user) => user.email);

  const rawMessages = chatIds.length
    ? await db
        .collection("messages")
        .find({
          chatId: { $in: chatIds },
          deletedFor: { $ne: session.user.id },
        })
        .sort({ createdAt: -1 })
        .limit(300)
        .toArray()
    : [];
  const chatTitleById = new Map(chats.map((chat: any) => [chat.id, chat.title || "گفتگو"]));
  const messageRows = rawMessages
    .map((message: any) => {
      const text = message.textEnc ? decryptText(String(message.textEnc)) : String(message.text || "");
      const fileName = String(message.attachment?.name || "");
      return {
        message,
        text,
        searchable: `${text} ${fileName} ${message.senderName || ""}`.toLowerCase(),
      };
    })
    .filter((item) => item.searchable.includes(q))
    .slice(0, 30)
    .map(({ message, text }) => ({
      chatId: String(message.chatId),
      chatTitle: String(chatTitleById.get(message.chatId) || "گفتگو"),
      messageId: String(message.id),
      senderName: String(message.senderName || ""),
      text: text || (message.attachment?.name ? `File: ${message.attachment.name}` : ""),
      createdAt: String(message.createdAt || ""),
    }));

  return NextResponse.json({
    chats: matchingChats,
    contacts: contactRows,
    messages: messageRows,
  });
}
