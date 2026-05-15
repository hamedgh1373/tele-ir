import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { localeCookieName } from "@/lib/locale";

const schema = z.object({
  language: z.enum(locales)
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne(
    { id: session.user.id },
    { projection: { _id: 0, preferences: 1 } }
  );

  const language = isLocale((user as { preferences?: { language?: string } } | null)?.preferences?.language)
    ? ((user as { preferences?: { language?: string } }).preferences?.language as typeof defaultLocale)
    : defaultLocale;

  const response = NextResponse.json({ preferences: { language } });
  response.cookies.set(localeCookieName, language, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("users").updateOne(
    { id: session.user.id },
    {
      $set: {
        "preferences.language": parsed.data.language,
        updatedAt: new Date().toISOString()
      }
    }
  );

  const response = NextResponse.json({ ok: true, preferences: { language: parsed.data.language } });
  response.cookies.set(localeCookieName, parsed.data.language, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}
