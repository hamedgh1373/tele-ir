import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { normalizeIranPhone } from "@/lib/sms";

const schema = z.object({
  phone: z.string().trim().min(5).max(30)
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "شماره معتبر نیست." }, { status: 400 });
  }

  const normalized = normalizeIranPhone(parsed.data.phone);
  if (!normalized) {
    return NextResponse.json({ error: "شماره معتبر نیست." }, { status: 400 });
  }

  const digits = normalized.replace(/\D+/g, "");
  const candidates = Array.from(
    new Set([
      normalized,
      `+${digits}`,
      digits.startsWith("98") ? `0${digits.slice(2)}` : "",
      digits.startsWith("98") ? digits : ""
    ].filter(Boolean))
  );

  const db = await getDb();
  const user = await db.collection("users").findOne({ phone: { $in: candidates } });
  if (!user) {
    return NextResponse.json({ error: "این کاربر وجود ندارد." }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db.collection("user_contacts").updateOne(
    { ownerId: session.user.id, phone: normalized },
    {
      $set: {
        ownerId: session.user.id,
        phone: normalized,
        contactName: "",
        matchedUserId: user.id,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone
    }
  });
}
