import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { getTeleirDb } from "@/lib/mongodb";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BACKUP_DIR = "/var/www/teleir/storage/backups";

export type BackupSettings = {
  enabled: boolean;
  intervalHours: number;
  retainCount: number;
  updatedAt: string;
  updatedBy: string;
};

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function getDb() {
  return getTeleirDb();
}

export async function getBackupSettings() {
  const db = await getDb();
  const doc = await db.collection("settings").findOne({ key: "backup" });
  return (doc?.value || null) as BackupSettings | null;
}

export async function saveBackupSettings(settings: BackupSettings) {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { key: "backup" },
    { $set: { key: "backup", value: settings } },
    { upsert: true }
  );
}

async function dumpCollections(collectionNames: string[]) {
  const db = await getDb();
  const output: Record<string, unknown[]> = {};
  for (const name of collectionNames) {
    output[name] = await db.collection(name).find({}).toArray();
  }
  return output;
}

async function cleanupRetention(prefix: string, retainCount: number) {
  const files = (await readdir(BACKUP_DIR))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json.gz"))
    .sort()
    .reverse();
  const toDelete = files.slice(Math.max(0, retainCount));
  for (const name of toDelete) {
    await rm(path.join(BACKUP_DIR, name), { force: true });
  }
}

async function writeBackupFile(fileName: string, payload: unknown) {
  await mkdir(BACKUP_DIR, { recursive: true });
  const raw = Buffer.from(JSON.stringify(payload));
  const gz = await gzipAsync(raw);
  await writeFile(path.join(BACKUP_DIR, fileName), gz);
}

export async function createBackups(actor: string, reason = "manual") {
  const ts = stamp();
  const now = new Date().toISOString();
  const settings = (await getBackupSettings()) || {
    enabled: false,
    intervalHours: 6,
    retainCount: 12,
    updatedAt: now,
    updatedBy: actor
  };

  const full = await dumpCollections([
    "users",
    "chats",
    "messages",
    "files",
    "settings",
    "otp_codes",
    "user_contacts"
  ]);
  const chatData = await dumpCollections(["chats", "messages", "files"]);

  const fullFile = `full-${ts}.json.gz`;
  const chatsFile = `chats-files-${ts}.json.gz`;

  await writeBackupFile(fullFile, {
    type: "full",
    createdAt: now,
    reason,
    by: actor,
    collections: full
  });
  await writeBackupFile(chatsFile, {
    type: "chats-files",
    createdAt: now,
    reason,
    by: actor,
    collections: chatData
  });

  await cleanupRetention("full-", settings.retainCount);
  await cleanupRetention("chats-files-", settings.retainCount);

  const db = await getDb();
  await db.collection("settings").updateOne(
    { key: "backup_runtime" },
    {
      $set: {
        key: "backup_runtime",
        value: {
          lastRunAt: now,
          lastRunBy: actor,
          lastReason: reason
        }
      }
    },
    { upsert: true }
  );

  return { fullFile, chatsFile };
}

export async function listBackups() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const names = (await readdir(BACKUP_DIR))
    .filter((name) => name.endsWith(".json.gz"))
    .sort()
    .reverse();
  return names.map((name) => ({
    name,
    type: name.startsWith("full-") ? "full" : "chats-files"
  }));
}

export async function readBackup(fileName: string) {
  if (!/^[a-z0-9\-]+\.json\.gz$/i.test(fileName)) {
    throw new Error("Invalid backup file name.");
  }
  const fullPath = path.join(BACKUP_DIR, fileName);
  const zipped = await readFile(fullPath);
  const raw = await gunzipAsync(zipped);
  return JSON.parse(raw.toString("utf8")) as {
    type: "full" | "chats-files";
    collections: Record<string, unknown[]>;
  };
}

export async function restoreBackup(fileName: string, actor: string) {
  const backup = await readBackup(fileName);
  const db = await getDb();
  const now = new Date().toISOString();

  for (const [collectionName, items] of Object.entries(backup.collections)) {
    const collection = db.collection(collectionName);
    await collection.deleteMany({});
    if (Array.isArray(items) && items.length > 0) {
      await collection.insertMany(items as Record<string, unknown>[]);
    }
  }

  await db.collection("settings").updateOne(
    { key: "backup_runtime" },
    {
      $set: {
        key: "backup_runtime",
        value: {
          lastRestoreAt: now,
          lastRestoreBy: actor,
          restoredFrom: fileName
        }
      }
    },
    { upsert: true }
  );
}

export async function maybeRunScheduledBackup(actor: string) {
  const settings = await getBackupSettings();
  if (!settings?.enabled) {
    return;
  }
  const db = await getDb();
  const runtime = await db.collection("settings").findOne({ key: "backup_runtime" });
  const lastRunAt = runtime?.value?.lastRunAt ? new Date(String(runtime.value.lastRunAt)).getTime() : 0;
  const intervalMs = Math.max(1, settings.intervalHours) * 60 * 60 * 1000;
  if (Date.now() - lastRunAt < intervalMs) {
    return;
  }
  await createBackups(actor, "scheduled");
}

export const BACKUP_STORAGE_DIR = BACKUP_DIR;
