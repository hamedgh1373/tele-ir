import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getTeleirDb, getTeleirDbName, getTeleirLegacyDb, getTeleirLegacyDbName } from "@/lib/mongodb";
import { hashOtpCode } from "@/lib/security";
import { normalizeIranPhone } from "@/lib/sms";
import { isSessionRevoked } from "@/lib/session-store";

type DbUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "user";
  phone?: string;
};

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

async function normalizeRuntimeUser(user: (DbUser & { _id?: unknown }) | null) {
  if (!user) {
    return null;
  }

  const db = await getTeleirDb();
  const updates: Record<string, unknown> = {};
  if (!user.id) {
    updates.id = randomUUID();
    user.id = updates.id as string;
  }
  if (user.phone) {
    const normalizedPhone = normalizeIranPhone(user.phone);
    if (normalizedPhone && user.phone !== normalizedPhone) {
      updates.phone = normalizedPhone;
      user.phone = normalizedPhone;
    }
  }
  if (!user.email) {
    const fallbackEmail = user.phone ? `${user.phone.replace(/\D+/g, "")}@teleir.local` : `${user.id}@teleir.local`;
    updates.email = fallbackEmail;
    user.email = fallbackEmail;
  }
  if (!user.name) {
    updates.name = user.email || user.phone || "Kaman User";
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

async function findUserByPhone(phone: string) {
  const db = await getTeleirDb();
  const user = (await db.collection("users").findOne({
    phone: { $in: buildPhoneCandidates(phone) }
  })) as (DbUser & { _id?: unknown }) | null;
  return normalizeRuntimeUser(user);
}

async function ensureTeleirV2Indexes() {
  const db = await getTeleirDb();
  await Promise.all([
    db.collection("users").createIndex({ id: 1 }, { unique: true }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ phone: 1 }, { partialFilterExpression: { phone: { $type: "string" } } }),
    db.collection("chats").createIndex({ id: 1 }, { unique: true }),
    db.collection("chats").createIndex({ participantIds: 1, updatedAt: -1 }),
    db.collection("messages").createIndex({ id: 1 }, { unique: true }),
    db.collection("messages").createIndex({ chatId: 1, createdAt: -1 }),
    db.collection("messages").createIndex({ chatId: 1, deletedFor: 1 }),
    db.collection("files").createIndex({ id: 1 }, { unique: true }),
    db.collection("user_contacts").createIndex({ ownerId: 1, phone: 1 }, { unique: true }),
    db.collection("user_sessions").createIndex({ sessionId: 1 }, { unique: true }),
    db.collection("otp_codes").createIndex({ id: 1 }, { unique: true }),
    db.collection("otp_codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("settings").createIndex({ key: 1 }, { unique: true })
  ]);
}

function sanitizeAdminUser(source: DbUser) {
  const now = new Date().toISOString();
  return {
    id: source.id || randomUUID(),
    email: String(source.email || "").trim().toLowerCase(),
    phone: source.phone || undefined,
    name: source.name || "Teleir Admin",
    passwordHash: source.passwordHash,
    role: "admin" as const,
    uploadLimitMb: (source as DbUser & { uploadLimitMb?: number }).uploadLimitMb || 1024,
    createdAt: (source as DbUser & { createdAt?: string }).createdAt || now,
    createdBy: "legacy-admin-migration",
    updatedAt: now,
    migratedFrom: getTeleirLegacyDbName(),
    migratedTo: getTeleirDbName()
  };
}

async function findLegacyAdmin() {
  const legacyDbName = getTeleirLegacyDbName();
  const targetDbName = getTeleirDbName();

  if (legacyDbName === targetDbName) {
    return null;
  }

  const legacyDb = await getTeleirLegacyDb();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  const preferredAdmin = adminEmail
    ? ((await legacyDb.collection("users").findOne(
        { email: adminEmail, role: "admin" },
        { sort: { createdAt: 1 } }
      )) as DbUser | null)
    : null;

  const admin =
    preferredAdmin ||
    ((await legacyDb.collection("users").findOne(
      { role: "admin" },
      { sort: { createdAt: 1 } }
    )) as DbUser | null);

  if (admin?.email && admin.passwordHash) {
    return sanitizeAdminUser(admin);
  }

  return null;
}

async function ensureDefaultSettings(actor: string) {
  const db = await getTeleirDb();
  const now = new Date().toISOString();

  await db.collection("settings").updateOne(
    { key: "app" },
    {
      $setOnInsert: {
        key: "app",
        value: {
          name: "Kaman",
          database: getTeleirDbName(),
          legacyDatabaseSkipped: getTeleirLegacyDbName(),
          defaultUploadLimitMb: 100,
          allowUserRegistration: false,
          createdAt: now,
          createdBy: actor
        }
      }
    },
    { upsert: true }
  );

  await db.collection("settings").updateOne(
    { key: "backup" },
    {
      $setOnInsert: {
        key: "backup",
        value: {
          enabled: false,
          intervalHours: 6,
          retainCount: 12,
          updatedAt: now,
          updatedBy: actor
        }
      }
    },
    { upsert: true }
  );
}

async function ensureAdminSavedMessages(admin: DbUser) {
  const db = await getTeleirDb();
  const now = new Date().toISOString();
  await db.collection("chats").updateOne(
    { type: "saved", participantIds: [admin.id] },
    {
      $setOnInsert: {
        id: randomUUID(),
        type: "saved",
        title: "Saved Messages",
        participantIds: [admin.id],
        adminIds: [admin.id],
        createdByUserId: admin.id,
        createdAt: now,
        updatedAt: now,
        unreadCounts: { [admin.id]: 0 },
        pinnedMessageIds: [],
        archivedFor: [],
        mutedFor: [],
        blockedUserIds: []
      }
    },
    { upsert: true }
  );
}

export async function ensureBootstrapAdmin() {
  await ensureTeleirV2Indexes();

  const db = await getTeleirDb();
  const now = new Date().toISOString();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const adminPhone = normalizeIranPhone(process.env.ADMIN_PHONE || "");

  const existingAdmin = (await db.collection("users").findOne({ role: "admin" })) as DbUser | null;
  if (existingAdmin) {
    if (adminPhone && existingAdmin.phone !== adminPhone) {
      await db.collection("users").updateOne(
        { id: existingAdmin.id },
        { $set: { phone: adminPhone, updatedAt: now } }
      );
      existingAdmin.phone = adminPhone;
    }
    await ensureDefaultSettings(existingAdmin.email || existingAdmin.id);
    await ensureAdminSavedMessages(existingAdmin);
    return existingAdmin;
  }

  const legacyAdmin = await findLegacyAdmin();
  if (legacyAdmin) {
    await db.collection("users").insertOne(legacyAdmin);
    await ensureDefaultSettings(legacyAdmin.email || legacyAdmin.id);
    await ensureAdminSavedMessages(legacyAdmin);
    return legacyAdmin;
  }

  if (!adminPhone && (!email || !password)) {
    await ensureDefaultSettings("system");
    return null;
  }

  const admin = {
    id: randomUUID(),
    email: email || (adminPhone ? `${adminPhone.replace(/\D+/g, "")}@teleir.local` : `admin-${randomUUID()}@teleir.local`),
    phone: adminPhone || undefined,
    name: "Kaman Admin",
    passwordHash: await bcrypt.hash(password || randomUUID(), 12),
    role: "admin" as const,
    uploadLimitMb: 1024,
    createdAt: now,
    createdBy: "bootstrap",
    updatedAt: now
  };

  await db.collection("users").insertOne(admin);
  await ensureDefaultSettings(admin.email);
  await ensureAdminSavedMessages(admin);
  return admin;
}
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "OTP login",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otpCode: { label: "OTP Code", type: "text" },
        requestId: { label: "Request ID", type: "text" }
      },
      async authorize(credentials) {
        const phone = normalizeIranPhone(credentials?.phone || "");
        const otpCode = String(credentials?.otpCode || "").trim();
        const requestId = String(credentials?.requestId || "").trim();

        const db = await getTeleirDb();

        if (phone && otpCode && requestId) {
          await ensureBootstrapAdmin();
          const user = await findUserByPhone(phone);
          if (!user) {
            return null;
          }

          const otp = await db.collection("otp_codes").findOne({
            id: requestId,
            userId: user.id,
            phone,
            codeHash: hashOtpCode(otpCode),
            usedAt: null
          });

          if (!otp) {
            return null;
          }

          if (new Date(String(otp.expiresAt)).getTime() < Date.now()) {
            return null;
          }

          await db.collection("otp_codes").updateOne(
            { id: requestId },
            { $set: { usedAt: new Date().toISOString() } }
          );

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
        }
        return null;
      }
    })
  ],
  pages: {
    signIn: "/login"
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 180,
    updateAge: 60 * 60 * 24
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
        token.sid = randomUUID();
      }

      if (!token.sid) {
        token.sid = randomUUID();
      }

      if (token.email) {
        await ensureBootstrapAdmin();
        const db = await getTeleirDb();
        const dbUser = await normalizeRuntimeUser((await db.collection("users").findOne({
          email: String(token.email).trim().toLowerCase()
        })) as (DbUser & { _id?: unknown }) | null);

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.email = dbUser.email;
        }
      }

      if (token.sid) {
        const revoked = await isSessionRevoked(String(token.sid));
        if (revoked) {
          return {};
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.role && token.email && token.name) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.sid = token.sid as string | undefined;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};
