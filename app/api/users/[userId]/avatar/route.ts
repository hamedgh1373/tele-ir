import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await context.params;
  const db = await getDb();

  const sharedChat = await db.collection("chats").findOne({
    participantIds: { $all: [session.user.id, userId] }
  });
  if (!sharedChat && session.user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.collection("users").findOne({ id: userId });
  const avatar = user?.avatar;
  const data = toBuffer(avatar?.data);
  if (!avatar || !data) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });

  return new NextResponse(toResponseBody(data), {
    headers: {
      "Content-Type": avatar.mimeType || "image/jpeg",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600"
    }
  });
}
