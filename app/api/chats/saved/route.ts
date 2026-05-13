import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { ensureSavedMessagesChat } from "@/lib/chat";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chat = await ensureSavedMessagesChat(session.user.id);
  return NextResponse.json({ chat });
}
