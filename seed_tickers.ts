
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data.db');
const sqlite = new Database(dbPath);

const tickers = ['NFLX', 'CRM', 'META'];

for (const symbol of tickers) {
  const id = Math.random().toString(36).substring(2, 11);
  try {
    sqlite.prepare(`
      INSERT INTO tickers (id, symbol, addedAt, addedBy, generatePodcast, generateShorts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, symbol, new Date().toISOString(), "system", 1, 1);
    console.log(`Added ${symbol}`);
  } catch (e) {
    console.log(`${symbol} already exists or error: ${e.message}`);
  }
}

sqlite.close();
