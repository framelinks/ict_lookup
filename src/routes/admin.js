const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('Admin'));

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// PATCH /api/admin/users/:id/role — promote/demote a user (e.g. to Staff or Admin)
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['User', 'Staff', 'Admin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'User', 'Staff', or 'Admin'." });
    }
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
      [role, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// GET /api/admin/stats — basic dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [users, tickets, ticketsByStatus, bookings, bookingsByStatus, items] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM tickets'),
      pool.query('SELECT status, COUNT(*) FROM tickets GROUP BY status'),
      pool.query('SELECT COUNT(*) FROM bookings'),
      pool.query('SELECT status, COUNT(*) FROM bookings GROUP BY status'),
      pool.query('SELECT COUNT(*) FROM items')
    ]);

    res.json({
      total_users: parseInt(users.rows[0].count, 10),
      total_tickets: parseInt(tickets.rows[0].count, 10),
      tickets_by_status: ticketsByStatus.rows,
      total_bookings: parseInt(bookings.rows[0].count, 10),
      bookings_by_status: bookingsByStatus.rows,
      total_items: parseInt(items.rows[0].count, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;
