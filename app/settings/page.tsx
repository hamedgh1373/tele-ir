import Link from "next/link";
import { requireSession } from "@/lib/server-session";
import { BrandMark } from "@/components/brand-mark";
import { SessionSettings } from "@/components/session-settings";
import { PrivacySettings } from "@/components/privacy-settings";
import { ProfileSettings } from "@/components/profile-settings";

export default async function SettingsPage() {
  await requireSession();

  return (
    <main className="settings-page">
      <section className="settings-modal">
        <aside className="settings-menu">
          <BrandMark size="sm" withText />
          <a className="active" href="#profile">پروفایل</a>
          <a href="#sessions">سشن‌ها</a>
          <a href="#privacy">حریم خصوصی</a>
        </aside>
        <div className="settings-content">
          <div className="admin-head">
            <div className="page-title-with-brand">
              <BrandMark size="sm" />
              <div>
                <h1>تنظیمات</h1>
                <p>مدیریت حساب و دستگاه‌های فعال</p>
              </div>
            </div>
            <Link href="/app">بازگشت به پیام‌ها</Link>
          </div>
          <ProfileSettings />
          <div id="sessions">
            <SessionSettings />
          </div>
          <PrivacySettings />
        </div>
      </section>
    </main>
  );
}
