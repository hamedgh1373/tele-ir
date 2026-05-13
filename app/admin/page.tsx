import Link from "next/link";
import { requireAdmin } from "@/lib/server-session";
import { BrandMark } from "@/components/brand-mark";
import {
  AdminConsole,
  type BackupItem,
  type UserItem
} from "@/components/admin-console";
import { getDb } from "@/lib/chat";
import { getBackupSettings, listBackups } from "@/lib/backup";
import { getSmsSettings, maskApiKey } from "@/lib/sms";

type AdminSection = "users" | "sms" | "backups";

function toPlain<T>(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getSection(value?: string): AdminSection {
  return value === "sms" || value === "backups" ? value : "users";
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) || {};
  const initialSection = getSection(params.section);
  const db = await getDb();
  const users = toPlain<UserItem[]>(
    await db
      .collection("users")
      .find({}, { projection: { _id: 0, passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray()
  );
  const sms = await getSmsSettings();
  const backup = await getBackupSettings();
  const backups = toPlain<BackupItem[]>(await listBackups());

  return (
    <main className="admin-page">
      <div className="admin-head">
        <div className="page-title-with-brand">
          <BrandMark size="sm" />
          <div>
            <h1>پنل ادمین</h1>
            <p>مدیریت کاربران، پیامک و بکاپ‌ها</p>
          </div>
        </div>
        <Link href="/app">بازگشت به پیام‌ها</Link>
      </div>
      <AdminConsole
        initialUsers={users}
        initialSms={
          sms
            ? {
                enabled: sms.enabled,
                lineNumber: sms.lineNumber || "",
                templateId: sms.templateId || null,
                templateVariable: sms.templateVariable || "OTP",
                apiKeyMasked: maskApiKey(sms.apiKey)
              }
            : {
                enabled: false,
                lineNumber: "",
                templateId: null,
                templateVariable: "OTP",
                apiKeyMasked: ""
              }
        }
        initialBackup={
          backup
            ? {
                enabled: backup.enabled,
                intervalHours: backup.intervalHours,
                retainCount: backup.retainCount
              }
            : {
                enabled: false,
                intervalHours: 6,
                retainCount: 12
              }
        }
        initialBackups={backups}
        initialSection={initialSection}
      />
    </main>
  );
}
