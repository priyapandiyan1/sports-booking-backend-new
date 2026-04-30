const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

async function addSports() {
  const db = await open({ filename: './db/database.sqlite', driver: sqlite3.Database });

  await db.run(
    "INSERT OR IGNORE INTO sports (id, name, description, price_per_hour) VALUES (4, 'Chess', 'Strategic board game with premium chess sets.', 50.00)"
  );
  await db.run(
    "INSERT OR IGNORE INTO sports (id, name, description, price_per_hour) VALUES (5, 'Table Tennis', 'Professional table tennis with tournament-grade tables.', 80.00)"
  );

  const rows = await db.all('SELECT id, name, price_per_hour FROM sports ORDER BY id');
  console.log('All sports:', JSON.stringify(rows, null, 2));
  process.exit(0);
}

addSports().catch(e => { console.error(e); process.exit(1); });
