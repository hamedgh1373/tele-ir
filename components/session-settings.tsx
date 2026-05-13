"use client";

import { useEffect, useState } from "react";

type SessionItem = {
  sessionId: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
};

export function SessionSettings() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSid, setCurrentSid] = useState("");
  const [status, setStatus] = useState("");

  async function loadSessions() {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "خطا در دریافت سشن‌ها");
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
      setStatus(data.error || "خطا در حذف سشن");
      return;
    }
    setStatus("سشن حذف شد.");
    await loadSessions();
  }

  return (
    <section className="panel-card session-panel">
      <h2>سشن‌های فعال</h2>
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
              <strong>{item.sessionId === currentSid ? "این دستگاه" : "دستگاه دیگر"}</strong>
              <span>{item.userAgent || "Unknown device"}</span>
              <span>آخرین آنلاین: {new Date(item.lastSeenAt).toLocaleString("fa-IR")}</span>
            </div>
            <div className="user-row-actions">
              <time>{new Date(item.createdAt).toLocaleString("fa-IR")}</time>
              <button
                className="ghost-btn"
                type="button"
                disabled={item.sessionId === currentSid}
                onClick={() => void removeSession(item.sessionId)}
              >
                حذف سشن
              </button>
            </div>
          </div>
        ))}
        {sessions.length === 0 ? <p className="empty-text">سشنی ثبت نشده است.</p> : null}
      </div>
    </section>
  );
}
