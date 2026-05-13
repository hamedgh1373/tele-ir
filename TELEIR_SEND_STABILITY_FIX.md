# Teleir send stability fix

این نسخه برای مشکل خروج از چت و ارسال‌نشدن پیام بعد از کلیک روی ارسال اصلاح شده است.

## اصلاحات اصلی

- `handleSendMessage` بازنویسی شد تا هنگام ارسال، `activeChatId` و `mobilePane` قفل شوند و چت بسته نشود.
- اگر API خطا بدهد، پیام optimistic حذف می‌شود ولی کاربر داخل همان چت می‌ماند و متن دوباره داخل composer برمی‌گردد.
- اگر API پاسخ نامعتبر بدهد، خطا در `/api/debug/logs` ثبت می‌شود.
- مسیر `POST /api/chats/[chatId]/messages` با دیتابیس‌های legacy که به‌جای `participantIds` فیلد `members` دارند سازگار شد.
- مسیر upload و SSE پیام‌ها نیز با `members` سازگار شد تا stream باعث بسته شدن چت نشود.
- `listChatsForUser` حالا هم `participantIds` و هم `members` را می‌خواند و `Saved Messages` قدیمی را هم تشخیص می‌دهد.

## بعد از جایگزینی

```bash
rm -rf .next
pnpm build
```

اگر ارسال باز هم خطا داشت:

```bash
cat /var/www/teleir/storage/logs/teleir.log | tail -300
```
