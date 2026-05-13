import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { normalizeIranPhone } from "@/lib/sms";

const contactSchema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().min(5).max(30)
});

const saveContactsSchema = z.object({
  contacts: z.array(contactSchema).min(1).max(1000)
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const contacts = await db
    .collection("user_contacts")
    .find({ ownerId: session.user.id, matchedUserId: { $exists: true, $ne: null } })
    .toArray();

  const matchedIds = Array.from(new Set(contacts.map((c) => String(c.matchedUserId))));
  const users = await db
    .collection("users")
    .find({ id: { $in: matchedIds } }, { projection: { _id: 0, id: 1, name: 1, email: 1, phone: 1 } })
    .toArray();
  const userById = new Map(users.map((user) => [String(user.id), user]));

  const items = contacts
    .map((contact) => {
      const user = userById.get(String(contact.matchedUserId));
      if (!user) {
        return null;
      }
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || contact.phone
      };
    })
    .filter(Boolean);

  return NextResponse.json({ contacts: items });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saveContactsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const normalizedContacts = parsed.data.contacts
    .map((contact) => ({
      name: contact.name || "",
      phone: normalizeIranPhone(contact.phone)
    }))
    .filter((contact) => Boolean(contact.phone));

  if (normalizedContacts.length === 0) {
    return NextResponse.json({ error: "شماره معتبر پیدا نشد." }, { status: 400 });
  }

  const uniquePhones = Array.from(new Set(normalizedContacts.map((c) => c.phone)));
  const db = await getDb();
  const matchedUsers = await db
    .collection("users")
    .find({ phone: { $in: uniquePhones } }, { projection: { _id: 0, id: 1, phone: 1 } })
    .toArray();
  const matchedByPhone = new Map(matchedUsers.map((user) => [String(user.phone), String(user.id)]));

  const now = new Date().toISOString();
  for (const contact of normalizedContacts) {
    const matchedUserId = matchedByPhone.get(contact.phone) || null;
    await db.collection("user_contacts").updateOne(
      { ownerId: session.user.id, phone: contact.phone },
      {
        $set: {
          ownerId: session.user.id,
          phone: contact.phone,
          contactName: contact.name,
          matchedUserId,
          updatedAt: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true, total: normalizedContacts.length });
}
