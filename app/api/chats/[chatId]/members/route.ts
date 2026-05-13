import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb, getUsersByEmails } from "@/lib/chat";

const memberSchema = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(100)
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
      { error: "فقط سازنده گروه یا کانال فعلا می‌تواند عضو اضافه کند." },
      { status: 403 }
    );
  }

  const emails = Array.from(new Set(parsed.data.emails.map((email) => email.toLowerCase())));
  const users = await getUsersByEmails(emails);

  if (users.length !== emails.length) {
    const found = new Set(users.map((user) => user.email));
    const missing = emails.filter((email) => !found.has(email));
    return NextResponse.json(
      { error: `این ایمیل‌ها پیدا نشدند: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

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
          $each: users.map((user) => user.id)
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
