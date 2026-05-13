import { randomUUID } from "crypto";
import { getTeleirDb } from "@/lib/mongodb";
import { decryptText } from "@/lib/message-crypto";

export type ChatType = "direct" | "group" | "channel" | "saved";

export type AppUser = {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: "admin" | "user";
  uploadLimitMb?: number;
  avatar?: { updatedAt?: string };
  avatarUrl?: string;
  passwordHash?: string;
  createdAt: string;
  createdBy: string;
};

type ChatRecord = {
  id: string;
  type: ChatType;
  title: string;
  participantIds: string[];
  adminIds: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageText?: string;
  lastMessageTextEnc?: string;
  lastMessageAt?: string;
  unreadCounts?: Record<string, number>;
  pinnedMessageIds?: string[];
  pinnedMessageIdsByUser?: Record<string, string[]>;
  pinnedFor?: string[];
  archivedFor?: string[];
  mutedFor?: string[];
  blockedUserIds?: string[];
  adminPermissions?: Record<string, string[]>;
};

export function buildUnreadCounts(participantIds: string[]) {
  return participantIds.reduce<Record<string, number>>(
    (counts, participantId) => {
      counts[participantId] = 0;
      return counts;
    },
    {},
  );
}

export function buildUnreadUpdate(
  participantIds: string[],
  senderId: string,
  currentCounts?: Record<string, number>,
) {
  return participantIds.reduce<Record<string, number>>(
    (counts, participantId) => {
      const previous = currentCounts?.[participantId] ?? 0;
      counts[participantId] = participantId === senderId ? 0 : previous + 1;
      return counts;
    },
    {},
  );
}

export function clearUnreadForUser(
  participantIds: string[],
  userId: string,
  currentCounts?: Record<string, number>,
) {
  return participantIds.reduce<Record<string, number>>(
    (counts, participantId) => {
      counts[participantId] =
        participantId === userId ? 0 : (currentCounts?.[participantId] ?? 0);
      return counts;
    },
    {},
  );
}

export async function getDb() {
  return getTeleirDb();
}

function normalizeParticipantIds(chat: any): string[] {
  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const members = Array.isArray(chat?.members) ? chat.members : [];
  return Array.from(new Set([...participantIds, ...members].map(String).filter(Boolean)));
}

export async function getUsersByIds(ids: string[]) {
  const db = await getDb();
  const users = (await db
    .collection("users")
    .find({ id: { $in: ids } })
    .toArray()) as unknown as AppUser[];

  return users;
}

export async function getUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDb();
  return (await db.collection("users").findOne({
    email: normalizedEmail,
  })) as AppUser | null;
}

export async function getUserById(userId: string) {
  const db = await getDb();
  return (await db.collection("users").findOne({
    id: userId,
  })) as AppUser | null;
}

export async function getUsersByEmails(emails: string[]) {
  const normalizedEmails = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );

  if (normalizedEmails.length === 0) {
    return [];
  }

  const db = await getDb();
  const users = (await db
    .collection("users")
    .find({
      email: { $in: normalizedEmails },
    })
    .toArray()) as unknown as AppUser[];

  return users;
}

export async function ensureDirectChat(userId: string, otherUserId: string) {
  const db = await getDb();
  const participantIds = [userId, otherUserId].sort();

  const existing = (await db.collection("chats").findOne({
    type: "direct",
    participantIds,
  })) as ChatRecord | null;

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const chat: ChatRecord = {
    id: randomUUID(),
    type: "direct",
    title: "",
    participantIds,
    adminIds: [userId],
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
    unreadCounts: buildUnreadCounts(participantIds),
  };

  await db.collection("chats").insertOne(chat);
  return chat;
}

export async function ensureSavedMessagesChat(userId: string) {
  const db = await getDb();
  const existing = (await db.collection("chats").findOne({
    type: "saved",
    $or: [{ participantIds: [userId] }, { members: [userId] }, { participantIds: userId }, { members: userId }],
  })) as ChatRecord | null;

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const chat: ChatRecord = {
    id: randomUUID(),
    type: "saved",
    title: "Saved Messages",
    participantIds: [userId],
    adminIds: [userId],
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
    unreadCounts: buildUnreadCounts([userId]),
  };

  await db.collection("chats").insertOne(chat);
  return chat;
}

