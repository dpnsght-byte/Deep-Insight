
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);

const filings = sqlite.prepare("SELECT id, ticker, status, podcastScript, shortsScript FROM filings WHERE status = 'failed'").all();
console.log(JSON.stringify(filings, null, 2));
