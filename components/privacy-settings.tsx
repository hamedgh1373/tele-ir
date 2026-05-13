"use client";

import { useEffect, useState } from "react";

export function PrivacySettings() {
  const [passcodeEnabled, setPasscodeEnabled] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setPasscodeEnabled(localStorage.getItem("teleir-passcode-enabled") === "1");
  }, []);

  function savePasscode() {
    const value = window.prompt("New local passcode");
    if (!value || value.trim().length < 4) {
      setStatus("رمز باید حداقل ۴ کاراکتر باشد.");
      return;
    }
    localStorage.setItem("teleir-passcode", value.trim());
    localStorage.setItem("teleir-passcode-enabled", "1");
    setPasscodeEnabled(true);
    setStatus("Passcode lock فعال شد. این قفل محلی مرورگر است و جایگزین رمزنگاری سراسری نیست.");
  }

  function disablePasscode() {
    localStorage.removeItem("teleir-passcode");
    localStorage.removeItem("teleir-passcode-enabled");
    setPasscodeEnabled(false);
    setStatus("Passcode lock غیرفعال شد.");
  }

  return (
    <section className="panel-card" id="privacy">
      <div className="panel-title-row">
        <div>
          <h2>Privacy & Security</h2>
          <p>قفل محلی برنامه و کنترل پایه حریم خصوصی.</p>
        </div>
      </div>
      <div className="form-actions">
        <button className="ghost-btn" type="button" onClick={savePasscode}>
          {passcodeEnabled ? "Change passcode" : "Enable passcode lock"}
        </button>
        <button className="ghost-btn danger" type="button" onClick={disablePasscode} disabled={!passcodeEnabled}>
          Disable passcode
        </button>
      </div>
      {status ? <p className="status-line">{status}</p> : null}
    </section>
  );
}
