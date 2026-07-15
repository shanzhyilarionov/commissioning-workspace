import Database from "@tauri-apps/plugin-sql";

let databasePromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(
      "sqlite:commissioning-workspace.db",
    ).then(async (database) => {
      await database.execute("PRAGMA foreign_keys = ON");
      return database;
    });
  }

  return databasePromise;
}