# Teleir static asset 403 root fix

The desktop send button failed because the browser was not loading the built React JS chunks:

`/assets/static/...` returned `403 Forbidden`.

When those JS files are blocked, the page is not hydrated. Mobile could appear to work from a different cached/hydrated bundle, while desktop clicks/forms do nothing.

Applied fixes:

1. `middleware.ts`
   - Excludes all static/public files from auth middleware.
   - Excludes `/_next`, `/assets`, `/uploads`, and any file-like path.

2. `next.config.mjs`
   - Rewrites `/assets/static/:path*` to `/_next/static/:path*`.

3. `app/assets/static/[...path]/route.ts`
   - Adds a production fallback route to serve `.next/static` files if an upstream proxy or old HTML requests `/assets/static/...`.

After deployment run:

```bash
rm -rf .next
pnpm build
pnpm start
```

Then hard refresh browser:

```text
Ctrl + Shift + R
```

If any static request still returns 403 after this, the remaining block is outside Next.js, usually Nginx/Apache/Caddy or a security rule before the request reaches the app.
