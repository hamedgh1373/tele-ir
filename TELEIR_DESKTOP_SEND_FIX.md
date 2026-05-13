# Teleir Desktop Send Fix

This patch fixes a desktop-only send issue where the form submit path could be interrupted by layout/browser behavior while mobile still worked.

## Changes
- Added `chatId?: string` to `MessageItem` for optimistic messages.
- Split submit logic into `sendCurrentMessage()` so sending no longer depends only on the form submit event.
- Desktop send button now calls `sendCurrentMessage()` directly with `type="button"`.
- Pressing Enter inside the message input also calls `sendCurrentMessage()` directly.
- Existing mobile behavior remains unchanged.
- Existing Buffer-to-Blob API route fixes are preserved.

## Build
Run:

```bash
rm -rf .next
pnpm build
```
