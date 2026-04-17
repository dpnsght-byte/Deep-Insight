import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);

async function wipe() {
  console.log("Wiping SQLite database...");
  try {
    console.log("Cleaning tickers...");
    sqlite.prepare("DELETE FROM tickers").run();
    console.log("Cleaning filings...");
    sqlite.prepare("DELETE FROM filings").run();
    console.log("Database wiped successfully.");
  } catch (e: any) {
    console.error("Error wiping database:", e.message);
  }
}

wipe().catch(console.error);
