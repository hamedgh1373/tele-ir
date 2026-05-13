import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function toBuffer(data: unknown): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (typeof data === "object" && data !== null && "buffer" in data) {
    const value = (data as { buffer?: unknown }).buffer;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof ArrayBuffer) return Buffer.from(value);
  }
  return null;
}

function toResponseBody(buffer: Buffer): Blob {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  return new Blob([arrayBuffer]);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const user = await db.collection("users").findOne({ id: session.user.id });
  const avatar = user?.avatar;
  const data = toBuffer(avatar?.data);
  if (!avatar || !data) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });

  return new NextResponse(toResponseBody(data), {
    headers: {
      "Content-Type": avatar.mimeType || "image/jpeg",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=60"
    }
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "تصویری انتخاب نشده است." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "فرمت تصویر مجاز نیست." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "حداکثر حجم تصویر پروفایل ۲ مگابایت است." }, { status: 413 });
  }

  const now = new Date().toISOString();
  const avatar = {
    name: file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "avatar",
    mimeType: file.type,
    size: file.size,
    data: Buffer.from(await file.arrayBuffer()),
    updatedAt: now
  };

  const db = await getDb();
  await db.collection("users").updateOne(
    { id: session.user.id },
    { $set: { avatar, avatarUrl: `/api/account/avatar?t=${Date.now()}`, updatedAt: now } }
  );

  return NextResponse.json({ ok: true, avatarUrl: `/api/account/avatar?t=${Date.now()}` });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  await db.collection("users").updateOne(
    { id: session.user.id },
    { $unset: { avatar: "", avatarUrl: "" }, $set: { updatedAt: new Date().toISOString() } }
  );

  return NextResponse.json({ ok: true });
}
