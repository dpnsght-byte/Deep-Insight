
import Database from 'better-sqlite3';
const sqlite = new Database('data.db');
const filings = sqlite.prepare("SELECT id, ticker, status, error FROM filings").all();
console.log(JSON.stringify(filings, null, 2));
