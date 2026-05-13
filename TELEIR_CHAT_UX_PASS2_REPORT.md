# Teleir Chat UX Pass 2

Applied fixes:

- Saved Messages is always sorted before every other chat, even above pinned chats.
- Message pinning is now displayed only inside the active chat as a pinned bar above the message stream.
- The pinned message bar has a close/unpin button.
- Chat-list right-click menu no longer exposes pin/unpin; it keeps archive/unarchive and mute/unmute.
- Added Telegram-style global search endpoint `/api/search` limited to chats where the current user is a participant and contacts owned by the current user.
- Global search groups results into chats/groups/channels, contacts, and messages.
- Search results do not scan messages from chats the current user is not a participant in.
- Added Escape behavior: closes search/modal/menu first, then closes the active chat and returns to the empty chat stage.
- Improved mobile header: profile area remains separate from the search and more buttons.
- Improved mobile image viewer sizing and backdrop blur.
- Improved message selection styling to avoid layout breakage.
- Improved reply composer placement by removing fixed grid-row conflicts.
- Message context menu now clamps to the viewport with a larger height estimate so it opens above the bottom edge on mobile.

Build note:

`node_modules` is not included in this environment, so a real `next build` must still be run on your server after replacement.
