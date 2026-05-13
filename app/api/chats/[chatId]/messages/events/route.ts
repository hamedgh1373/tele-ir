import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { clearUnreadForUser, getDb, listMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  context: { params: Promise<{ chatId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { chatId } = await context.params;
  const db = await getDb();
  const chat = await db.collection("chats").findOne({ id: chatId });
  if (!chat || !isChatParticipant(chat, session.user.id)) {
    return new Response("Chat not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let lastSignature = "";

  const stream = new ReadableStream({
    async start(controller) {
      const sendSnapshot = async () => {
        if (closed) return;
        try {
          const currentChat = (await db.collection("chats").findOne({ id: chatId })) as Record<string, any> | null;
          if (!currentChat || !isChatParticipant(currentChat, session.user.id)) {
            controller.enqueue(encoder.encode(encodeSse("closed", { reason: "not-found" })));
            closed = true;
            try { controller.close(); } catch {}
            return;
          }

          await db.collection("messages").updateMany(
            { chatId, senderId: { $ne: session.user.id }, deletedFor: { $ne: session.user.id } },
            { $addToSet: { deliveredTo: session.user.id, readBy: session.user.id } }
          );

          const nextUnreadCounts = clearUnreadForUser(
            getParticipantIds(currentChat),
            session.user.id,
            currentChat.unreadCounts
          );
          if ((currentChat.unreadCounts?.[session.user.id] ?? 0) > 0) {
            await db.collection("chats").updateOne({ id: chatId }, { $set: { unreadCounts: nextUnreadCounts } });
          }

          const messages = (await listMessages(chatId, session.user.id, 100)) as Array<Record<string, any>>;
          const signature = messages.map((message: Record<string, any>) => `${message.id}:${message.editedAt || ""}:${message.readBy?.length || 0}:${message.reactions ? JSON.stringify(message.reactions) : ""}`).join("|");
          if (signature !== lastSignature) {
            lastSignature = signature;
            controller.enqueue(encoder.encode(encodeSse("messages", { messages })));
          } else {
            controller.enqueue(encoder.encode(encodeSse("ping", { t: Date.now() })));
          }
        } catch {
          controller.enqueue(encoder.encode(encodeSse("ping", { t: Date.now() })));
        }
      };

      await sendSnapshot();
      const timer = setInterval(sendSnapshot, 1200);
      setTimeout(() => {
        clearInterval(timer);
        closed = true;
        try { controller.close(); } catch {}
      }, 5 * 60 * 1000);
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
