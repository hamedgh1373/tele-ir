import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb, getUsersByEmails } from "@/lib/chat";

const memberSchema = z.object({
  emails: z.array(z.string().trim().email()).max(100).optional(),
  memberIds: z.array(z.string().trim().min(1)).max(100).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await context.params;
  const body = await request.json();
  const parsed = memberSchema.safeParse(body);

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

  if (chat.type === "direct") {
    return NextResponse.json(
      { error: "برای گفتگوی خصوصی نمی‌شود عضو اضافه کرد." },
      { status: 400 }
    );
  }

  if (!chat.adminIds?.includes(session.user.id)) {
    return NextResponse.json(
      { error: "فقط ادمین‌های گروه یا کانال می‌توانند عضو اضافه کنند." },
      { status: 403 }
    );
  }

  const emails = Array.from(new Set((parsed.data.emails || []).map((email) => email.toLowerCase())));
  const memberIds = Array.from(new Set((parsed.data.memberIds || []).map(String)));
  if (emails.length === 0 && memberIds.length === 0) {
    return NextResponse.json(
      { error: "حداقل یک عضو انتخاب کنید." },
      { status: 400 }
    );
  }

  const usersByEmail = await getUsersByEmails(emails);
  if (usersByEmail.length !== emails.length) {
    const found = new Set(usersByEmail.map((user) => user.email));
    const missing = emails.filter((email) => !found.has(email));
    return NextResponse.json(
      { error: `این ایمیل‌ها پیدا نشدند: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  const usersById = memberIds.length
    ? await db.collection("users").find({ id: { $in: memberIds } }).toArray()
    : [];
  if (usersById.length !== memberIds.length) {
    const found = new Set(usersById.map((user: any) => String(user.id)));
    const missing = memberIds.filter((id) => !found.has(id));
    return NextResponse.json(
      { error: `این کاربران پیدا نشدند: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  const users = Array.from(
    new Map(
      [...usersByEmail, ...usersById].map((user: any) => [String(user.id), user])
    ).values()
  );

  const nextParticipantIds = Array.from(
    new Set([...(chat.participantIds || []), ...users.map((user) => user.id)])
  );
  const nextUnreadCounts = nextParticipantIds.reduce<Record<string, number>>(
    (counts, participantId) => {
      counts[participantId] = chat.unreadCounts?.[participantId] ?? 0;
      return counts;
    },
    {}
  );

  await db.collection("chats").updateOne(
    { id: chatId },
    {
      $addToSet: {
        participantIds: {
          $each: users.map((user: any) => String(user.id))
        }
      },
      $set: {
        updatedAt: new Date().toISOString(),
        unreadCounts: nextUnreadCounts
      }
    }
  );

  return NextResponse.json({ ok: true });
}
