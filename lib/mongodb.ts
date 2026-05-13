import { MongoClient, type Db } from "mongodb";

const rawUri = process.env.MONGODB_URI;
const APP_DB_NAME = process.env.TELEIR_DB_NAME?.trim() || "teleirv2";

function extractDbName(uri: string) {
  try {
    const parsed = new URL(uri);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
    return dbName || null;
  } catch {
    const withoutQuery = uri.split("?")[0] || "";
    const lastSlash = withoutQuery.lastIndexOf("/");
    if (lastSlash < 0) return null;
    const dbName = withoutQuery.slice(lastSlash + 1).trim();
    return dbName || null;
  }
}

const LEGACY_DB_NAME =
  process.env.TELEIR_LEGACY_DB_NAME?.trim() ||
  (rawUri ? extractDbName(rawUri) : null) ||
  "teleir";

function forceDatabaseName(uri: string, dbName: string) {
  try {
    const parsed = new URL(uri);
    parsed.pathname = `/${encodeURIComponent(dbName)}`;
    return parsed.toString();
  } catch {
    const [base, query = ""] = uri.split("?");
    const slashIndex = base.lastIndexOf("/");
    const withoutDb = slashIndex > "mongodb://".length ? base.slice(0, slashIndex) : base;
    return `${withoutDb}/${dbName}${query ? `?${query}` : ""}`;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _teleirMongoPromise: Promise<MongoClient> | undefined;
}

function createClient() {
  if (!rawUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  const mongoUri = forceDatabaseName(rawUri, APP_DB_NAME);
  const client = new MongoClient(mongoUri);
  return client.connect();
}

function withRecovery(promise: Promise<MongoClient>) {
  promise.catch(() => {
    global._teleirMongoPromise = undefined;
  });
  return promise;
}

export function getTeleirDbName() {
  return APP_DB_NAME;
}

export function getTeleirLegacyDbName() {
  return LEGACY_DB_NAME;
}

export async function getTeleirDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(APP_DB_NAME);
}

export async function getTeleirLegacyDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(LEGACY_DB_NAME);
}

export default function getMongoClientPromise() {
  if (!global._teleirMongoPromise) {
    global._teleirMongoPromise = withRecovery(createClient());
  }

  return global._teleirMongoPromise;
}
