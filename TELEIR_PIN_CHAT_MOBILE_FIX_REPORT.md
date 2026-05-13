# Teleir pin/chat mobile layout fix

## Fixed

- Restored chat-level Pin/Unpin in the chat-list context menu.
- Saved Messages remains always at the top and cannot be chat-pinned/unpinned from the context menu.
- Personal pinned chats are sorted below Saved Messages and above normal chats.
- Pinned message bar inside an open chat is now an overlay and no longer consumes grid height.
- Mobile composer, file picker, selected files, and send button no longer get pushed below the viewport when a message is pinned.
- Message stream receives top padding only when a pinned message bar is visible, so messages remain readable without moving the composer.
- Fixed a `Saved Messages` avatar mapping issue in `lib/chat.ts` that could break build/runtime because of an undefined variable.

## Notes

- Message pin and chat pin are separate:
  - Message Pin: from message menu / selected message bar, shown only inside that chat.
  - Chat Pin: from right-click/context menu on the chat row, shown only in the current user's chat list.
