const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { notify } = require('../utils/notify');

const router = express.Router();
router.use(authenticateToken);

// POST /api/bookings — request an equipment/room reservation
router.post('/', async (req, res) => {
  try {
    const { item_id, start_time, end_time, purpose } = req.body;
    if (!item_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'item_id, start_time, and end_time are required.' });
    }
    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: 'end_time must be after start_time.' });
    }

    const itemCheck = await pool.query('SELECT * FROM items WHERE id = $1', [item_id]);
    if (!itemCheck.rows[0]) return res.status(404).json({ error: 'Item not found.' });
    if (itemCheck.rows[0].status !== 'Available') {
      return res.status(400).json({ error: `Item is currently '${itemCheck.rows[0].status}' and cannot be booked.` });
    }

    // Check for overlapping Pending or Approved bookings on the same item.
    const overlapCheck = await pool.query(
      `SELECT id FROM bookings
       WHERE item_id = $1 AND status IN ('Pending', 'Approved')
       AND (start_time, end_time) OVERLAPS ($2::timestamp, $3::timestamp)`,
      [item_id, start_time, end_time]
    );
    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({ error: 'This item is already booked or pending approval for that time window.' });
    }

    const result = await pool.query(
      `INSERT INTO bookings (user_id, item_id, start_time, end_time, purpose)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, item_id, start_time, end_time, purpose || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Postgres exclusion-constraint violation (belt-and-braces vs. the check above)
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Double-booking conflict — this slot was just taken.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// GET /api/bookings — users see their own; staff/admin see all
router.get('/', async (req, res) => {
  try {
    const { status, item_id } = req.query;
    let query = `SELECT b.*, i.name AS item_name, i.type AS item_type, u.name AS user_name
                 FROM bookings b JOIN items i ON b.item_id = i.id JOIN users u ON b.user_id = u.id`;
    const params = [];
    const conditions = [];

    if (req.user.role === 'User') {
      params.push(req.user.id);
      conditions.push(`b.user_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (item_id) {
      params.push(item_id);
      conditions.push(`b.item_id = $${params.length}`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY b.start_time DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

// PATCH /api/bookings/:id/approve — Staff/Admin only
router.patch('/:id/approve', requireRole('Admin', 'Staff'), async (req, res) => {
  try {
    const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!booking.rows[0]) return res.status(404).json({ error: 'Booking not found.' });

    // Re-check for conflicting approved bookings before flipping to Approved.
    const conflict = await pool.query(
      `SELECT id FROM bookings WHERE item_id = $1 AND status = 'Approved' AND id != $2
       AND (start_time, end_time) OVERLAPS ($3::timestamp, $4::timestamp)`,
      [booking.rows[0].item_id, req.params.id, booking.rows[0].start_time, booking.rows[0].end_time]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot approve — conflicts with an already-approved booking.' });
    }

    const result = await pool.query(
      `UPDATE bookings SET status = 'Approved' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await notify(pool, result.rows[0].user_id, `Your booking #${result.rows[0].id} was approved.`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve booking.' });
  }
});

// PATCH /api/bookings/:id/reject — Staff/Admin only
router.patch('/:id/reject', requireRole('Admin', 'Staff'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'Rejected' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found.' });
    await notify(pool, result.rows[0].user_id, `Your booking #${result.rows[0].id} was rejected.`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject booking.' });
  }
});

// PATCH /api/bookings/:id/cancel — booking owner can cancel their own pending/approved booking
router.patch('/:id/cancel', async (req, res) => {
  try {
    const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!booking.rows[0]) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.rows[0].user_id !== req.user.id && req.user.role === 'User') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const result = await pool.query(
      `UPDATE bookings SET status = 'Cancelled' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel booking.' });
  }
});

module.exports = router;
