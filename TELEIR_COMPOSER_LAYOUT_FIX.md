# TELEIR Composer Layout Fix

This build stabilizes the message composer in desktop and mobile.

Fixed:
- Message input stays visible at the bottom of the chat.
- Attach and Send buttons keep fixed size and position.
- File preview, reply/edit bar and selection bar no longer push the composer out of view.
- Desktop composer uses a stable 3-column layout: attach / message / send.
- Mobile composer keeps safe-area padding and does not overlap the viewport bottom.

After replacing files, run:

```bash
rm -rf .next
pnpm build
```
