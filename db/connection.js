const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbPromise;

async function getDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: path.join(__dirname, 'database.sqlite'),
      driver: sqlite3.Database,
    }).then(db => {
      console.log('Database connected');
      return db;
    });
  }
  return dbPromise;
}

module.exports = getDb;
