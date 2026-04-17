
const Database = require('better-sqlite3');
const fs = require('fs');

const dbFiles = ['database.sqlite', 'data.db', 'filings.db'];

dbFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`\n--- Checking ${file} ---`);
    try {
      const db = new Database(file);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      console.log("Tables:", tables.map(t => t.name).join(', '));
      
      if (tables.some(t => t.name === 'filings')) {
        const filings = db.prepare("SELECT id, ticker, formType, status, error, audioBase64, shortsAudioBase64, videoPath FROM filings").all();
        filings.forEach(f => {
          console.log(`\nFiling: ${f.ticker} ${f.formType} (${f.status})`);
          console.log(`Audio: ${f.audioBase64 ? f.audioBase64.length : 0} chars`);
          console.log(`Shorts Audio: ${f.shortsAudioBase64 ? f.shortsAudioBase64.length : 0} chars`);
          console.log(`Video Path: ${f.videoPath}`);
          if (f.error) console.log(`Error: ${f.error}`);
        });
      }
      db.close();
    } catch (err) {
      console.log(`Error checking ${file}: ${err.message}`);
    }
  } else {
    console.log(`\n--- ${file} does not exist ---`);
  }
});
