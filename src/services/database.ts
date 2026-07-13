import Database from "@tauri-apps/plugin-sql";

let databasePromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(
      "sqlite:commissioning-workspace.db",
    );
  }

  return databasePromise;
}