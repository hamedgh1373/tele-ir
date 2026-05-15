"use client";

import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export type UserItem = {
  id: string;
  name: string;
  phone?: string;
  role: "admin" | "user";
  uploadLimitMb?: number;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
};

export type BackupItem = {
  name: string;
  type: "full" | "chats-files";
};

type SmsInitial = {
  enabled: boolean;
  lineNumber?: string;
  templateId?: number | null;
  templateVariable?: string;
  apiKeyMasked?: string;
};

type BackupInitial = {
  enabled: boolean;
  intervalHours: number;
  retainCount: number;
};

type AdminSection = "users" | "sms" | "backups";

function formatAdminDate(value: string | undefined, localeTag: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran"
  }).format(new Date(value));
}

export function AdminConsole({
  initialUsers = [],
  initialSms,
  initialBackup,
  initialBackups = [],
  initialSection = "users"
}: {
  initialUsers?: UserItem[];
  initialSms?: SmsInitial;
  initialBackup?: BackupInitial;
  initialBackups?: BackupItem[];
  initialSection?: AdminSection;
}) {
  const { t, localeTag } = useI18n();
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [uploadLimitMb, setUploadLimitMb] = useState("100");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [phone, setPhone] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(Boolean(initialSms?.enabled));
  const [smsApiKey, setSmsApiKey] = useState("");
  const [smsLineNumber, setSmsLineNumber] = useState(initialSms?.lineNumber || "");
  const [smsTemplateId, setSmsTemplateId] = useState(
    initialSms?.templateId ? String(initialSms.templateId) : ""
  );
  const [smsTemplateVariable, setSmsTemplateVariable] = useState(initialSms?.templateVariable || "OTP");
  const [smsMasked, setSmsMasked] = useState(initialSms?.apiKeyMasked || "");
  const [smsStatus, setSmsStatus] = useState("");
  const [backupEnabled, setBackupEnabled] = useState(Boolean(initialBackup?.enabled));
  const [backupIntervalHours, setBackupIntervalHours] = useState(String(initialBackup?.intervalHours || 6));
  const [backupRetainCount, setBackupRetainCount] = useState(String(initialBackup?.retainCount || 12));
  const [backupStatus, setBackupStatus] = useState("");
  const [backups, setBackups] = useState<BackupItem[]>(initialBackups);
  const [selectedBackup, setSelectedBackup] = useState(initialBackups[0]?.name || "");
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);

  async function loadUsers() {
    const response = await fetch("/api/users", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setUsers(data.users);
    }
  }

  useEffect(() => {
    void loadUsers();
    void loadSmsSettings();
    void loadBackupSettings();
    void loadBackups();
  }, []);

  async function loadSmsSettings() {
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      return;
    }
    setSmsEnabled(Boolean(data.sms?.enabled));
    setSmsLineNumber(data.sms?.lineNumber || "");
    setSmsTemplateId(data.sms?.templateId ? String(data.sms.templateId) : "");
    setSmsTemplateVariable(data.sms?.templateVariable || "OTP");
    setSmsMasked(data.sms?.apiKeyMasked || "");
  }

  async function loadBackupSettings() {
    const response = await fetch("/api/admin/backup/settings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      return;
    }
    setBackupEnabled(Boolean(data.backup?.enabled));
    setBackupIntervalHours(String(data.backup?.intervalHours || 6));
    setBackupRetainCount(String(data.backup?.retainCount || 12));
  }

  async function loadBackups() {
    const response = await fetch("/api/admin/backup/list", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      return;
    }
    setBackups((data.backups || []) as BackupItem[]);
    if (!selectedBackup && data.backups?.[0]?.name) {
      setSelectedBackup(data.backups[0].name);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch(editingUser ? `/api/users/${editingUser.id}` : "/api/users", {
      method: editingUser ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, role, uploadLimitMb })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(t("saveUserFailed"));
      setLoading(false);
      return;
    }

    resetForm();
    setMessage(t("saveSuccessUser"));
    await loadUsers();
    setLoading(false);
  }

  function resetForm() {
    setName("");
    setPhone("");
    setRole("user");
    setUploadLimitMb("100");
    setEditingUser(null);
  }

  function startEdit(user: UserItem) {
    setMessage("");
    setEditingUser(user);
    setName(user.name);
    setRole(user.role);
    setPhone(user.phone || "");
    setUploadLimitMb(String(user.uploadLimitMb || 100));
  }

  async function saveSmsSettings() {
    setSmsStatus("");
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: smsEnabled,
        apiKey: smsApiKey.trim(),
        lineNumber: smsLineNumber.trim(),
        templateId: smsTemplateId.trim() ? Number(smsTemplateId) : undefined,
        templateVariable: smsTemplateVariable.trim() || "OTP"
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setSmsStatus(t("saveSmsFailed"));
      return;
    }
    setSmsApiKey("");
    setSmsStatus(t("saveSuccessSms"));
    await loadSmsSettings();
  }

  async function saveBackupSettings() {
    setBackupStatus("");
    const response = await fetch("/api/admin/backup/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: backupEnabled,
        intervalHours: Number(backupIntervalHours),
        retainCount: Number(backupRetainCount)
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setBackupStatus(t("saveBackupFailed"));
      return;
    }
    setBackupStatus(t("saveSuccessBackup"));
  }

  async function runBackupNow() {
    setBackupStatus("");
    const response = await fetch("/api/admin/backup/run", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setBackupStatus(t("runBackupFailed"));
      return;
    }
    setBackupStatus(t("backupRunSuccess"));
    await loadBackups();
  }

  async function restoreSelectedBackup() {
    if (!selectedBackup) {
      return;
    }
    const sure = window.confirm(t("restoreBackupConfirm"));
    if (!sure) {
      return;
    }
    setBackupStatus("");
    const response = await fetch("/api/admin/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: selectedBackup })
    });
    const data = await response.json();
    if (!response.ok) {
      setBackupStatus(t("restoreBackupFailed"));
      return;
    }
    setBackupStatus(t("backupRestoreSuccess"));
  }

  return (
    <section className="admin-console">
      <aside className="admin-nav">
        <strong>{t("management")}</strong>
        <a
          href="/admin?section=users"
          className={activeSection === "users" ? "active" : ""}
          onClick={(event) => {
            event.preventDefault();
            window.history.replaceState(null, "", "/admin?section=users");
            setActiveSection("users");
          }}
        >
          {t("users")}
        </a>
        <a
          href="/admin?section=sms"
          className={activeSection === "sms" ? "active" : ""}
          onClick={(event) => {
            event.preventDefault();
            window.history.replaceState(null, "", "/admin?section=sms");
            setActiveSection("sms");
          }}
        >
          {t("sms")}
        </a>
        <a
          href="/admin?section=backups"
          className={activeSection === "backups" ? "active" : ""}
          onClick={(event) => {
            event.preventDefault();
            window.history.replaceState(null, "", "/admin?section=backups");
            setActiveSection("backups");
          }}
        >
          {t("backups")}
        </a>
      </aside>

      <div className="admin-workspace">
        {activeSection === "users" ? (
          <div className="admin-section-grid">
            <form id="users" className="panel-card stack-form" onSubmit={handleSubmit}>
              <div className="panel-title-row">
                <div>
                  <h2>{editingUser ? t("editUser") : t("createUser")}</h2>
                  <p>{t("userFormHint")}</p>
                </div>
              </div>
              <label>
                <span>{t("name")}</span>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                <span>{t("phoneNumber")}</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="09123456789"
                  required
                />
              </label>
              <div className="two-col-form">
                <label>
                  <span>{t("userRole")}</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "user")}>
                    <option value="user">{t("regularUser")}</option>
                    <option value="admin">{t("admin")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("uploadLimitMb")}</span>
                  <input
                    type="number"
                    min="1"
                    max="1024"
                    value={uploadLimitMb}
                    onChange={(event) => setUploadLimitMb(event.target.value)}
                    required
                  />
                </label>
              </div>
              {message ? <p className="error-text">{message}</p> : null}
              <div className="form-actions">
                <button className="primary-btn" type="submit" disabled={loading}>
                  {loading ? t("saveChanges") : editingUser ? t("saveChanges") : t("addUser")}
                </button>
                {editingUser ? (
                  <button className="ghost-btn" type="button" onClick={resetForm}>
                    {t("cancel")}
                  </button>
                ) : null}
              </div>
            </form>

            <div className="panel-card user-table-card">
              <div className="panel-title-row">
                <div>
                  <h2>{t("users")}</h2>
                  <p>{users.length} {t("registeredUsers")}</p>
                </div>
              </div>
              <div className="admin-user-table">
                {users.map((user) => (
                  <div key={user.id} className="admin-user-row">
                    <div className="admin-user-main">
                      <div className="admin-avatar">{user.name.slice(0, 1) || "T"}</div>
                      <div>
                        <strong>{user.name}</strong>
                        {user.phone ? <span>{user.phone}</span> : null}
                      </div>
                    </div>
                    <div className="admin-user-meta">
                      <span className="role-pill">{user.role === "admin" ? t("admin") : t("regularUser")}</span>
                      <span className="role-pill">{user.uploadLimitMb || 100} MB</span>
                      <time suppressHydrationWarning>{formatAdminDate(user.updatedAt || user.createdAt, localeTag)}</time>
                      <button className="ghost-btn" type="button" onClick={() => startEdit(user)}>
                        {t("editUser")}
                      </button>
                    </div>
                  </div>
                ))}
                {users.length === 0 ? <p className="empty-text">{t("noUsersYet")}</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "sms" ? (
          <div id="sms" className="panel-card admin-single-panel">
            <div className="panel-title-row">
              <div>
                <h2>{t("smsSettingsTitle")}</h2>
                <p>{t("smsSettingsSubtitle")}</p>
              </div>
              <span className={smsEnabled ? "status-pill on" : "status-pill"}>{smsEnabled ? t("enabled") : t("disabled")}</span>
            </div>
            <div className="stack-form">
              <label>
                <span>{t("enableSmsOtp")}</span>
                <select
                  value={smsEnabled ? "1" : "0"}
                  onChange={(event) => setSmsEnabled(event.target.value === "1")}
                >
                  <option value="1">{t("enabled")}</option>
                  <option value="0">{t("disabled")}</option>
                </select>
              </label>
              <label>
                <span>{t("newApiKey")}</span>
                <input
                  value={smsApiKey}
                  onChange={(event) => setSmsApiKey(event.target.value)}
                  placeholder={smsMasked || "کلید API را وارد کنید"}
                />
              </label>
              <div className="two-col-form">
                <label>
                  <span>{t("lineNumber")}</span>
                  <input
                    value={smsLineNumber}
                    onChange={(event) => setSmsLineNumber(event.target.value)}
                    placeholder="3000..."
                  />
                </label>
                <label>
                  <span>{t("templateId")}</span>
                  <input
                    type="number"
                    min="1"
                    value={smsTemplateId}
                    onChange={(event) => setSmsTemplateId(event.target.value)}
                    placeholder="مثلا 123456"
                  />
                </label>
              </div>
              <label>
                <span>{t("templateCodeVariable")}</span>
                <input
                  value={smsTemplateVariable}
                  onChange={(event) => setSmsTemplateVariable(event.target.value.toUpperCase())}
                  placeholder="OTP"
                />
              </label>
              {smsStatus ? <p className="error-text">{smsStatus}</p> : null}
              <div className="form-actions">
                <button className="primary-btn" type="button" onClick={() => void saveSmsSettings()}>
                  {t("saveSmsSettings")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "backups" ? (
          <div id="backups" className="admin-section-grid">
            <div className="panel-card">
              <div className="panel-title-row">
                <div>
                  <h2>{t("backupSettingsTitle")}</h2>
                  <p>{t("backupSettingsSubtitle")}</p>
                </div>
                <span className={backupEnabled ? "status-pill on" : "status-pill"}>{backupEnabled ? t("enabled") : t("disabled")}</span>
              </div>
              <div className="stack-form">
                <label>
                  <span>{t("enableScheduledBackup")}</span>
                  <select
                    value={backupEnabled ? "1" : "0"}
                    onChange={(event) => setBackupEnabled(event.target.value === "1")}
                  >
                    <option value="1">{t("enabled")}</option>
                    <option value="0">{t("disabled")}</option>
                  </select>
                </label>
                <div className="two-col-form">
                  <label>
                    <span>{t("backupIntervalHours")}</span>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={backupIntervalHours}
                      onChange={(event) => setBackupIntervalHours(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("retainCount")}</span>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={backupRetainCount}
                      onChange={(event) => setBackupRetainCount(event.target.value)}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary-btn" type="button" onClick={() => void saveBackupSettings()}>
                    {t("saveSettings")}
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => void runBackupNow()}>
                    {t("runManualBackup")}
                  </button>
                </div>
                {backupStatus ? <p className="error-text">{backupStatus}</p> : null}
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-title-row">
                <div>
                  <h2>{t("backupFiles")}</h2>
                  <p>{backups.length} {t("filesAvailable")}</p>
                </div>
              </div>
              <div className="stack-form">
                <label>
                  <span>{t("selectFile")}</span>
                  <select
                    value={selectedBackup}
                    onChange={(event) => setSelectedBackup(event.target.value)}
                  >
                    <option value="">{t("selectOption")}</option>
                    {backups.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.type === "full" ? t("fullBackup") : t("chatsFilesBackup")} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="backup-file-list">
                  {backups.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={item.name === selectedBackup ? "selected" : ""}
                      onClick={() => setSelectedBackup(item.name)}
                    >
                      <strong>{item.type === "full" ? t("fullBackup") : t("chatsFilesBackup")}</strong>
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <a
                    className="ghost-btn"
                    href={selectedBackup ? `/api/admin/backup/download/${encodeURIComponent(selectedBackup)}` : "#"}
                  >
                    {t("downloadBackup")}
                  </a>
                  <button className="ghost-btn danger" type="button" onClick={() => void restoreSelectedBackup()}>
                    {t("restoreBackup")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
