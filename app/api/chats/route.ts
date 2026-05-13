import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  buildUnreadCounts,
  ensureDirectChat,
  getDb,
  getUserByEmail,
  getUsersByEmails,
  listChatsForUser,
} from "@/lib/chat";
import { maybeRunScheduledBackup } from "@/lib/backup";

const createChatSchema = z.object({
  type: z.enum(["direct", "group", "channel"]),
  title: z.string().trim().max(80).optional(),
  email: z.string().trim().email().optional(),
  memberEmails: z.array(z.string().trim().email()).max(100).optional(),
  memberIds: z.array(z.string().trim().min(1)).max(100).optional(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await maybeRunScheduledBackup(session.user.email || session.user.id);

  const db = await getDb();
  const userChats = await db
    .collection("chats")
    .find({ participantIds: session.user.id }, { projection: { id: 1 } })
    .toArray();
  const chatIds = userChats.map((chat) => String(chat.id));

  if (chatIds.length > 0) {
    await db.collection("messages").updateMany(
      {
        chatId: { $in: chatIds },
        senderId: { $ne: session.user.id },
        readBy: { $nin: [session.user.id] },
      },
      {
        $addToSet: {
          deliveredTo: session.user.id,
        },
      },
    );
  }

  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1";
  const chats = await listChatsForUser(session.user.id, { includeArchived });
  return NextResponse.json({
    currentUser: session.user,
    chats,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createChatSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.type === "direct") {
    if (!input.email) {
      return NextResponse.json(
        { error: "ایمیل مقصد لازم است." },
        { status: 400 },
      );
    }

    const target = await getUserByEmail(input.email);

    if (!target) {
      return NextResponse.json(
        { error: "کاربری با این ایمیل پیدا نشد." },
        { status: 404 },
      );
    }

    const chat = await ensureDirectChat(session.user.id, target.id);
    return NextResponse.json({ chat });
  }

  if (!input.title) {
    return NextResponse.json(
      { error: "عنوان گروه یا کانال لازم است." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const requestedEmails = Array.from(
    new Set((input.memberEmails || []).map((email) => email.toLowerCase())),
  ).filter((email) => email !== session.user.email);
  const requestedIds = Array.from(new Set(input.memberIds || [])).filter(
    (id) => id !== session.user.id,
  );

  const membersByEmail = await getUsersByEmails(requestedEmails);
  const membersById = requestedIds.length
    ? await db
        .collection("users")
        .find({ id: { $in: requestedIds } })
        .toArray()
    : [];

  const foundEmails = new Set(membersByEmail.map((member) => member.email));
  const missingEmails = requestedEmails.filter(
    (email) => !foundEmails.has(email),
  );

  if (missingEmails.length > 0) {
    return NextResponse.json(
      { error: `این ایمیل‌ها پیدا نشدند: ${missingEmails.join(", ")}` },
      { status: 404 },
    );
  }

  const participantIds = Array.from(
    new Set([
      session.user.id,
      ...membersByEmail.map((member) => member.id),
      ...membersById.map((member: any) => String(member.id)),
    ]),
  );
  const now = new Date().toISOString();

  const chat = {
    id: randomUUID(),
    type: input.type,
    title: input.title,
    participantIds,
    adminIds: [session.user.id],
    createdByUserId: session.user.id,
    createdAt: now,
    updatedAt: now,
    unreadCounts: buildUnreadCounts(participantIds),
  };

  await db.collection("chats").insertOne(chat);
  return NextResponse.json({ chat });
}
