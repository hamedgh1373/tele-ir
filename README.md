# Tele IR

[English](#english) | [فارسی](#فارسی)

---

## English

Tele IR is a self-hosted private web messenger built for Persian-speaking teams, communities, and organizations that want full control over their messaging platform. It includes phone-based OTP login, direct chats, groups, channels, media sharing, an admin panel, and deployment support for both raw server IPs and custom domains with SSL.

### Features

- Phone number login with one-time verification code
- Persian-first user experience with responsive web interface
- Direct messaging between users
- Group chats and channel-style communication
- Saved messages / personal notes
- File, image, and media sharing
- Admin panel for user management
- SMS settings management for OTP delivery
- Backup management section for operational maintenance
- No-cache delivery strategy for fresher chat state after reload
- Works behind a server IP or a custom domain
- Optional Let's Encrypt SSL setup during installation

### Server Requirements

- Ubuntu 22.04 or newer
- Debian 12 or newer
- Root or sudo access
- Open ports:
  - `80` for domain setup and SSL
  - `3012` for public app access

### Quick Install On A Server IP

```bash
git clone https://github.com/hamedgh1373/tele-ir.git
cd tele-ir
sudo bash install.sh
```

The installer will ask for:

- Install mode: `ip` or `domain`
- Server IP or domain name
- Admin email
- Admin password
- SSL preference

If you choose `ip`, the default app URL will be:

```text
http://YOUR_SERVER_IP:3012/login
```

### Install With Domain And SSL

Before starting:

- Point your domain A record to your server IP
- Make sure port `80` is open
- Keep port `3012` open if you want direct custom-port access

Run:

```bash
sudo bash install.sh
```

Then choose:

- `domain`
- your domain name
- `yes` for SSL
- a valid email address for Let's Encrypt

The installer will automatically:

- install Nginx
- install MongoDB
- install Node.js and pnpm
- build the application
- create a `systemd` service
- configure reverse proxy
- request and enable a Let's Encrypt certificate with `certbot`

### What The Installer Does

1. Installs required base packages
2. Installs Nginx, Certbot, Node.js, pnpm, and MongoDB
3. Creates the `teleir` system user
4. Copies the project to `/opt/teleir`
5. Creates `/opt/teleir/.env.local`
6. Installs project dependencies
7. Builds production assets
8. Creates and enables `teleir.service`
9. Creates the Nginx reverse-proxy configuration
10. Optionally configures SSL with Let's Encrypt

### Default Runtime Layout

- App directory: `/opt/teleir`
- Public port: `3012`
- Internal Next.js port: `3013`
- MongoDB address: `127.0.0.1:27017`
- Service name: `teleir.service`
- Nginx config: `/etc/nginx/conf.d/teleir.conf`

### Environment Variables

Example file: `.env.example`

Important values:

- `MONGODB_URI`
- `TELEIR_DB_NAME`
- `TELEIR_LEGACY_DB_NAME`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### Manual Production Commands

```bash
pnpm install
pnpm build
pnpm start
```

### Update An Existing Installation

If the project is already installed in `/opt/teleir`:

```bash
sudo bash update.sh
```

### GitHub Publishing

Helper notes: `GITHUB_SETUP.md`

GitHub password login is not enough for command-line publishing. Use one of these:

- Personal Access Token
- SSH key
- GitHub CLI authenticated session

### Notes

- The login flow follows the same host or IP the user entered and does not force old IPs or localhost redirects.
- The project is intended for self-hosted deployment.
- For public deployment, keep your firewall, OS packages, and SSL certificates maintained.

---

## فارسی

تل ایران یک پیام‌رسان تحت وب و self-hosted است که برای تیم‌ها، مجموعه‌ها و استفاده خصوصی طراحی شده و کنترل کامل روی سرور و داده‌ها را در اختیار شما می‌گذارد. این پروژه ورود با شماره موبایل و کد یکبارمصرف، چت خصوصی، گروه، کانال، ارسال فایل و رسانه، پنل ادمین، و نصب روی IP یا دامنه با SSL را پشتیبانی می‌کند.

### امکانات

- ورود با شماره موبایل و کد تایید یکبارمصرف
- رابط کاربری فارسی و سازگار با موبایل و دسکتاپ
- گفت‌وگوی خصوصی بین کاربران
- گروه‌ها و کانال‌ها
- بخش پیام‌های ذخیره‌شده برای یادداشت شخصی
- ارسال فایل، تصویر و رسانه
- پنل ادمین برای مدیریت کاربران
- بخش تنظیمات پیامک برای ارسال کد تایید
- بخش بکاپ برای نگهداری و مدیریت عملیات
- عدم استفاده از کش صفحه برای تازه‌تر ماندن وضعیت چت‌ها
- امکان اجرا روی IP مستقیم سرور
- امکان نصب روی دامنه با SSL رایگان Let's Encrypt

### پیش‌نیازهای سرور

- Ubuntu 22.04 به بالا
- Debian 12 به بالا
- دسترسی `root` یا `sudo`
- باز بودن پورت‌ها:
  - `80` برای دامنه و SSL
  - `3012` برای دسترسی عمومی به برنامه

### نصب سریع روی آی‌پی سرور

```bash
git clone https://github.com/hamedgh1373/tele-ir.git
cd tele-ir
sudo bash install.sh
```

اسکریپت نصب این موارد را از شما می‌پرسد:

- حالت نصب: `ip` یا `domain`
- آی‌پی سرور یا نام دامنه
- ایمیل ادمین
- رمز عبور ادمین
- انتخاب فعال‌سازی SSL

اگر حالت `ip` را انتخاب کنید، آدرس پیش‌فرض برنامه این خواهد بود:

```text
http://YOUR_SERVER_IP:3012/login
```

### نصب با دامنه و SSL

قبل از شروع:

- رکورد `A` دامنه را به IP سرور وصل کنید
- پورت `80` را باز نگه دارید
- اگر می‌خواهید دسترسی مستقیم با پورت سفارشی هم بماند، پورت `3012` را هم باز بگذارید

دستور نصب:

```bash
sudo bash install.sh
```

سپس این گزینه‌ها را انتخاب کنید:

- `domain`
- نام دامنه
- `yes` برای SSL
- یک ایمیل معتبر برای Let's Encrypt

اسکریپت به‌صورت خودکار این کارها را انجام می‌دهد:

- نصب `Nginx`
- نصب `MongoDB`
- نصب `Node.js` و `pnpm`
- build گرفتن از پروژه
- ساخت سرویس `systemd`
- تنظیم reverse proxy
- دریافت و فعال‌سازی گواهی SSL با `certbot`

### اسکریپت نصب چه کارهایی انجام می‌دهد

1. پکیج‌های پایه موردنیاز را نصب می‌کند
2. `Nginx`، `Certbot`، `Node.js`، `pnpm` و `MongoDB` را نصب می‌کند
3. کاربر سیستمی `teleir` را می‌سازد
4. پروژه را در مسیر `/opt/teleir` قرار می‌دهد
5. فایل `/opt/teleir/.env.local` را می‌سازد
6. وابستگی‌های پروژه را نصب می‌کند
7. build پروداکشن را ایجاد می‌کند
8. سرویس `teleir.service` را می‌سازد و فعال می‌کند
9. کانفیگ reverse proxy مربوط به `Nginx` را ایجاد می‌کند
10. در صورت انتخاب شما، SSL را با Let's Encrypt تنظیم می‌کند

### ساختار پیش‌فرض اجرا

- مسیر برنامه: `/opt/teleir`
- پورت عمومی: `3012`
- پورت داخلی Next.js: `3013`
- آدرس MongoDB: `127.0.0.1:27017`
- نام سرویس: `teleir.service`
- فایل کانفیگ Nginx: `/etc/nginx/conf.d/teleir.conf`

### متغیرهای محیطی

فایل نمونه: `.env.example`

متغیرهای مهم:

- `MONGODB_URI`
- `TELEIR_DB_NAME`
- `TELEIR_LEGACY_DB_NAME`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### اجرای دستی در محیط پروداکشن

```bash
pnpm install
pnpm build
pnpm start
```

### آپدیت نصب موجود

اگر پروژه قبلا در `/opt/teleir` نصب شده است:

```bash
sudo bash update.sh
```

### انتشار روی GitHub

راهنمای کمکی: `GITHUB_SETUP.md`

برای انتشار پروژه از طریق command line، پسورد معمولی GitHub کافی نیست و باید یکی از این‌ها را داشته باشید:

- `Personal Access Token`
- `SSH key`
- نشست احرازشده `GitHub CLI`

### نکات

- جریان لاگین از همان IP یا دامنه‌ای که کاربر وارد کرده ادامه پیدا می‌کند و به IP قدیمی یا `localhost` ریدایرکت نمی‌شود.
- این پروژه برای استقرار self-hosted طراحی شده است.
- برای استفاده عمومی روی اینترنت، بهتر است فایروال، آپدیت‌های سیستم و وضعیت SSL را به‌صورت منظم نگهداری کنید.
