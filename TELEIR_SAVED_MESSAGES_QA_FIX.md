# Teleir Saved Messages / Send QA Fix

## Applied fixes

1. Phone login compatibility
   - Users stored as `+98...` can log in with `09...`.
   - OTP send/login now searches both normalized and local phone formats.
   - If an existing user document does not have `id`, `email`, `name`, `role`, or normalized `phone`, the app repairs it during OTP send/login.

2. Saved Messages send issue
   - Message sending now logs the exact server/client error when send fails.
   - Reply payload is now sent correctly to `/api/chats/[chatId]/messages`.
   - Initial message loading now uses the current user id, so `deletedFor` filtering does not hide all messages.

3. Image/file composer behavior
   - Selected files are now displayed above the composer, not below the text input area.
   - Images show thumbnail previews before sending.
   - File upload network/server errors are logged and shown in UI.

4. Server-side logging
   - New log file path: `/var/www/teleir/storage/logs/teleir.log`
   - Override with env: `TELEIR_LOG_DIR=/custom/path`
   - Admin can read logs from: `/api/debug/logs`
   - Client-side button/send/upload failures are posted to `/api/debug/logs`.

5. Upload storage path
   - Upload path is now configurable:
     `TELEIR_UPLOAD_DIR=/var/www/teleir/storage/uploads`
   - File read/upload failures are logged.

## Important operational note

After deploying this version, log out and log in again with OTP. This refreshes the NextAuth session and lets the runtime repair old `users` documents that were manually inserted without `id` or with a `09...`/`+98...` mismatch.

## If sending still fails

Open this URL as admin and send the output:

`/api/debug/logs`

Or on the server:

```bash
cat /var/www/teleir/storage/logs/teleir.log | tail -200
```

Also check MongoDB:

```js
use teleirv2
db.users.find({}, { _id: 1, id: 1, phone: 1, email: 1, role: 1 }).pretty()
db.chats.find({ type: "saved" }).pretty()
```