export async function listChatsForUser(
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  const db = await getDb();
  const chats = (await db
    .collection("chats")
    .find(
      options.includeArchived
        ? { $or: [{ participantIds: userId }, { members: userId }] }
        : {
            $or: [{ participantIds: userId }, { members: userId }],
            archivedFor: { $ne: userId },
          },
    )
    .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
    .toArray()) as unknown as ChatRecord[];

  for (const chat of chats as any[]) {
    chat.participantIds = normalizeParticipantIds(chat);
  }

  const allUserIds = Array.from(
    new Set(chats.flatMap((chat) => chat.participantIds)),
  );
  const users = await getUsersByIds(allUserIds);
  const userMap = new Map(users.map((user) => [user.id, user]));

  const mapped = chats.map((chat) => {
    const personalPinnedMessageIds =
      chat.pinnedMessageIdsByUser?.[userId] || chat.pinnedMessageIds || [];
    const chatListPins = chat.pinnedFor?.includes(userId)
      ? ["__chat__", ...personalPinnedMessageIds]
      : personalPinnedMessageIds;
    const lastMessageText = chat.lastMessageTextEnc
      ? decryptText(chat.lastMessageTextEnc)
      : chat.lastMessageText || "";

    if (chat.type === "saved") {
      return {
        ...chat,
        title: "Saved Messages",
        subtitle: "",
        avatarUrl: undefined,
        lastMessageText,
        unreadCount: chat.unreadCounts?.[userId] ?? 0,
        isMuted: chat.mutedFor?.includes(userId) || false,
        isArchived: chat.archivedFor?.includes(userId) || false,
        pinnedMessageIds: chatListPins,
      };
    }

    if (chat.type === "direct") {
      const other = chat.participantIds
        .map((id) => userMap.get(id))
        .find((user) => user && user.id !== userId);

      return {
        ...chat,
        title: other?.name || other?.email || "گفتگوی جدید",
        subtitle: "",
        avatarUrl: other?.avatar ? `/api/users/${other.id}/avatar?t=${other.avatar.updatedAt || ""}` : undefined,
        lastMessageText,
        unreadCount: chat.unreadCounts?.[userId] ?? 0,
        isMuted: chat.mutedFor?.includes(userId) || false,
        isArchived: chat.archivedFor?.includes(userId) || false,
        pinnedMessageIds: chatListPins,
      };
    }

    return {
      ...chat,
      lastMessageText,
      unreadCount: chat.unreadCounts?.[userId] ?? 0,
      subtitle:
        chat.type === "group"
          ? `${chat.participantIds.length} عضو`
          : `${chat.participantIds.length} دنبال‌کننده`,
      isMuted: chat.mutedFor?.includes(userId) || false,
      isArchived: chat.archivedFor?.includes(userId) || false,
      pinnedMessageIds: chatListPins,
    };
  });

  return mapped.sort((a, b) => {
    if (a.type === "saved" && b.type !== "saved") {
      return -1;
    }
    if (a.type !== "saved" && b.type === "saved") {
      return 1;
    }
    const aPinned = a.pinnedFor?.includes(userId) || false;
    const bPinned = b.pinnedFor?.includes(userId) || false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const aTime = new Date(
      a.lastMessageAt || a.updatedAt || a.createdAt,
    ).getTime();
    const bTime = new Date(
      b.lastMessageAt || b.updatedAt || b.createdAt,
    ).getTime();
    return bTime - aTime;
  });
}

export async function listMessages(
  chatId: string,
  userId?: string,
  limit = 80,
  before?: string,
) {
  const db = await getDb();
  const query: Record<string, unknown> = { chatId };
  if (userId) {
    query.deletedFor = { $ne: userId };
  }
  if (before) {
    query.createdAt = { $lt: before };
  }
  const rows = await db
    .collection("messages")
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 120)))
    .toArray();
  rows.reverse();

  return rows.map((row) => ({
    ...row,
    text: row.textEnc ? decryptText(String(row.textEnc)) : row.text || "",
  }));
}
