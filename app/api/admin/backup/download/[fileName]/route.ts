import { readFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { BACKUP_STORAGE_DIR } from "@/lib/backup";

function isAdmin(role?: string) {
  return role === "admin" || role === "superadmin";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> }
) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role as string | undefined;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { fileName } = await context.params;
  if (!/^[a-z0-9\-]+\.json\.gz$/i.test(fileName)) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const fullPath = path.join(BACKUP_STORAGE_DIR, fileName);
  const data = await readFile(fullPath);
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  return new NextResponse(new Blob([arrayBuffer]), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`
    }
  });
}
