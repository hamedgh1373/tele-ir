"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  avatar?: {
    name?: string;
    mimeType?: string;
    size?: number;
    updatedAt?: string;
  };
};

export function ProfileSettings() {
  const { t } = useI18n();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfile() {
    const response = await fetch("/api/account/profile", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setUser(data.user);
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] || null);
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus("");
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await fetch("/api/account/avatar", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStatus(t("profileUploadFailed"));
      return;
    }
    setFile(null);
    window.dispatchEvent(new Event("kaman-profile-updated"));
    setStatus(t("imageSaved"));
    await loadProfile();
  }

  async function deleteAvatar() {
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStatus(t("profileDeleteFailed"));
      return;
    }
    window.dispatchEvent(new Event("kaman-profile-updated"));
    setStatus(t("imageDeleted"));
    await loadProfile();
  }

  return (
    <section id="profile" className="settings-card profile-settings-card">
      <h2>{t("profileTitle")}</h2>
      <p>{t("profileSubtitle")}</p>
      <div className="profile-settings-row">
        <div className="profile-settings-avatar">
          {user?.avatar ? (
            <img src={`/api/account/avatar?t=${user.avatar.updatedAt || Date.now()}`} alt={t("profileTitle")} />
          ) : (
            <span>{user?.name?.slice(0, 1) || "T"}</span>
          )}
        </div>
        <div>
          <strong>{user?.name || t("user")}</strong>
          <span>{user?.phone || user?.email || ""}</span>
          {user?.avatar?.size ? <small>{Math.ceil(user.avatar.size / 1024)} KB</small> : null}
        </div>
      </div>
      <form className="profile-avatar-form" onSubmit={uploadAvatar}>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChange} />
        <button type="submit" disabled={busy || !file}>{t("saveImage")}</button>
        <button type="button" disabled={busy || !user?.avatar} onClick={() => void deleteAvatar()}>{t("deleteImage")}</button>
      </form>
      {status ? <p className="status-line">{status}</p> : null}
    </section>
  );
}
