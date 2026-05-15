import Link from "next/link";
import { requireSession } from "@/lib/server-session";
import { BrandMark } from "@/components/brand-mark";
import { SessionSettings } from "@/components/session-settings";
import { PrivacySettings } from "@/components/privacy-settings";
import { ProfileSettings } from "@/components/profile-settings";
import { LanguageSettings } from "@/components/language-settings";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/locale";

export default async function SettingsPage() {
  await requireSession();
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  return (
    <main className="settings-page">
      <section className="settings-modal">
        <aside className="settings-menu">
          <BrandMark size="sm" withText />
          <a className="active" href="#profile">{t.profile}</a>
          <a href="#sessions">{t.sessions}</a>
          <a href="#privacy">{t.privacy}</a>
          <a href="#language">{t.language}</a>
        </aside>
        <div className="settings-content">
          <div className="admin-head">
            <div className="page-title-with-brand">
              <BrandMark size="sm" />
              <div>
                <h1>{t.settingsTitle}</h1>
                <p>{t.settingsSubtitle}</p>
              </div>
            </div>
            <Link href="/app">{t.backToMessages}</Link>
          </div>
          <ProfileSettings />
          <div id="sessions">
            <SessionSettings />
          </div>
          <PrivacySettings />
          <LanguageSettings />
        </div>
      </section>
    </main>
  );
}
