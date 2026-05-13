# Teleir DB Media/Profile/Message Alignment Fix

## Applied changes

1. **Uploaded chat media is now stored in MongoDB**
   - New uploads are stored in `teleirv2.files.data` as binary data.
   - The message attachment keeps only a valid `/api/files/<fileId>` URL.
   - Old disk-based files still have a backward-compatible fallback.

2. **Deleted media is cleaned from DB**
   - `Delete for everyone` removes the message and its related file document from `files`.
   - Bulk delete with `mode: everyone` also removes attached file documents.
   - `Delete for me` does not delete shared file data because other participants may still need it.
   - If an old disk-based file is missing, `/api/files/<fileId>` removes the broken file record and unsets the broken attachment reference.

3. **Forwarded media gets its own copied file reference**
   - Forwarding a media message clones the DB-backed file into a new `fileId`.
   - Deleting the original media message will not break forwarded copies.

4. **Profile image settings added**
   - Settings page now has a profile section.
   - Each user can upload/delete their own profile image.
   - Profile image binary is stored in the user document under `users.avatar.data`.
   - Authorized participants can view profile avatars through `/api/users/[userId]/avatar`.

5. **Message selection behavior fixed**
   - Selecting a message no longer opens the forward modal automatically.
   - Forward modal opens only after pressing the Forward action.

6. **Own-message alignment fixed**
   - Own messages are detected by `senderId`, then `senderEmail`, and finally by a legacy fallback on sender name when old messages are missing `senderEmail`.
   - This fixes older messages that appeared on the wrong side after session/user-id changes.

7. **Visual theme adjusted**
   - Accent color changed away from Telegram blue.
   - Message bubbles are now translucent/glass-style instead of solid green/white.
   - Message text/meta are softened to reduce visual noise.

## Important note

MongoDB BSON documents have a 16MB limit. To keep direct DB storage safe, new uploaded files are capped at 12MB in this version. For larger general files, the correct next step is GridFS.
