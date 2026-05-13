# Tele IR | تل ایران

Tele IR is a self-hosted private web messenger with Persian-first UX, phone-based login, admin controls, media sharing, and deployment support for both raw IP setups and domain + SSL installations.

تل ایران یک پیام‌رسان تحت وب و self-hosted است که برای استفاده روی سرور شخصی طراحی شده و ورود با شماره موبایل، پنل ادمین، ارسال فایل و نصب روی IP یا دامنه با SSL را پشتیبانی می‌کند.

## Features | امکانات

- Phone-based OTP login
- Persian-first web UI
- Direct chats, groups, channels, and saved messages
- Media and file uploads
- Admin panel for users, SMS, and backups
- No-cache delivery for chat freshness
- Installable on a plain server IP
- Optional domain and Let's Encrypt SSL support

## Quick Install On Server IP | نصب سریع روی آی‌پی

Supported target:
- Ubuntu 22.04+
- Debian 12+

Run:

```bash
git clone https://github.com/hamedgh1373/tele-ir.git
cd tele-ir
sudo bash install.sh
```

The installer asks for:
- Install mode: `ip` or `domain`
- Server IP or domain
- Admin email
- Admin password
- SSL choice

If you choose `ip`, the default result is:

```text
http://YOUR_SERVER_IP:3012/login
```

## Domain And SSL | نصب با دامنه و SSL

Prerequisites:
- Domain A record points to your server
- Port `80` is open
- Port `3012` is open if you want to keep the custom port entry

Run the same installer:

```bash
sudo bash install.sh
```

Then choose:
- `domain`
- your domain name
- `yes` for SSL
- a valid email for Let's Encrypt

The installer will:
- install Nginx
- install MongoDB
- install Node.js and pnpm
- build the project
- create a `systemd` service
- request a Let's Encrypt certificate with `certbot`

## What The Installer Does | کارهایی که اسکریپت نصب انجام می‌دهد

1. Installs base packages, Nginx, Certbot, Node.js, pnpm, and MongoDB
2. Creates the `teleir` system user
3. Copies the project to `/opt/teleir`
4. Creates `/opt/teleir/.env.local`
5. Installs dependencies and builds production assets
6. Creates `teleir.service`
7. Creates Nginx reverse-proxy config
8. Starts and enables required services
9. Optionally configures Let's Encrypt SSL

## Default Runtime Layout | ساختار اجرای نصب

- App directory: `/opt/teleir`
- Public port: `3012`
- Internal Next.js port: `3013`
- MongoDB: `127.0.0.1:27017`
- Service name: `teleir.service`
- Nginx config: `/etc/nginx/conf.d/teleir.conf`

## Environment Variables | متغیرهای محیطی

Example file: [`.env.example`](/var/www/teleir/.env.example)

Key values:
- `MONGODB_URI`
- `TELEIR_DB_NAME`
- `TELEIR_LEGACY_DB_NAME`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Manual Production Commands | اجرای دستی در پروداکشن

```bash
pnpm install
pnpm build
pnpm start
```

## Update Existing Installation | آپدیت نصب موجود

If the project is already installed in `/opt/teleir`:

```bash
sudo bash update.sh
```

## GitHub Publishing | انتشار در گیت‌هاب

Helper notes: [`GITHUB_SETUP.md`](/var/www/teleir/GITHUB_SETUP.md)

To push this project directly from the server, GitHub password login is not enough. You need one of these:
- Personal Access Token
- SSH key
- GitHub CLI authenticated session

## Notes | نکات

- The login flow now follows the same host the user entered and no longer hardcodes an old IP.
- The project is designed for self-hosted private deployment.
- For public internet exposure, keep your server firewall and system updates in good shape.
