import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

const LOG_DIR = process.env.TELEIR_LOG_DIR || "/var/www/teleir/storage/logs";
const LOG_FILE = path.join(LOG_DIR, "teleir.log");

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "string" && item.length > 500) {
        return `${item.slice(0, 500)}...`;
      }
      return item;
    });
  } catch {
    return String(value);
  }
}

export async function writeTeleirLog(level: "info" | "warn" | "error", scope: string, message: string, meta?: unknown) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}${meta === undefined ? "" : ` ${safeJson(meta)}`}\n`;
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Logging must never break production flows.
  }
}

export async function readTeleirLogTail(maxBytes = 200_000) {
  const content = await readFile(LOG_FILE, "utf8").catch(() => "");
  return content.slice(-Math.max(1, maxBytes));
}
