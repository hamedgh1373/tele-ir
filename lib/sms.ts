import { randomInt } from "crypto";
import { getTeleirDb } from "@/lib/mongodb";

export type SmsSettings = {
  provider: "smsir";
  apiKey: string;
  lineNumber?: string;
  templateId?: number;
  templateVariable?: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (digits.startsWith("09") && digits.length === 11) {
    return `+98${digits.slice(1)}`;
  }
  if (digits.startsWith("98") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("0098") && digits.length === 14) {
    return `+${digits.slice(2)}`;
  }
  if (value.startsWith("+98") && digits.length === 12) {
    return `+${digits}`;
  }
  return "";
}

export function normalizeIranPhone(value: string) {
  return normalizePhone(value);
}

export function maskApiKey(value: string) {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

export async function getSmsSettings() {
  const db = await getTeleirDb();
  const item = await db.collection("settings").findOne({ key: "sms" });
  return (item?.value || null) as SmsSettings | null;
}

export async function saveSmsSettings(settings: SmsSettings) {
  const db = await getTeleirDb();
  await db.collection("settings").updateOne(
    { key: "sms" },
    {
      $set: {
        key: "sms",
        value: settings
      }
    },
    { upsert: true }
  );
}

export function makeOtpCode() {
  return String(randomInt(100000, 1000000));
}

export async function sendSmsIrOtp(toPhone: string, code: string) {
  const settings = await getSmsSettings();
  if (!settings?.enabled || !settings.apiKey) {
    throw new Error("SMS settings are not configured.");
  }

  const phone = normalizePhone(toPhone);
  if (!phone) {
    throw new Error("Invalid phone number.");
  }
  const nationalMobile = phone.replace(/\D+/g, "").slice(2);
  const localMobile = `0${nationalMobile}`;

  const payload = settings.templateId
    ? {
        mobile: nationalMobile,
        templateId: settings.templateId,
        parameters: [{ name: (settings.templateVariable || "OTP").toUpperCase(), value: code }]
      }
    : {
        mobiles: [localMobile],
        messageText: `کد ورود شما: ${code}`,
        lineNumber: settings.lineNumber || undefined
      };

  const endpoint = settings.templateId
    ? "https://api.sms.ir/v1/send/verify"
    : "https://api.sms.ir/v1/send/bulk";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": settings.apiKey
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let result: { status?: number | boolean; message?: string } | null = null;

  try {
    result = JSON.parse(text) as { status?: number | boolean; message?: string };
  } catch {
    result = null;
  }

  const details = {
    ok: response.ok,
    statusCode: response.status,
    target: settings.templateId ? nationalMobile : localMobile,
    endpoint,
    providerStatus: result?.status,
    providerMessage: result?.message,
    providerData: result && "data" in result ? (result as { data?: unknown }).data : undefined,
    raw: text.slice(0, 1000)
  };

  if (!response.ok) {
    throw new Error(`SMS provider error: ${text.slice(0, 300)}`);
  }

  if (result && "status" in result && result.status !== 1 && result.status !== true) {
    throw new Error(`SMS provider error: ${result.message || text.slice(0, 300)}`);
  }

  return details;
}
