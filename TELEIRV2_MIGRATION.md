# Teleir v2 database policy

This build does not write normal application data into the legacy database.

## Database names

- New application database: `teleirv2`
- Legacy database: `teleir`

The values are controlled by:

```env
TELEIR_DB_NAME=teleirv2
TELEIR_LEGACY_DB_NAME=teleir
```

`MONGODB_URI` may still point to the old database name. The application forces normal reads/writes to `TELEIR_DB_NAME` in `lib/mongodb.ts`.

## Legacy migration behavior

On first login/API bootstrap:

1. `teleirv2` indexes are created.
2. If `teleirv2.users` already contains an admin, that admin is kept.
3. If not, exactly one legacy admin is copied from `teleir.users`:
   - If `ADMIN_EMAIL` is set, the user with that email and `role: "admin"` is copied.
   - Otherwise, the first legacy user with `role: "admin"` is copied.
4. No old chats, messages, contacts, files, OTPs, sessions, or settings are copied.
5. A fresh Saved Messages chat and default app/backup settings are created for the admin.

## Collections initialized for v2

- users
- chats
- messages
- files
- settings
- otp_codes
- user_contacts
- user_sessions

## Safety note

The legacy database is only read for finding the admin user. It is not updated or deleted by this build.
