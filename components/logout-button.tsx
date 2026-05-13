"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  function handleLogout() {
    void signOut({ callbackUrl: `${window.location.origin}/login` });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="ghost-btn"
    >
      خروج
    </button>
  );
}
