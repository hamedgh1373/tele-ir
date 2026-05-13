import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions, ensureBootstrapAdmin } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { normalizeIranPhone } from "@/lib/sms";

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().default(""),
  role: z.enum(["admin", "user"]),
  uploadLimitMb: z.coerce.number().int().min(1).max(1024),
  password: z.string().min(6).max(72).optional().or(z.literal(""))
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  await ensureBootstrapAdmin();
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;

  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const email = parsed.data.email.toLowerCase();
  const phone = parsed.data.phone ? normalizeIranPhone(parsed.data.phone) : "";
  if (parsed.data.phone && !phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست." }, { status: 400 });
  }
  const existing = await db.collection("users").findOne({ id: userId });

  if (!existing) {
    return NextResponse.json({ error: "کاربر پیدا نشد." }, { status: 404 });
  }

  if (existing.role === "admin" && parsed.data.role !== "admin") {
    const otherAdmins = await db.collection("users").countDocuments({
      id: { $ne: userId },
      role: "admin"
    });

    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "حداقل یک ادمین باید در سیستم باقی بماند." },
        { status: 400 }
      );
    }
  }

  const duplicate = await db.collection("users").findOne({
    email,
    id: { $ne: userId }
  });

  if (duplicate) {
    return NextResponse.json({ error: "این ایمیل قبلا ثبت شده است." }, { status: 409 });
  }

  if (phone) {
    const duplicatePhone = await db.collection("users").findOne({
      phone,
      id: { $ne: userId }
    });
    if (duplicatePhone) {
      return NextResponse.json({ error: "این شماره قبلا ثبت شده است." }, { status: 409 });
    }
  }

  const updates: Record<string, unknown> = {
    name: parsed.data.name,
    email,
    phone: phone || undefined,
    role: parsed.data.role,
    uploadLimitMb: parsed.data.uploadLimitMb,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.email
  };

  if (parsed.data.password) {
    updates.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  const result = await db.collection("users").findOneAndUpdate(
    { id: userId },
    { $set: updates },
    {
      returnDocument: "after",
      projection: { _id: 0, passwordHash: 0 }
    }
  );

  if (!result) {
    return NextResponse.json({ error: "کاربر پیدا نشد." }, { status: 404 });
  }

  return NextResponse.json({ user: result });
}
