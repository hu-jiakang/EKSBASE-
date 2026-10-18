import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const configuredPath = String(
  process.env.AUTH_DATABASE_PATH || "./data/eksbase-auth.db"
).trim();

const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const authDb = new DatabaseSync(databasePath);

authDb.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS standalone_credentials (
    employee_no TEXT PRIMARY KEY COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT DEFAULT '',
    must_change_password INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_standalone_credentials_active
    ON standalone_credentials(is_active);
`);

console.log(`[AUTH DATABASE] SQLite connected: ${databasePath}`);
console.log("[AUTH DATABASE] standalone_credentials table ready");
