const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

async function addCricket() {
  const db = await open({ filename: './db/database.sqlite', driver: sqlite3.Database });

  await db.run(
    "INSERT OR IGNORE INTO sports (id, name, description, price_per_hour) VALUES (6, 'Cricket', 'Outdoor cricket ground with proper pitches and lighting.', 150.00)"
  );

  const rows = await db.all('SELECT id, name, price_per_hour FROM sports ORDER BY id');
  console.log('All sports:', JSON.stringify(rows, null, 2));
  process.exit(0);
}

addCricket().catch(e => { console.error(e); process.exit(1); });
