import { readFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/chat";
import { writeTeleirLog } from "@/lib/logger";

const UPLOAD_DIR = process.env.TELEIR_UPLOAD_DIR || "/var/www/teleir/storage/uploads";

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

async function removeBrokenFileReference(fileId: string) {
  const db = await getDb();
  await db.collection("files").deleteOne({ id: fileId });
  await db.collection("messages").updateMany(
    { "attachment.fileId": fileId },
    { $unset: { attachment: "" } }
  );
}


function getParticipantIds(chat: any): string[] {
  const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
  const memberIds = Array.isArray(chat?.members) ? chat.members : [];
  return Array.from(new Set([...participantIds, ...memberIds].map(String).filter(Boolean)));
}

function isChatParticipant(chat: any, userId: string): boolean {
  return getParticipantIds(chat).includes(userId);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await context.params;
  const db = await getDb();
  const fileDoc = await db.collection("files").findOne({ id: fileId });

  if (!fileDoc) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const chat = await db.collection("chats").findOne({ id: fileDoc.chatId });

  if (!chat || !isChatParticipant(chat, session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let data = toBuffer(fileDoc.data);

  // Backward compatibility for old disk-based files. New files are served from MongoDB.
  if (!data && fileDoc.storedName) {
    const filePath = path.join(UPLOAD_DIR, fileDoc.storedName);
    data = await readFile(filePath).catch(async (error) => {
      await writeTeleirLog("error", "files.GET", "failed to read legacy disk file", {
        fileId,
        chatId: fileDoc.chatId,
        storedName: fileDoc.storedName,
        uploadDir: UPLOAD_DIR,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });
  }

  if (!data) {
    await removeBrokenFileReference(fileId);
    return NextResponse.json({ error: "File storage read failed" }, { status: 404 });
  }

  return new NextResponse(toResponseBody(data), {
    headers: {
      "Content-Type": fileDoc.mimeType || "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${fileDoc.mimeType?.startsWith("image/") ? "inline" : "attachment"}; filename="${encodeURIComponent(fileDoc.originalName)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox"
    }
  });
}
