import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const migrationsFolder = path.join(process.cwd(), "drizzle");

/** Opens (or creates) a SQLite database and brings its schema up to date. */
export function openDb(file: string): Db {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

/** A fresh, migrated in-memory database; each test file gets its own. */
export function createTestDb(): Db {
  return openDb(":memory:");
}

export function closeDb(db: Db): void {
  db.$client.close();
}
