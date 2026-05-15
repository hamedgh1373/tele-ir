"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function PrivacySettings() {
  const { t } = useI18n();
  const [passcodeEnabled, setPasscodeEnabled] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setPasscodeEnabled(localStorage.getItem("teleir-passcode-enabled") === "1");
  }, []);

  function savePasscode() {
    const value = window.prompt(t("changePasscode"));
    if (!value || value.trim().length < 4) {
      setStatus(t("passcodeMinLength"));
      return;
    }
    localStorage.setItem("teleir-passcode", value.trim());
    localStorage.setItem("teleir-passcode-enabled", "1");
    setPasscodeEnabled(true);
    setStatus(t("passcodeEnabledStatus"));
  }

  function disablePasscode() {
    localStorage.removeItem("teleir-passcode");
    localStorage.removeItem("teleir-passcode-enabled");
    setPasscodeEnabled(false);
    setStatus(t("passcodeDisabledStatus"));
  }

  return (
    <section className="panel-card" id="privacy">
      <div className="panel-title-row">
        <div>
          <h2>{t("privacyTitle")}</h2>
          <p>{t("privacySubtitle")}</p>
        </div>
      </div>
      <div className="form-actions">
        <button className="ghost-btn" type="button" onClick={savePasscode}>
          {passcodeEnabled ? t("changePasscode") : t("enablePasscode")}
        </button>
        <button className="ghost-btn danger" type="button" onClick={disablePasscode} disabled={!passcodeEnabled}>
          {t("disablePasscode")}
        </button>
      </div>
      {status ? <p className="status-line">{status}</p> : null}
    </section>
  );
}
