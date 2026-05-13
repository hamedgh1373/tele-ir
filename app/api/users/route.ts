import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, ensureBootstrapAdmin } from "@/lib/auth";
import { getDb, type AppUser } from "@/lib/chat";
import { normalizeIranPhone } from "@/lib/sms";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(1),
  role: z.enum(["admin", "user"]).default("user"),
  uploadLimitMb: z.coerce.number().int().min(1).max(1024).default(100)
});

export async function GET() {
  await ensureBootstrapAdmin();
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;

  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const users = (await db
    .collection("users")
    .find({}, { projection: { _id: 0, passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .toArray()) as unknown as AppUser[];

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  await ensureBootstrapAdmin();
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;

  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const phone = normalizeIranPhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست." }, { status: 400 });
  }
  const phoneExists = await db.collection("users").findOne({ phone });
  if (phoneExists) {
    return NextResponse.json({ error: "این شماره قبلا ثبت شده است." }, { status: 409 });
  }

  const user = {
    id: randomUUID(),
    name: parsed.data.name,
    email: `${phone.replace(/\D+/g, "")}@teleir.local`,
    phone,
    passwordHash: randomUUID(),
    role: parsed.data.role,
    uploadLimitMb: parsed.data.uploadLimitMb,
    createdAt: new Date().toISOString(),
    createdBy: session.user.email
  };

  await db.collection("users").insertOne(user);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      uploadLimitMb: user.uploadLimitMb,
      createdAt: user.createdAt,
      createdBy: user.createdBy
    }
  });
}
