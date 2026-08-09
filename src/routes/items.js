const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/items — any authenticated user can browse equipment/rooms
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM items';
    const params = [];
    if (type) {
      params.push(type);
      query += ` WHERE type = $1`;
    }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

// POST /api/items — Admin only
router.post('/', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required.' });
    if (!['Equipment', 'Room'].includes(type)) {
      return res.status(400).json({ error: "type must be 'Equipment' or 'Room'." });
    }

    const result = await pool.query(
      'INSERT INTO items (name, type, description) VALUES ($1, $2, $3) RETURNING *',
      [name, type, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item.' });
  }
});

// PATCH /api/items/:id — Admin only
router.patch('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (status && !['Available', 'Maintenance', 'Retired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const result = await pool.query(
      `UPDATE items SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         status = COALESCE($3, status)
       WHERE id = $4 RETURNING *`,
      [name || null, description || null, status || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item.' });
  }
});

// DELETE /api/items/:id — Admin only
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

module.exports = router;
