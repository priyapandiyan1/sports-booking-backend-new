/**
 * create-admin.js
 * Run once with:  node create-admin.js
 * Creates an admin user + adds missing columns if needed.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db/connection');

const ADMIN_NAME     = 'Admin';
const ADMIN_EMAIL    = 'admin@sportshub.com';
const ADMIN_PASSWORD = 'admin123';   // ← change this if you want

async function run() {
  try {
    // 1. Add password + role columns if they don't exist yet (SQLite-safe)
    try {
      await pool.query("ALTER TABLE users ADD COLUMN password TEXT");
      console.log("✓ Added 'password' column to users");
    } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('Duplicate column')) {
        console.log("  password column already exists (ok)");
      }
    }

    try {
      await pool.query("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      console.log("✓ Added 'role' column to users");
    } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('Duplicate column')) {
        console.log("  role column already exists (ok)");
      }
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // 3. Try to insert admin user
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [ADMIN_EMAIL]);

    if (existing.length > 0) {
      // Update existing user to admin role + set password
      await pool.query(
        "UPDATE users SET role = 'admin', password = ?, name = ? WHERE email = ?",
        [hashedPassword, ADMIN_NAME, ADMIN_EMAIL]
      );
      console.log(`✓ Updated existing user '${ADMIN_EMAIL}' to admin role.`);
    } else {
      // Insert new admin
      await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')",
        [ADMIN_NAME, ADMIN_EMAIL, hashedPassword]
      );
      console.log(`✓ Created new admin user: ${ADMIN_EMAIL}`);
    }

    console.log('\n========================================');
    console.log('  Admin credentials created!');
    console.log('  Email   :', ADMIN_EMAIL);
    console.log('  Password:', ADMIN_PASSWORD);
    console.log('  Login at: http://localhost:5173/admin/login');
    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
