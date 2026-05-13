import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getTeleirDb } from "@/lib/mongodb";
import { makeOtpCode, normalizeIranPhone, sendSmsIrOtp } from "@/lib/sms";

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

function loginErrorPath(error: string) {
  return `/login?error=${encodeURIComponent(error)}`;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const wantsJson = contentType.includes("application/json");
  const body = contentType.includes("application/json")
    ? await request.json().catch(() => null)
    : Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
  const phoneInput = String(body?.phone || "");
  const phone = normalizeIranPhone(phoneInput);

  if (!phone) {
    if (!wantsJson) {
      return redirectTo(loginErrorPath("شماره موبایل معتبر نیست."));
    }
    return NextResponse.json({ error: "شماره موبایل معتبر نیست." }, { status: 400 });
  }

  const db = await getTeleirDb();
  const digits = phone.replace(/\D+/g, "");
  const phoneCandidates = Array.from(
    new Set([
      phone,
      `+${digits}`,
      digits.startsWith("98") ? `0${digits.slice(2)}` : "",
      digits.startsWith("98") ? digits : "",
      digits.startsWith("9") && digits.length === 10 ? `0${digits}` : ""
    ].filter(Boolean))
  );
  const user = await ensureUserIdentity(
    db,
    (await db.collection("users").findOne({ phone: { $in: phoneCandidates } })) as (DbUser & { _id?: unknown }) | null,
    phone
  );

  if (!user) {
    if (!wantsJson) {
      return redirectTo(loginErrorPath("کاربری با این شماره پیدا نشد."));
    }
    return NextResponse.json(
      { error: "کاربری با این شماره پیدا نشد." },
      { status: 404 }
    );
  }

  const code = makeOtpCode();
  const now = Date.now();
  const expiresAt = new Date(now + 2 * 60 * 1000).toISOString();
  const requestId = randomUUID();

  await db.collection("otp_codes").insertOne({
    id: requestId,
    userId: user.id,
    phone,
    code,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    usedAt: null
  });

  try {
    const smsResult = await sendSmsIrOtp(phone, code);
    await db.collection("otp_codes").updateOne(
      { id: requestId },
      {
        $set: {
          smsResult,
          smsSentAt: new Date().toISOString()
        }
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    await db.collection("otp_codes").updateOne(
      { id: requestId },
      {
        $set: {
          smsError: reason,
          smsFailedAt: new Date().toISOString()
        }
      }
    );
    if (!wantsJson) {
      return redirectTo(loginErrorPath(`ارسال پیامک انجام نشد: ${reason}`));
    }
    return NextResponse.json(
      { error: `ارسال پیامک انجام نشد: ${reason}` },
      { status: 500 }
    );
  }

  if (!wantsJson) {
    const response = redirectTo("/login");
    response.cookies.set(
      otpCookieName,
      encodeURIComponent(JSON.stringify({ phone: phoneInput, requestId })),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 5 * 60
      }
    );
    response.cookies.delete(otpErrorCookieName);
    return response;
  }

  return NextResponse.json({ ok: true, requestId });
}
