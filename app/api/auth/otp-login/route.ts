import { randomUUID } from "crypto";
import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { getTeleirDb } from "@/lib/mongodb";
import { consumeRateLimit, getClientIpFromHeaders, hashOtpCode, secureCookieOptions } from "@/lib/security";
import { normalizeIranPhone } from "@/lib/sms";

type DbUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  phone?: string;
};

const otpCookieName = "teleir_otp_request";
const otpErrorCookieName = "teleir_otp_error";

function buildPhoneCandidates(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  return Array.from(new Set([
    phone,
    digits ? `+${digits}` : "",
    digits.startsWith("98") ? `0${digits.slice(2)}` : "",
    digits.startsWith("98") ? digits : "",
    digits.startsWith("9") && digits.length === 10 ? `0${digits}` : "",
    digits.startsWith("9") && digits.length === 10 ? `+98${digits}` : ""
  ].filter(Boolean)));
}

async function ensureUserIdentity(db: Awaited<ReturnType<typeof getTeleirDb>>, user: (DbUser & { _id?: unknown }) | null, normalizedPhone: string) {
  if (!user) return null;
  const updates: Record<string, unknown> = {};
  if (!user.id) {
    updates.id = randomUUID();
    user.id = updates.id as string;
  }
  if (!user.phone || user.phone !== normalizedPhone) {
    updates.phone = normalizedPhone;
    user.phone = normalizedPhone;
  }
  if (!user.email) {
    const fallbackEmail = `${normalizedPhone.replace(/\D+/g, "")}@teleir.local`;
    updates.email = fallbackEmail;
    user.email = fallbackEmail;
  }
  if (!user.name) {
    updates.name = user.email || normalizedPhone;
    user.name = updates.name as string;
  }
  if (!user.role) {
    updates.role = "user";
    user.role = "user";
  }
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    await db.collection("users").updateOne({ _id: user._id } as any, { $set: updates });
  }
  return user;
}

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path
    }
  });
}

function redirectWithError(error: string) {
  const response = redirectTo(`/login?error=${encodeURIComponent(error)}`);
  response.cookies.set(otpErrorCookieName, encodeURIComponent(error), {
    ...secureCookieOptions(2 * 60)
  });
  return response;
}

export async function POST(request: Request) {
  const body = Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
  const phoneInput = String(body.phone || "");
  const requestId = String(body.requestId || "").trim();
  const otpCode = String(body.otpCode || "").replace(/\D+/g, "").slice(0, 6);
  const phone = normalizeIranPhone(phoneInput);
  const clientIp = getClientIpFromHeaders(request.headers);

  if (!phone || !requestId || otpCode.length !== 6) {
    return redirectWithError("کد یا شماره معتبر نیست.");
  }

  const db = await getTeleirDb();
  const ipLimit = await consumeRateLimit({
    scope: "otp-verify-ip",
    key: clientIp,
    limit: 40,
    windowMs: 15 * 60 * 1000
  });
  if (!ipLimit.ok) {
    return redirectWithError("تعداد تلاش‌های ورود زیاد شده است. کمی بعد دوباره امتحان کنید.");
  }

  const requestLimit = await consumeRateLimit({
    scope: "otp-verify-request",
    key: requestId,
    limit: 8,
    windowMs: 10 * 60 * 1000
  });
  if (!requestLimit.ok) {
    await db.collection("otp_codes").updateOne(
      { id: requestId, usedAt: null },
      { $set: { usedAt: new Date().toISOString(), blockedAt: new Date().toISOString() } }
    );
    return redirectWithError("تعداد تلاش برای این کد بیش از حد مجاز بوده است.");
  }

  const user = await ensureUserIdentity(
    db,
    (await db.collection("users").findOne({ phone: { $in: buildPhoneCandidates(phone) } })) as (DbUser & { _id?: unknown }) | null,
    phone
  );

  if (!user) {
    return redirectWithError("کاربری با این شماره پیدا نشد.");
  }

  const otp = await db.collection("otp_codes").findOne({
    id: requestId,
    userId: user.id,
    phone,
    codeHash: hashOtpCode(otpCode),
    usedAt: null
  });

  if (!otp || new Date(String(otp.expiresAt)).getTime() < Date.now()) {
    return redirectWithError("کد تایید صحیح نیست یا منقضی شده است.");
  }

  await db.collection("otp_codes").updateOne(
    { id: requestId },
    { $set: { usedAt: new Date().toISOString() } }
  );

  const maxAge = 60 * 60 * 24 * 180;
  const sid = randomUUID();
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET || "",
    maxAge,
    token: {
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      sid
    }
  });
  const response = redirectTo("/app");

  response.cookies.set("next-auth.session-token", token, {
    ...secureCookieOptions(maxAge)
  });
  response.cookies.delete(otpCookieName);
  response.cookies.delete(otpErrorCookieName);

  return response;
}
