"use client";

import { useEffect, useState } from "react";
import { locales, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

export function LanguageSettings() {
  const { locale, setLocale, t, tForLocale } = useI18n();
  const [selected, setSelected] = useState<Locale>(locale);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelected(locale);
  }, [locale]);

  async function saveLanguage() {
    setLoading(true);
    setStatus("");
    const response = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: selected })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error || "Failed to save language.");
      return;
    }
    setLocale(selected);
    setStatus(tForLocale(selected, "languageSaved"));
  }

  return (
    <section className="panel-card" id="language">
      <div className="panel-title-row">
        <div>
          <h2>{t("language")}</h2>
          <p>{t("languageDescription")}</p>
        </div>
      </div>
      <div className="stack-form">
        <label>
          <span>{t("language")}</span>
          <select value={selected} onChange={(event) => setSelected(event.target.value as Locale)}>
            {locales.map((value) => (
              <option key={value} value={value}>
                {value === "fa"
                  ? t("farsi")
                  : value === "en"
                    ? t("english")
                    : value === "ru"
                      ? t("russian")
                      : t("chinese")}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button className="primary-btn" type="button" onClick={() => void saveLanguage()} disabled={loading}>
            {loading ? t("saveChanges") : t("saveSettings")}
          </button>
        </div>
        {status ? <p className="status-line">{status}</p> : null}
      </div>
    </section>
  );
}
