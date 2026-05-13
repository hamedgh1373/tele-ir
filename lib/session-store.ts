import { getTeleirDb } from "@/lib/mongodb";

export async function touchUserSession(input: {
  sessionId: string;
  userId: string;
  userAgent?: string;
}) {
  const db = await getTeleirDb();
  const now = new Date().toISOString();

  await db.collection("user_sessions").updateOne(
    { sessionId: input.sessionId },
    {
      $set: {
        sessionId: input.sessionId,
        userId: input.userId,
        userAgent: input.userAgent || "",
        lastSeenAt: now,
        revokedAt: null
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );
}

export async function listUserSessions(userId: string) {
  const db = await getTeleirDb();
  return db
    .collection("user_sessions")
    .find({ userId, revokedAt: null })
    .sort({ lastSeenAt: -1 })
    .toArray();
}

export async function revokeUserSession(
  userId: string,
  sessionId: string,
  actorSessionId: string
) {
  const db = await getTeleirDb();
  const now = new Date().toISOString();
  const actorSession = await db
    .collection("user_sessions")
    .findOne({ userId, sessionId: actorSessionId, revokedAt: null });
  if (!actorSession) {
    return { ok: false, error: "Current session not found" };
  }
  const createdAt = new Date(String(actorSession.createdAt || now)).getTime();
  if (Date.now() - createdAt < 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      error: "تا ۲۴ ساعت از لاگین این سشن فعلی نگذرد، حذف سشن‌های دیگر مجاز نیست."
    };
  }
  if (sessionId === actorSessionId) {
    return { ok: false, error: "حذف سشن فعلی از این بخش مجاز نیست." };
  }
  await db.collection("user_sessions").updateOne(
    { sessionId, userId },
    { $set: { revokedAt: now } }
  );
  return { ok: true };
}

export async function isSessionRevoked(sessionId: string) {
  const db = await getTeleirDb();
  const row = await db.collection("user_sessions").findOne({ sessionId });
  return Boolean(row?.revokedAt);
}

export async function revokeCurrentSession(userId: string, sessionId: string) {
  const db = await getTeleirDb();
  const now = new Date().toISOString();
  await db.collection("user_sessions").updateOne(
    { userId, sessionId },
    { $set: { revokedAt: now, lastSeenAt: now } }
  );
}
