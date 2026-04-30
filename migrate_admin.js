/**
 * run: node migrate_admin.js
 * Adds password + role columns to users table,
 * and seeds an admin account: admin@sportshub.com / admin123
 */
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

async function migrate() {
  const db = await open({ filename: './db/database.sqlite', driver: sqlite3.Database });

  // ── Add password column ────────────────────────────────────────────────────
  try {
    await db.run('ALTER TABLE users ADD COLUMN password TEXT');
    console.log('✅ Added column: password');
  } catch (e) {
    console.log('ℹ️  password column already exists');
  }

  // ── Add role column ────────────────────────────────────────────────────────
  try {
    await db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    console.log('✅ Added column: role');
  } catch (e) {
    console.log('ℹ️  role column already exists');
  }

  // ── Seed admin user ────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const existing = await db.get("SELECT id FROM users WHERE email = 'admin@sportshub.com'");
  if (existing) {
    await db.run(
      "UPDATE users SET password = ?, role = 'admin' WHERE email = 'admin@sportshub.com'",
      [hashedPassword]
    );
    console.log('✅ Updated existing admin@sportshub.com to role=admin');
  } else {
    await db.run(
      "INSERT INTO users (name, email, password, role) VALUES ('Admin', 'admin@sportshub.com', ?, 'admin')",
      [hashedPassword]
    );
    console.log('✅ Created admin user: admin@sportshub.com');
  }

  const allUsers = await db.all('SELECT id, name, email, role FROM users ORDER BY id');
  console.log('\n📋 All users:\n', JSON.stringify(allUsers, null, 2));

  console.log('\n🔑 Admin credentials:');
  console.log('   Email:    admin@sportshub.com');
  console.log('   Password: admin123');

  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
