import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);

async function clean() {
  console.log("Cleaning SQLite database...");
  try {
    console.log("Dropping tables...");
    sqlite.exec("DROP TABLE IF EXISTS filings");
    sqlite.exec("DROP TABLE IF EXISTS tickers");
    console.log("Database cleaned successfully. Tables will be recreated on next server start.");
  } catch (e: any) {
    console.error("Error cleaning database:", e.message);
    process.exit(1);
  }
}

clean().catch(console.error);
