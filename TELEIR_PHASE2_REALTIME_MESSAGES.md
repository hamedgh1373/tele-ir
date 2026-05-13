# Teleir Phase 2 - Realtime Messages, Reply, Forward, Delete

This phase keeps the legacy database untouched and continues to use `teleirv2` as the active application database.

## Implemented

- Server-Sent Events realtime stream for chat list: `/api/chats/events`
- Server-Sent Events realtime stream for active chat messages: `/api/chats/[chatId]/messages/events`
- Automatic delivered/read status update while a chat is open
- Reply metadata stored on message creation and rendered with jump-to-message behavior
- Multi-message forward using `/api/chats/forward`
- Forward with optional hidden sender metadata
- Single-message forward now uses the same multi-forward pipeline
- Bulk delete endpoint: `/api/chats/[chatId]/messages/bulk-delete`
- Delete for me and delete for everyone modes
- Delete-for-everyone restricted to the sender or chat admin
- Optimistic message UI merged safely with realtime snapshots

## Production note

The project uses SSE instead of a raw WebSocket server because this app currently runs through Next.js route handlers. Raw WebSocket support in production requires a custom Node server or a separate realtime service, which would require changing the deployment model. SSE is production-safe with the current `next start`/reverse proxy model and provides realtime UI updates without adding extra npm dependencies.

## Nginx note

For SSE, keep buffering disabled for these paths:

```nginx
location /api/chats/events {
    proxy_pass http://127.0.0.1:3013;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
}

location ~ ^/api/chats/.+/messages/events$ {
    proxy_pass http://127.0.0.1:3013;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
}
```

## Build

Run:

```bash
pnpm install
pnpm build
```

If there is any TypeScript or Next.js build error, save it with:

```bash
pnpm build 2>&1 | tee build.log
```
