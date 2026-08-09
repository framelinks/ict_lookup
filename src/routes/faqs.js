const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ---- FAQs ----

// GET /api/faqs — public (no auth) so anyone can access training resources
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM faqs ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch FAQs.' });
  }
});

// POST /api/faqs — Admin only
router.post('/', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'question and answer are required.' });

    const result = await pool.query(
      'INSERT INTO faqs (question, answer) VALUES ($1, $2) RETURNING *',
      [question, answer]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create FAQ.' });
  }
});

// DELETE /api/faqs/:id — Admin only
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM faqs WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'FAQ not found.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete FAQ.' });
  }
});

module.exports = router;
