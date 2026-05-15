"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type SessionItem = {
  sessionId: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
};

export function SessionSettings() {
  const { t, localeTag } = useI18n();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSid, setCurrentSid] = useState("");
  const [status, setStatus] = useState("");

  async function loadSessions() {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setStatus(t("sessionsLoadFailed"));
      return;
    }
    setCurrentSid(data.currentSid || "");
    setSessions(data.sessions || []);
  }

  useEffect(() => {
    void fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAgent: navigator.userAgent || "" })
    });
    void loadSessions();
  }, []);

  async function removeSession(sessionId: string) {
    const response = await fetch(`/api/sessions?sid=${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(t("sessionsRemoveFailed"));
      return;
    }
    setStatus(t("sessionRemoved"));
    await loadSessions();
  }

  return (
    <section className="panel-card session-panel">
      <h2>{t("sessions")}</h2>
      {status ? <p className="error-text">{status}</p> : null}
      <div className="user-list">
        {[...sessions]
          .filter((item, index, arr) => arr.findIndex((x) => x.sessionId === item.sessionId) === index)
          .sort((a, b) => {
            if (a.sessionId === currentSid && b.sessionId !== currentSid) return -1;
            if (a.sessionId !== currentSid && b.sessionId === currentSid) return 1;
            return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
          })
          .map((item) => (
          <div className="user-row" key={item.sessionId}>
            <div>
              <strong>{item.sessionId === currentSid ? t("thisDevice") : t("otherDevice")}</strong>
              <span>{item.userAgent || t("unknownDevice")}</span>
              <span>{t("lastOnline")}: {new Date(item.lastSeenAt).toLocaleString(localeTag)}</span>
            </div>
            <div className="user-row-actions">
              <time>{new Date(item.createdAt).toLocaleString(localeTag)}</time>
              <button
                className="ghost-btn"
                type="button"
                disabled={item.sessionId === currentSid}
                onClick={() => void removeSession(item.sessionId)}
              >
                {t("removeSession")}
              </button>
            </div>
          </div>
        ))}
        {sessions.length === 0 ? <p className="empty-text">{t("noSessions")}</p> : null}
      </div>
    </section>
  );
}
