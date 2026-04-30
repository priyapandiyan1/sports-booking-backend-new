require('dotenv').config();
const mysql = require('mysql2/promise');
const { useMysql } = require('./connection');

const usersSql = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const sportsSql = `
  CREATE TABLE IF NOT EXISTS sports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_per_hour DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const bookingsSql = `
  CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sport_id INT NOT NULL,
    place VARCHAR(255),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
  )`;

const groupsSql = `
  CREATE TABLE IF NOT EXISTS groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sport_id INT NOT NULL,
    admin_id INT NOT NULL,
    place VARCHAR(255) NOT NULL,
    game_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_players INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

const groupRequestsSql = `
  CREATE TABLE IF NOT EXISTS group_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_request (group_id, user_id)
  )`;

const usersSqlLite = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const sportsSqlLite = `
  CREATE TABLE IF NOT EXISTS sports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_per_hour DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const bookingsSqlLite = `
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INT NOT NULL,
    sport_id INT NOT NULL,
    place VARCHAR(255),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_hours REAL NOT NULL DEFAULT 0,
    total_price DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
  )`;

const groupsSqlLite = `
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sport_id INT NOT NULL,
    admin_id INT NOT NULL,
    place VARCHAR(255) NOT NULL,
    game_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_players INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

const groupRequestsSqlLite = `
  CREATE TABLE IF NOT EXISTS group_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
  )`;

async function migrateSqlite(pool) {
  try {
    await pool.query('ALTER TABLE bookings ADD COLUMN total_hours REAL NOT NULL DEFAULT 0');
    console.log('SQLite: added total_hours column');
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) {
      console.log('SQLite total_hours migration:', e.message);
    }
  }
}

async function migrateMysql(conn) {
  try {
    await conn.query(
      'ALTER TABLE bookings ADD COLUMN total_hours DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER end_time'
    );
    console.log('MySQL: added total_hours column');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.log('MySQL total_hours migration:', e.message);
    }
  }
}

async function initMysql() {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
  const user = process.env.DB_USER || process.env.MYSQL_USER || 'root';
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '';
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'sports_booking_db';

  console.log('Connecting to MySQL...');
  const bootstrap = await mysql.createConnection({ host, user, password, multipleStatements: true });
  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\``);
  await bootstrap.end();

  const conn = await mysql.createConnection({
    host,
    user,
    password,
    database,
    multipleStatements: true,
  });

  console.log('Creating tables...');
  await conn.query(usersSql);
  await conn.query(sportsSql);
  await conn.query(bookingsSql);
  await conn.query(groupsSql);
  await conn.query(groupRequestsSql);
  await migrateMysql(conn);

  console.log('Seeding sports...');
  await conn.query(`
    INSERT IGNORE INTO sports (id, name, description, price_per_hour)
    VALUES
      (1, 'Tennis', 'Standard indoor tennis court.', 100.00),
      (2, 'Basketball', 'Full-size indoor basketball court.', 100.00),
      (3, 'Badminton', 'Professional badminton court with synthetic flooring.', 100.00)
  `);

  console.log('Seeding users...');
  await conn.query(`
    INSERT IGNORE INTO users (id, email, name, phone)
    VALUES
      (1, 'john.doe@email.com', 'John Doe', '123-456-7890'),
      (2, 'jane.smith@email.com', 'Jane Smith', '098-765-4321')
  `);

  console.log('Sample booking...');
  try {
    await conn.query(`
      INSERT INTO bookings (user_id, sport_id, place, booking_date, start_time, end_time, total_hours, total_price, status)
      VALUES (1, 1, 'Central Court', CURDATE(), '10:00:00', '12:00:00', 2, 200.00, 'confirmed')
    `);
    console.log('Inserted sample booking.');
  } catch (e) {
    console.log('Sample booking skipped:', e.message);
  }

  await conn.end();
  console.log('MySQL initialization completed.');
}

async function initSqlite() {
  const pool = require('./connection');
  console.log('Connecting to SQLite...');
  await pool.query('PRAGMA foreign_keys = ON;');

  await pool.query(usersSqlLite);
  await pool.query(sportsSqlLite);
  await pool.query(bookingsSqlLite);
  await pool.query(groupsSqlLite);
  await pool.query(groupRequestsSqlLite);
  await migrateSqlite(pool);

  await pool.query(`
    INSERT OR IGNORE INTO sports (id, name, description, price_per_hour)
    VALUES
      (1, 'Tennis', 'Standard indoor tennis court.', 100.00),
      (2, 'Basketball', 'Full-size indoor basketball court.', 100.00),
      (3, 'Badminton', 'Professional badminton court with synthetic flooring.', 100.00)
  `);

  await pool.query(`
    INSERT OR IGNORE INTO users (id, email, name, phone)
    VALUES
      (1, 'john.doe@email.com', 'John Doe', '123-456-7890'),
      (2, 'jane.smith@email.com', 'Jane Smith', '098-765-4321')
  `);

  try {
    await pool.query(`
      INSERT INTO bookings (user_id, sport_id, place, booking_date, start_time, end_time, total_hours, total_price, status)
      VALUES (1, 1, 'Central Court', date('now'), '10:00:00', '12:00:00', 2, 200.00, 'confirmed')
    `);
    console.log('Inserted sample booking.');
  } catch (e) {
    console.log('Sample booking skipped.');
  }

  console.log('SQLite initialization completed.');
}

async function main() {
  try {
    if (useMysql) {
      await initMysql();
    } else {
      await initSqlite();
    }
    process.exit(0);
  } catch (err) {
    console.error('init_db failed:', err);
    process.exit(1);
  }
}

main();
