
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data.db');
const sqlite = new Database(dbPath);

const tickers = sqlite.prepare("SELECT * FROM tickers").all();
const filings = sqlite.prepare("SELECT id, ticker, status FROM filings").all();

console.log('--- TICKERS ---');
console.log(JSON.stringify(tickers, null, 2));
console.log('--- FILINGS ---');
console.log(JSON.stringify(filings, null, 2));
sqlite.close();
