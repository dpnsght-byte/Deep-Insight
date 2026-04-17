import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

console.log("Resetting ALL filings to pending...");
const result = sqlite.prepare("UPDATE filings SET status = 'pending', error = NULL").run();
console.log(`Updated ${result.changes} filings.`);
