const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { notify } = require('../utils/notify');

const router = express.Router();
const VALID_STATUSES = ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
const VALID_TRANSITIONS = {
  Pending: ['Assigned'],
  Assigned: ['In Progress', 'Pending'],
  'In Progress': ['Resolved', 'Assigned'],
  Resolved: ['Closed', 'In Progress'],
  Closed: []
};

router.use(authenticateToken);

// POST /api/tickets — any authenticated user submits a request
router.post('/', async (req, res) => {
  try {
    const { category, description, priority } = req.body;
    if (!category || !description) {
      return res.status(400).json({ error: 'category and description are required.' });
    }

    const result = await pool.query(
      `INSERT INTO tickets (user_id, category, description, priority)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, category, description, priority || 'Normal']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

// GET /api/tickets — users see their own; staff/admin see all (optionally filtered)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT t.*, u.name AS requester_name, a.name AS assignee_name FROM tickets t ' +
      'JOIN users u ON t.user_id = u.id LEFT JOIN users a ON t.assigned_to = a.id';
    const params = [];
    const conditions = [];

    if (req.user.role === 'User') {
      params.push(req.user.id);
      conditions.push(`t.user_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tickets.' });
  }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.name AS requester_name, a.name AS assignee_name FROM tickets t
       JOIN users u ON t.user_id = u.id LEFT JOIN users a ON t.assigned_to = a.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    const ticket = result.rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    if (req.user.role === 'User' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ticket.' });
  }
});

// PATCH /api/tickets/:id/assign — Staff/Admin only
router.patch('/:id/assign', requireRole('Admin', 'Staff'), async (req, res) => {
  try {
    const { assigned_to } = req.body;
    if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' });

    const staffCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role IN ('Staff', 'Admin')`,
      [assigned_to]
    );
    if (!staffCheck.rows[0]) {
      return res.status(400).json({ error: 'assigned_to must be an existing Staff or Admin user.' });
    }

    const result = await pool.query(
      `UPDATE tickets SET assigned_to = $1, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [assigned_to, req.params.id]
    );
    const ticket = result.rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    await notify(pool, ticket.user_id, `Your ticket #${ticket.id} has been assigned.`);
    await notify(pool, assigned_to, `You have been assigned ticket #${ticket.id}.`);

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign ticket.' });
  }
});

// PATCH /api/tickets/:id/status — Staff/Admin only, enforces valid workflow transitions
router.patch('/:id/status', requireRole('Admin', 'Staff'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const current = await pool.query('SELECT status, user_id FROM tickets WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Ticket not found.' });

    const currentStatus = current.rows[0].status;
    if (!VALID_TRANSITIONS[currentStatus].includes(status)) {
      return res.status(400).json({
        error: `Cannot move ticket from '${currentStatus}' to '${status}'.`,
        allowed: VALID_TRANSITIONS[currentStatus]
      });
    }

    const result = await pool.query(
      `UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    const ticket = result.rows[0];
    await notify(pool, ticket.user_id, `Your ticket #${ticket.id} status changed to '${status}'.`);

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket status.' });
  }
});

module.exports = router;
