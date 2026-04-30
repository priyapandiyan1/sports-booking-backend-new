const mysql = require('mysql2/promise');

const config = {
  host: 'localhost',
  user: 'root',
  password: 'Priya@123',
  database: 'sports_booking_db'
};

async function alterDB() {
  try {
    const connection = await mysql.createConnection(config);
    // Add place column if it doesn't already exist
    try {
      await connection.query('ALTER TABLE bookings ADD COLUMN place VARCHAR(255);');
      console.log('Added place column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Place column already exists');
      } else {
        throw e;
      }
    }
    process.exit(0);
  } catch (error) {
    console.error('Error during db alteration:', error);
    process.exit(1);
  }
}

alterDB();
