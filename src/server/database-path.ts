import path from "node:path";

/** The demo database file; DATABASE_PATH overrides it. */
export function databasePath(): string {
  return path.resolve(process.env.DATABASE_PATH ?? "data/demo.db");
}
