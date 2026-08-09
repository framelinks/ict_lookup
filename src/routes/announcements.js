const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/announcements — public
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name AS posted_by_name FROM announcements a
       LEFT JOIN users u ON a.posted_by = u.id ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
});

// POST /api/announcements — Admin only
router.post('/', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body are required.' });

    const result = await pool.query(
      'INSERT INTO announcements (title, body, posted_by) VALUES ($1, $2, $3) RETURNING *',
      [title, body, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

// DELETE /api/announcements/:id — Admin only
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Announcement not found.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete announcement.' });
  }
});

module.exports = router;
