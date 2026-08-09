require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@church.org';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
    const hashed = await bcrypt.hash(adminPassword, 10);

    await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ('Platform Admin', $1, $2, 'Admin')
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail, hashed]
    );

    await pool.query(`
      INSERT INTO items (name, type, description) VALUES
        ('Main Auditorium', 'Room', 'Seats 500, full AV setup'),
        ('Conference Room A', 'Room', 'Seats 12, projector + whiteboard'),
        ('Wireless Handheld Mic Set', 'Equipment', '4x wireless mics with receiver'),
        ('Portable Projector', 'Equipment', 'HDMI + VGA input')
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      INSERT INTO faqs (question, answer) VALUES
        ('How do I request ICT support?', 'Log in, go to My Requests, and click New Request. Describe the issue and submit.'),
        ('How far in advance can I book a room?', 'Bookings can be made any time in the future, subject to availability and admin approval.'),
        ('What happens if my equipment booking conflicts with another one?', 'The system automatically blocks overlapping approved or pending bookings for the same item.')
      ON CONFLICT DO NOTHING
    `);

    console.log(`Seed complete. Admin login: ${adminEmail} / ${adminPassword}`);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
