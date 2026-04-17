import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);

console.log("Initializing database schema...");

sqlite.exec("CREATE TABLE IF NOT EXISTS tickers (id TEXT PRIMARY KEY, symbol TEXT UNIQUE, name TEXT, addedAt TEXT, addedBy TEXT, generatePodcast INTEGER DEFAULT 1, generateShorts INTEGER DEFAULT 1);");
sqlite.exec("CREATE TABLE IF NOT EXISTS filings (id TEXT PRIMARY KEY, ticker TEXT, formType TEXT, filingDate TEXT, accessionNumber TEXT, url TEXT, rawContent TEXT, summary TEXT, podcastScript TEXT, shortsScript TEXT, audioBase64 TEXT, shortsAudioBase64 TEXT, shortsVideoBase64 TEXT, status TEXT, error TEXT, createdAt TEXT, companyName TEXT, processingStartedAt TEXT);");

console.log("Seeding initial tickers...");
const now = new Date().toISOString();
sqlite.prepare("INSERT OR IGNORE INTO tickers (id, symbol, name, addedAt, addedBy) VALUES (?, ?, ?, ?, ?)")
  .run('1', 'GE', 'General Electric', now, 'system');
sqlite.prepare("INSERT OR IGNORE INTO tickers (id, symbol, name, addedAt, addedBy) VALUES (?, ?, ?, ?, ?)")
  .run('2', 'MSFT', 'Microsoft', now, 'system');

console.log("Database initialized successfully.");
process.exit(0);
