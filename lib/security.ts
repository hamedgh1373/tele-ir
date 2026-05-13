import { createHash } from "crypto";
import { getTeleirDb } from "@/lib/mongodb";

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getClientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip") || "unknown";
}

export async function consumeRateLimit(input: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
}) {
  const db = await getTeleirDb();
  const now = Date.now();
  const resetAt = new Date(now + input.windowMs).toISOString();

  await db.collection("security_rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("security_rate_limits").createIndex({ scope: 1, key: 1 }, { unique: true });

  const result = await db.collection("security_rate_limits").findOneAndUpdate(
    {
      scope: input.scope,
      key: input.key
    },
    [
      {
        $set: {
          scope: input.scope,
          key: input.key,
          count: {
            $cond: [
              { $lt: ["$expiresAt", "$$NOW"] },
              1,
              { $add: [{ $ifNull: ["$count", 0] }, 1] }
            ]
          },
          expiresAt: {
            $cond: [
              { $lt: ["$expiresAt", "$$NOW"] },
              new Date(resetAt),
              "$expiresAt"
            ]
          },
          updatedAt: "$$NOW",
          createdAt: { $ifNull: ["$createdAt", "$$NOW"] }
        }
      }
    ],
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  const count = Number(result?.count || 0);
  const expiresAt = result?.expiresAt ? new Date(String(result.expiresAt)).getTime() : now + input.windowMs;

  return {
    ok: count <= input.limit,
    count,
    remaining: Math.max(0, input.limit - count),
    retryAfterSec: Math.max(1, Math.ceil((expiresAt - now) / 1000))
  };
}

export function hashOtpCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge
  };
}
