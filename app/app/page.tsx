import { requireSession } from "@/lib/server-session";
import {
  ChatShell,
  type ChatItem,
  type ContactMatch,
  type DirectoryUser,
  type MessageItem
} from "@/components/chat-shell";
import { getDb, listChatsForUser, listMessages } from "@/lib/chat";

function toPlainList<T>(items: unknown[]) {
  return JSON.parse(JSON.stringify(items)).map((item: { _id?: unknown }) => {
    const { _id, ...rest } = item;
    void _id;
    return rest;
  }) as T[];
}

export default async function AppPage({
  searchParams
}: {
  searchParams?: Promise<{ chat?: string; contacts?: string }>;
}) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const db = await getDb();
  const chats = toPlainList<ChatItem>(await listChatsForUser(session.user.id));
  const requestedChatId = params.chat || "";
  const activeChatId = chats.some((chat) => chat.id === requestedChatId)
    ? requestedChatId
    : "";
  const messages = activeChatId
    ? toPlainList<MessageItem>(await listMessages(activeChatId, session.user.id))
    : ([] as MessageItem[]);
  const users = (await db
    .collection("users")
    .find(
      { email: { $ne: session.user.email } },
      { projection: { _id: 0, id: 1, name: 1, email: 1 } }
    )
    .sort({ email: 1 })
    .limit(40)
    .toArray()) as unknown as DirectoryUser[];
  const contactsOpen = params.contacts === "1";
  const contacts = contactsOpen
    ? toPlainList<ContactMatch>(
        await db
          .collection("user_contacts")
          .aggregate([
            {
              $match: {
                ownerId: session.user.id,
                matchedUserId: { $exists: true, $ne: null }
              }
            },
            {
              $lookup: {
                from: "users",
                localField: "matchedUserId",
                foreignField: "id",
                as: "matchedUser"
              }
            },
            { $unwind: "$matchedUser" },
            {
              $project: {
                _id: 0,
                userId: "$matchedUser.id",
                name: "$matchedUser.name",
                email: "$matchedUser.email",
                phone: { $ifNull: ["$matchedUser.phone", "$phone"] }
              }
            }
          ])
          .toArray()
      )
    : [];

  return (
    <main className="workspace-page">
      <ChatShell
        currentUser={session.user}
        initialChats={chats}
        initialActiveChatId={activeChatId}
        initialMessages={messages}
        initialDirectory={users}
        initialContacts={contacts}
        initialContactsOpen={contactsOpen}
      />
    </main>
  );
}
