import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listChatsForUser } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const chats = await listChatsForUser(session.user.id, { includeArchived: true });
          controller.enqueue(encoder.encode(`event: chats\ndata: ${JSON.stringify({ chats })}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        }
      };
      await send();
      const timer = setInterval(send, 2000);
      setTimeout(() => { clearInterval(timer); closed = true; try { controller.close(); } catch {} }, 5 * 60 * 1000);
    },
    cancel() { closed = true; }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
